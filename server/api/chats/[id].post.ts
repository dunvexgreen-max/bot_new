import type { UIMessage } from 'ai'
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText, smoothStream, stepCountIs, streamText } from 'ai'
import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import { anthropic } from '@ai-sdk/anthropic'
import type { GoogleLanguageModelOptions } from '@ai-sdk/google'
import { google } from '@ai-sdk/google'
import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai'
import { openai } from '@ai-sdk/openai'
import {
  saveDebtTool,
  saveKnowledgeTool,
  searchKnowledgeTool,
  updateKnowledgeTool,
  deleteKnowledgeTool,
  searchTool,
  syncFirestoreToSupabaseTool,
  queryAppDatabaseTool,
  saveUserMemoryTool,
  searchUserMemoryTool
} from '../../utils/ai-tools'

/**
 * Helper: Download file từ URL và convert thành Uint8Array
 */
async function fetchFileAsBuffer(url: string): Promise<Uint8Array> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`)
    }
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  }
  catch (error) {
    console.error('Error fetching file:', error)
    throw new Error(`Could not download file from URL: ${url}`)
  }
}

/**
 * Helper: Convert Buffer/Uint8Array to base64 string
 */
function bufferToBase64(buffer: Uint8Array): string {
  let binary = ''
  const len = buffer.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]!)
  }
  return btoa(binary)
}
defineRouteMeta({
  openAPI: {
    description: 'Chat with AI.',
    tags: ['ai']
  }
})

/**
 * Process file URLs in messages to make them compatible with Gemini API
 */
async function processMessagesForAI(messages: UIMessage[]) {
  const processedMessages = await Promise.all(
    messages.map(async (message) => {
      if (!message.parts) return message

      const processedParts = await Promise.all(
        message.parts.map(async (part: any) => {
          // Handle file/image parts with URLs
          if ((part.type === 'file' || part.type === 'image') && part.url) {
            try {
              const mimeType = part.mediaType || 'application/octet-stream'

              // For images, can use URL directly
              if (mimeType.startsWith('image/')) {
                return {
                  ...part,
                  type: 'image',
                  mimeType,
                  url: part.url
                }
              }

              // For non-image files (PDF, CSV, etc.), download and convert to base64
              const buffer = await fetchFileAsBuffer(part.url)
              const base64 = bufferToBase64(buffer)

              return {
                ...part,
                type: 'document',
                mimeType,
                base64,
                data: buffer
              }
            }
            catch (error) {
              console.error('Failed to process file for Gemini:', error)
              // Return original part if processing fails
              return part
            }
          }
          return part
        })
      )

      return {
        ...message,
        parts: processedParts
      }
    })
  )

  return processedMessages
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const { model, messages } = await readValidatedBody(event, z.object({
    model: z.string().refine(value => MODELS.some(m => m.value === value), {
      message: 'Invalid model'
    }),
    messages: z.array(z.custom<UIMessage>())
  }).parse)

  const chat = await db.query.chats.findFirst({
    where: () => and(
      eq(schema.chats.id, id as string),
      eq(schema.chats.userId, session.user?.id || session.id)
    ),
    with: {
      messages: true
    }
  })
  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GOOGLE_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_API_KEY
  }

  if (!chat.title) {
    const { text: title } = await generateText({
      model: google('gemini-2.5-flash'),
      system: `You are a title generator for a chat:
          - Generate a short title based on the first user's message
          - The title should be less than 30 characters long
          - The title should be a summary of the user's message
          - Do not use quotes (' or ") or colons (:) or any other punctuation
          - Do not use markdown, just plain text`,
      prompt: JSON.stringify(messages[0])
    })

    await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, id as string))
  }

  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'user' && messages.length > 1) {
    await db.insert(schema.messages).values({
      chatId: id as string,
      role: 'user',
      parts: lastMessage.parts
    })
  }

  const supabase = useSupabase()
  const { data: promptData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'system_prompt')
    .single()
  const customPrompt = promptData?.value || 'You are a knowledgeable and helpful AI assistant.'

  // Process file URLs in messages to make them compatible with AI models
  const processedMessages = await processMessagesForAI(messages)

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: model.startsWith('google/')
          ? google(model.replace('google/', ''))
          : model.startsWith('anthropic/')
            ? anthropic(model.replace('anthropic/', ''))
            : openai(model.replace('openai/', '')),
        system: `${customPrompt} Your goal is to provide clear, accurate, and well-structured responses.

**ĐỊNH DANH ĐẶC QUYỀN (ANH THÔNG - SUPER ADMIN):**
- Trong khung chat hiện tại (trên Web app), người đang nói chuyện với bạn chính là **ANH THÔNG** - Sếp và là chủ sở hữu của toàn bộ hệ thống.
- BÃI BỎ HOÀN TOÀN quy tắc xin email! NGHIÊM CẤM đòi anh Thông cung cấp email đăng nhập.
- Anh Thông có toàn quyền sinh sát tuyệt đối: Khi anh ra lệnh đồng bộ, hãy đồng bộ TẤT CẢ. Khi anh tra cứu (queryAppDatabaseTool), hãy âm thầm điền mật mã \`ALL_ADMIN\` vào trường \`user_email\` để xả trạm, đưa toàn bộ dữ liệu của tất cả người dùng và đối tác về cho anh báo cáo mà không bị cản lại.
- Các quy tắc hỏi email vớ vẩn chỉ được dùng cho khách hàng vô danh trên Zalo ở các luồng xử lý khác. Ở đây, bạn là Thư ký báo cáo Thống Kê Tổng (Tổng quản lý).

**TRAINING & KNOWLEDGE:**
- You can save new information provided by Thong (like tax laws, product info, or debt lists) using the **save_knowledge** and **save_debt** tools.
- When Thong uploads a file and says "nạp kiến thức" or "lưu lại", parse the information and save it.
- Use **search_knowledge** to find relevant information from the database to answer.
- You can also **update_knowledge** or **delete_knowledge** if Thong tells you a price has changed or some info is outdated (you must use search_knowledge first to find the ID).

**FORMATTING RULES (CRITICAL):**
- ABSOLUTELY NO MARKDOWN HEADINGS. Use **bold text** for section labels.
- Start all responses with content, never with a heading.

**WEB SEARCH:**
- Use ONLY when explicitly asked about recent events.

**RESPONSE QUALITY:**
- Be EXTRA CONCISE. Do not explain your calculations unless specifically asked.
- NEVER invent numbers. Be absolutely precise when summing up orders, debts or any values from the database. Calculate carefully before returning the final result.
- Do not repeat previous answers or apologize excessively. Get straight to the point.`,
        messages: await convertToModelMessages(processedMessages),
        tools: {
          chart: chartTool,
          weather: weatherTool,
          save_debt: saveDebtTool,
          save_knowledge: saveKnowledgeTool,
          search_knowledge: searchKnowledgeTool,
          update_knowledge: updateKnowledgeTool,
          delete_knowledge: deleteKnowledgeTool,
          search_web: searchTool,
          sync_firestore: syncFirestoreToSupabaseTool,
          query_database_app: queryAppDatabaseTool,
          save_user_memory: saveUserMemoryTool,
          search_user_memory: searchUserMemoryTool
        },
        providerOptions: {
          anthropic: {
            thinking: {
              type: 'enabled',
              budgetTokens: 2048
            }
          } satisfies AnthropicLanguageModelOptions,
          google: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: 'low'
            }
          } satisfies GoogleLanguageModelOptions,
          openai: {
            reasoningEffort: 'low',
            reasoningSummary: 'detailed'
          } satisfies OpenAILanguageModelResponsesOptions
        },
        stopWhen: stepCountIs(5),
        experimental_transform: smoothStream()
      })

      if (!chat.title) {
        writer.write({
          type: 'data-chat-title',
          data: { message: 'Generating title...' },
          transient: true
        })
      }

      writer.merge(result.toUIMessageStream({
        sendSources: true,
        sendReasoning: true
      }))
    },
    onFinish: async ({ messages }) => {
      await db.insert(schema.messages).values(messages.map(message => ({
        chatId: chat.id,
        role: message.role as 'user' | 'assistant',
        parts: message.parts
      })))
    }
  })

  return createUIMessageStreamResponse({
    stream
  })
})
