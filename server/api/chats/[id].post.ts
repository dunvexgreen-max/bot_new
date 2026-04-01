import { blob } from 'hub:blob'
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
  searchUserMemoryTool,
  fetchWebContentTool,
  fetchYoutubeTranscriptTool
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
 * Process file URLs in messages to make them compatible with AI models.
 * Download files/images on server side as standard AI SDK models expect data or public URLs.
 */
async function processMessagesForAI(event: any, messages: UIMessage[]) {
  // Get request origin to handle relative URLs
  const { origin } = getRequestURL(event)

  console.log(`[AI] Processing ${messages.length} messages. Last message structure:`, JSON.stringify({
    role: messages[messages.length - 1]?.role,
    hasParts: !!messages[messages.length - 1]?.parts,
    partsCount: messages[messages.length - 1]?.parts?.length,
    hasAttachments: !!(messages[messages.length - 1] as any)?.experimental_attachments,
    attachmentsCount: (messages[messages.length - 1] as any)?.experimental_attachments?.length
  }, null, 2))

  const processedMessages = await Promise.all(
    messages.map(async (message: any) => {
      const originalParts = message.parts || []
      const experimentalAttachments = message.experimental_attachments || []
      
      // Combine parts and attachments into a unique list of candidate parts
      const candidateParts = [...originalParts]
      
      // Add experimental attachments that aren't already represented in parts
      for (const att of experimentalAttachments) {
        if (!candidateParts.some(p => p.url === att.url)) {
          candidateParts.push({
            type: att.contentType?.startsWith('image/') ? 'image' : 'file',
            url: att.url,
            mediaType: att.contentType,
            name: att.name
          })
        }
      }

      // If no candidate parts found, and we have simple content, create a text part
      if (candidateParts.length === 0) {
        const text = typeof message.content === 'string' ? message.content : (message.text || '')
        if (text) {
          candidateParts.push({ type: 'text', text })
        }
      }

      const processedParts = await Promise.all(
        candidateParts.map(async (part: any) => {
          if (part.type === 'text') return part

          // Only process parts with URLs that haven't been downloaded yet
          if ((part.url || part.pathname) && !part.image && !part.data) {
            try {
              const mimeType = part.mediaType || part.mimeType || 'application/octet-stream'
              let buffer: Uint8Array

              // Resolve pathname from hub URLs if missing
              if (!part.pathname && part.url?.includes('/_hub/blob/')) {
                part.pathname = part.url.split('/_hub/blob/')[1]?.split('?')[0]
              }

              if (part.pathname) {
                const blobEntry = await blob.get(part.pathname)
                if (blobEntry) {
                   const arrayBuffer = await blobEntry.arrayBuffer()
                   buffer = new Uint8Array(arrayBuffer)
                } else {
                   throw new Error(`Blob not found: ${part.pathname}`)
                }
              } 
              else {
                const absoluteUrl = part.url.startsWith('/') ? `${origin}${part.url}` : part.url
                buffer = await fetchFileAsBuffer(absoluteUrl)
              }

              // Return proper content part based on MIME type
              if (mimeType.startsWith('image/')) {
                return { type: 'image', image: buffer, mimeType }
              }
              return { type: 'file', data: buffer, mimeType }
            }
            catch (error) {
              console.error(`[AI] Error downloading part (${part.type}):`, (error as Error).message)
              // We return the raw part with URL as fallback, 
              // but the AI SDK might not know what to do with it unless we convert to attachment later
              return part 
            }
          }
          return part
        })
      )

      console.log(`[AI] Message processed: role=${message.role}, parts=${processedParts.length}`)
      
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

  const body = await readValidatedBody(event, z.object({
    model: z.string().refine(value => MODELS.some(m => m.value === value), {
      message: 'Invalid model'
    }),
    messages: z.array(z.custom<UIMessage>())
  }).parse)
  const { model, messages } = body
  console.log(`[AI-DEBUG] Model: ${model}, Messages Count: ${messages.length}`)
  if (messages && messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg) {
      console.log(`[AI-DEBUG] Last message keys: ${Object.keys(lastMsg).join(', ')}`)
      if (lastMsg.parts) {
        console.log(`[AI-DEBUG] Last message parts count: ${lastMsg.parts.length}`)
        lastMsg.parts.forEach((p: any, i: number) => {
          console.log(`[AI-DEBUG] Part ${i}: type=${p.type}, ${p.text ? 'text="'+p.text.substring(0, 20)+'..." ' : ''}${p.url ? 'url='+p.url : ''}`)
        })
      }
    }
  }

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

  const lastMessage = messages[messages.length - 1] as any
  if (lastMessage?.role === 'user') {
    // Normalize parts if they are missing but attachments exist
    // This ensures files are persisted to the database and can be rendered on reload
    if (!lastMessage.parts || lastMessage.parts.length === 0) {
      const attachments = lastMessage.experimental_attachments || lastMessage.files || []
      const text = lastMessage.content || lastMessage.text || lastMessage.message || ''
      
      if (attachments.length > 0) {
        lastMessage.parts = attachments.map((a: any) => ({
          type: a.contentType?.startsWith('image/') ? 'image' : 'file',
          url: a.url,
          mediaType: a.contentType || a.mediaType,
          name: a.name
        }))
        
        if (text) {
          lastMessage.parts.unshift({ type: 'text', text })
        }
      } else if (text) {
         lastMessage.parts = [{ type: 'text', text }]
      }
    }

    if (messages.length > 1) {
      await db.insert(schema.messages).values({
        chatId: id as string,
        role: 'user',
        parts: lastMessage.parts
      }).onConflictDoNothing()
    }
  }

  const supabase = useSupabase()
  const { data: promptData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'system_prompt')
    .single()
  const customPrompt = promptData?.value || 'You are a knowledgeable and helpful AI assistant.'

  // Process file URLs in messages to make them compatible with AI models
  const processedMessages = await processMessagesForAI(event, messages)

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

- NGHIÊM CẤM ĐOÁN MÒ NỘI DUNG TỆP: Bạn chỉ được phép trả lời dựa trên nội dung tệp nếu bạn thực sự "thấy" dữ liệu (binary/parts) của tệp đó. Nếu bạn chỉ thấy tên tệp mà không thấy dữ liệu bên trong, bạn phải báo ngay: "Dạ anh Thông, em thấy tệp [Tên file] nhưng chưa đọc được nội dung. Anh vui lòng đính kèm lại giúp em ạ."
- Khi có tệp đính kèm, hãy ưu tiên bóc tách dữ liệu từ tệp trước khi tra cứu kiến thức cũ.

**TRAINING & KNOWLEDGE:**
- You can save new information provided by Thong (like tax laws, product info, or debt lists) using the **save_knowledge** and **save_debt** tools.
- When Thong uploads a file and says "nạp kiến thức" or "lưu lại", parse the information and save it.
- Use **search_knowledge** to find relevant information from the database to answer.
- You can also **update_knowledge** or **delete_knowledge** if Thong tells you a price has changed or some info is outdated (you must use search_knowledge first to find the ID).

**FORMATTING RULES (CRITICAL):**
- ABSOLUTELY NO MARKDOWN HEADINGS. Use **bold text** for section labels.
- Start all responses with content, never with a heading.

**WEB SEARCH & CONTENT FETCHING:**
- Use **search_web** ONLY when explicitly asked about recent events or when you need to find information you don't have.
- Use **fetch_web_content** when a user shares a specific website URL (not YouTube) and you need to read its content to answer.
- Use **fetch_youtube_transcript** when a user shares a YouTube link. THIS IS THE ONLY WAY YOU CAN "SEE" WHAT IS IN THE VIDEO.

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
          search_user_memory: searchUserMemoryTool,
          fetch_web_content: fetchWebContentTool,
          fetch_youtube_transcript: fetchYoutubeTranscriptTool
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
