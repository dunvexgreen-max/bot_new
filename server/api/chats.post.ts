import type { UIMessage } from 'ai'
import { db, schema } from 'hub:db'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const { id, message } = await readValidatedBody(event, z.object({
    id: z.string(),
    message: z.custom<UIMessage>()
  }).parse)

  const [chat] = await db.insert(schema.chats).values({
    id,
    title: '',
    userId: session.user?.id || session.id
  }).returning()

  if (!chat) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create chat' })
  }

  const lastMessage = message as UIMessage & {
    parts?: any[]
    files?: any[]
    experimental_attachments?: any[]
    content?: string
    text?: string
    message?: string
  }
  if (!lastMessage.parts || lastMessage.parts.length === 0) {
    const attachments = lastMessage.experimental_attachments || lastMessage.files || []
    const text = lastMessage.content || lastMessage.text || lastMessage.message || ''

    if (attachments.length > 0) {
      lastMessage.parts = attachments.map((a: { url: string, contentType?: string, mediaType?: string, name: string }) => ({
        type: (a.contentType?.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
        url: a.url,
        mediaType: a.contentType || a.mediaType,
        name: a.name
      })) as any[]

      if (text) {
        lastMessage.parts.unshift({ type: 'text', text })
      }
    } else if (text) {
      lastMessage.parts = [{ type: 'text', text }]
    }
  }

  await db.insert(schema.messages).values({
    chatId: chat.id,
    role: 'user',
    parts: lastMessage.parts
  })

  return chat
})
