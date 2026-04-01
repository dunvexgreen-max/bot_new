import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { join } from 'path'

// Initialize Firebase Admin (lazy)
const getFirebaseAdmin = async () => {
  const importedModule = await import('firebase-admin')
  // Mở hộp ESM Module để lấy chính xác module cốt lõi (default export)
  const admin = importedModule.default || importedModule

  if (!admin.apps || admin.apps.length === 0) {
    try {
      const serviceAccount = JSON.parse(readFileSync(join(process.cwd(), 'firebase-service-account.json'), 'utf8'))
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      })
    } catch (e) {
      console.error('Firebase Admin init error:', e)
    }
  }
  return admin
}

export const saveDebtTool = tool({
  description: 'Save or update a customer\'s debt information in the database.',
  inputSchema: z.object({
    user_id_platform: z.string().describe('The Zalo or Facebook user ID of the customer.'),
    customer_name: z.string().describe('The name of the customer.'),
    amount: z.number().describe('The debt amount.'),
    due_date: z.string().optional().describe('Optional due date in YYYY-MM-DD format.'),
    description: z.string().optional().describe('Description of the debt.')
  }),
  execute: async ({ user_id_platform, customer_name, amount, due_date, description }) => {
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase
        .from('debts')
        .upsert({
          user_id_platform,
          customer_name,
          amount,
          due_date: due_date || null,
          description: description || ''
        }, { onConflict: 'user_id_platform' })
        .select()

      if (error) return { error: error.message }
      return { success: true, data }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }
})

export const saveKnowledgeTool = tool({
  description: 'Save product information, tax laws, or general knowledge to the database.',
  inputSchema: z.object({
    category: z.enum(['tax', 'product', 'general']).default('general').describe('The category of the knowledge.'),
    content: z.string().describe('The actual content/knowledge to store.'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Optional metadata (e.g., source, tags).')
  }),
  execute: async ({ category, content, metadata }) => {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        category,
        content,
        metadata: metadata || {}
      })
      .select()

    if (error) return { error: error.message }
    return { success: true, data }
  }
})

export const searchKnowledgeTool = tool({
  description: 'Search the knowledge base for relevant information to answer user questions about products, taxes, or debts.',
  inputSchema: z.object({
    query: z.string().describe('The search query or keywords.'),
    category: z.enum(['tax', 'product', 'general']).optional().describe('Optional category filter.')
  }),
  execute: async ({ query, category }) => {
    const supabase = useSupabase()
    let q = supabase
      .from('knowledge_base')
      .select('*')
      .ilike('content', `%${query}%`)

    if (category) {
      q = q.eq('category', category)
    }

    const { data, error } = await q.limit(5)

    if (error) return { error: error.message }
    return { success: true, results: data }
  }
})

export const updateKnowledgeTool = tool({
  description: 'Update existing product information, pricing, or knowledge in the database by its ID.',
  inputSchema: z.object({
    id: z.string().describe('The ID of the knowledge record to update (obtained from search_knowledge).'),
    category: z.enum(['tax', 'product', 'general']).optional().describe('Optional new category.'),
    content: z.string().optional().describe('The new updated content (e.g., new price, updated description).'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Optional updated metadata.')
  }),
  execute: async ({ id, category, content, metadata }) => {
    const supabase = useSupabase()
    const updateData: Record<string, unknown> = {}
    if (category) updateData.category = category
    if (content) updateData.content = content
    if (metadata) updateData.metadata = metadata

    const { data, error } = await supabase
      .from('knowledge_base')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: 'Record not found to update.' }
    return { success: true, message: 'Đã cập nhật thông tin thành công.', data }
  }
})

export const deleteKnowledgeTool = tool({
  description: 'Delete outdated product information or knowledge from the database by its ID.',
  inputSchema: z.object({
    id: z.string().describe('The ID of the knowledge record to delete (obtained from search_knowledge).')
  }),
  execute: async ({ id }) => {
    const supabase = useSupabase()
    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('id', id)

    if (error) return { error: error.message }
    return { success: true, message: 'Đã xóa dữ liệu thành công.' }
  }
})

export const searchTool = tool({
  description: 'Search the web for up-to-date information, news, or facts using Tavily.',
  inputSchema: z.object({
    query: z.string().describe('The search query.')
  }),
  execute: async ({ query }) => {
    const config = useRuntimeConfig()
    const apiKey = config.tavilyApiKey || process.env.TAVILY_API_KEY

    const response = await $fetch('https://api.tavily.com/search', {
      method: 'POST',
      body: {
        api_key: apiKey,
        query,
        search_depth: 'smart',
        include_answer: true
      }
    })

    return response
  }
})

export const syncFirestoreToSupabaseTool = tool({
  description: 'Sync data from a Firebase Firestore collection to a Supabase table. Use this for orders, customers, payouts, etc.',
  inputSchema: z.object({
    collectionName: z.string().describe('The name of the Firestore collection (e.g., "orders", "affiliate_payouts").'),
    targetTable: z.string().describe('The destination table name in Supabase (usually same as collection).'),
    limit: z.number().optional().default(10).describe('Number of records to sync.')
  }),
  execute: async ({ collectionName, targetTable, limit }) => {
    try {
      const admin = await getFirebaseAdmin()
      const db = admin.firestore()

      const snapshot = await db.collection(collectionName).limit(limit).get()

      if (snapshot.empty) return { message: 'Thành công truy cập, nhưng hoàn toàn KHÔNG tìm thấy dữ liệu bất kỳ nào trong collection: ' + collectionName }

      const records = snapshot.docs.map((doc) => {
        const rawData = doc.data()
        return {
          id: doc.id,
          user_email: rawData.ownerEmail || rawData.email || rawData.createdByEmail || rawData.userEmail || 'unknown',
          data: rawData,
          sync_at: new Date().toISOString()
        }
      })

      const supabase = useSupabase()
      const { data, error } = await supabase
        .from(targetTable)
        .upsert(records, { onConflict: 'id' })
        .select()

      if (error) return { error: `Cơ sở dữ liệu Supabase từ chối nhận vì lỗi cấu trúc bảng '${targetTable}'. Chi tiết lỗi: ${error.message}` }
      return { success: true, count: records.length, synced: data }
    } catch (e: unknown) {
      console.error('Lỗi sập Tool Sync:', e)
      const errorMessage = e instanceof Error ? e.message : String(e)
      return { error: 'Cực kỳ nghiêm trọng: Tool đã bị SẬP do lỗi kỹ thuật mạng hoặc code. Chi tiết máy chủ báo lại: ' + errorMessage }
    }
  }
})

export const queryAppDatabaseTool = tool({
  description: 'Tra cứu dữ liệu từ cơ sở dữ liệu thực của app. Dùng quyền ALL_ADMIN để xem tất cả nếu được Admin yêu cầu, hoặc gắn đúng email để chặn xem riêng.',
  inputSchema: z.object({
    tableName: z.enum(['users', 'orders', 'cash_book', 'payments', 'customers', 'affiliate_payouts']).describe('Tên bảng chứa dữ liệu cần tra cứu.'),
    user_email: z.string().describe('Email lịch sử của ai thì điền người đó. NHƯNG NẾU LÀ ADMIN CẦN XEM TOÀN BỘ, TRUYỀN CHÍNH XÁC CHỮ "ALL_ADMIN" VÀO ĐÂY.'),
    email_column: z.string().default('user_email').describe('Tên cột chứa email trong bảng tương ứng (thường là "user_email").'),
    limit: z.number().optional().default(1000)
  }),
  execute: async ({ tableName, user_email, email_column, limit }) => {
    try {
      const supabase = useSupabase()

      let query = supabase.from(tableName).select('*').limit(limit)

      if (user_email !== 'ALL_ADMIN') {
        query = query.eq(email_column, user_email)
      }

      const { data, error } = await query

      if (error) return { error: `Dữ liệu bị lỗi khi chọc vào bảng ${tableName}: ${error.message}` }
      if (!data || data.length === 0) return { message: `KHÔNG có dữ liệu nào trong bảng [${tableName}].` }

      return { success: true, count: data.length, records_thay_duoc: data }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      return { error: 'Server sập khi truy vấn dữ liệu app: ' + errorMessage }
    }
  }
})

export const saveUserMemoryTool = tool({
  description: 'Lưu lại thói quen, sở thích hoặc một ghi chú quan trọng về khách hàng Zalo này (chỉ định bởi user_email) vào bộ não dài hạn để học lỏm.',
  inputSchema: z.object({
    user_email: z.string().describe('Email định danh của người dùng hiện tại.'),
    memory_content: z.string().describe('Nội dung cần ghi nhớ về thói quen/giao dịch/đặc điểm của người này.')
  }),
  execute: async ({ user_email, memory_content }) => {
    try {
      const supabase = useSupabase()
      await supabase.from('user_memories').insert({
        user_email,
        memory_content,
        created_at: new Date().toISOString()
      })
      return { success: true, message: 'Đã khắc sâu vào bộ não dài hạn, sẽ không bao giờ quên người này.' }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      return { error: errorMessage }
    }
  }
})

export const searchUserMemoryTool = tool({
  description: 'Tìm kiếm lại các ghi chú thói quen lịch sử, hồ sơ tâm lý và giao dịch cũ mà Bot từng học được từ user_email Zalo này.',
  inputSchema: z.object({
    user_email: z.string().describe('Email định danh của người dùng hiện tại.')
  }),
  execute: async ({ user_email }) => {
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase.from('user_memories').select('*').eq('user_email', user_email).limit(10).order('created_at', { ascending: false })
      if (error) return { error: error.message }
      if (!data || data.length === 0) return { message: 'Chưa học được thói quen gì từ lúc Zalo bot tiếp xúc khách có email này.' }
      return { success: true, results: data }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      return { error: errorMessage }
    }
  }
})

export const fetchWebContentTool = tool({
  description: 'Fetch and extract clean text content from a specific website URL. Use this when a user shares a link and you need to read its content.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL of the website to extract content from.')
  }),
  execute: async ({ url }) => {
    const config = useRuntimeConfig()
    const apiKey = config.tavilyApiKey || process.env.TAVILY_API_KEY

    try {
      const response = await $fetch<{ results?: Array<{ url: string, title: string, raw_content?: string, text?: string }> }>('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          api_key: apiKey,
          urls: [url]
        },
        timeout: 15000
      })

      if (response.results && response.results.length > 0 && (response.results[0].raw_content || response.results[0].text)) {
        const result = response.results[0]
        return {
          success: true,
          source: 'tavily-extract',
          url: result.url,
          title: result.title,
          content: result.raw_content || result.text
        }
      }
    } catch (e: unknown) {
      console.warn(`[AI-Tool] Tavily Extract failed for ${url}:`, e instanceof Error ? e.message : String(e))
    }

    try {
      const searchResponse = await $fetch<{ answer?: string, results?: Array<{ url: string, title: string, content: string }> }>('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          api_key: apiKey,
          query: url,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 1
        },
        timeout: 10000
      })

      if (searchResponse.answer || (searchResponse.results && searchResponse.results.length > 0)) {
        const content = searchResponse.answer || searchResponse.results![0].content
        return {
          success: true,
          source: 'tavily-search',
          url,
          title: searchResponse.results?.[0]?.title || 'Search Result',
          content: content + '\n\n(Note: This was retrieved via search fallback as direct extraction was blocked.)'
        }
      }
    } catch (e: unknown) {
      console.warn(`[AI-Tool] Tavily Search fallback failed for ${url}:`, e instanceof Error ? e.message : String(e))
    }

    try {
      const jinaResponse = await $fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: 'application/json' },
        timeout: 15000
      }) as { data?: { url: string, title: string, content: string } }

      if (jinaResponse && jinaResponse.data) {
        return {
          success: true,
          source: 'jina-reader',
          url: jinaResponse.data.url,
          title: jinaResponse.data.title,
          content: jinaResponse.data.content
        }
      }
    } catch (e: unknown) {
      console.error(`[AI-Tool] All extraction methods failed for ${url}:`, e instanceof Error ? e.message : String(e))
    }

    return {
      error: 'Hệ thống bảo mật của website này đang ngăn chặn việc bóc tách dữ liệu tự động. Vui lòng copy nội dung hoặc chụp ảnh gửi trực tiếp để tôi hỗ trợ nhé.'
    }
  }
})

// --- YouTube Transcript Helpers (Re-implemented for reliability) ---

const YT_ID_REGEX = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i
const YT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)'
const YT_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
const YT_CLIENT_VERSION = '20.10.38'
const YT_CONTEXT = { client: { clientName: 'ANDROID', clientVersion: YT_CLIENT_VERSION } }

function extractVideoId(url: string): string {
  if (url.length === 11) return url
  const match = url.match(YT_ID_REGEX)
  if (match && match[1]) return match[1]
  throw new Error('Could not retrieve YouTube video ID.')
}

async function fetchYoutubeTranscript(url: string) {
  const videoId = extractVideoId(url)

  try {
    const response = await fetch(YT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `com.google.android.youtube/${YT_CLIENT_VERSION} (Linux; U; Android 14)` },
      body: JSON.stringify({ context: YT_CONTEXT, videoId })
    })

    if (response.ok) {
      const data = await response.json() as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl: string }[] } } }
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
      if (Array.isArray(tracks) && tracks.length > 0) {
        return await fetchAndParseTranscript(tracks[0].baseUrl)
      }
    }
  } catch (e) {
    console.error('InnerTube fetching failed:', e)
  }

  try {
    const pageText = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': YT_USER_AGENT }
    }).then(r => r.text())

    const jsonMatch = pageText.match(/var ytInitialPlayerResponse = (\{.+?\});/)
    if (jsonMatch) {
      const playerResponse = JSON.parse(jsonMatch[1]) as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl: string }[] } } }
      const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
      if (Array.isArray(tracks) && tracks.length > 0) {
        const baseUrl = tracks[0].baseUrl
        if (baseUrl) {
          return await fetchAndParseTranscript(baseUrl)
        }
      }
    }
  } catch (e) {
    console.error('Web page fetching failed:', e)
  }

  throw new Error('No transcripts found for this video.')
}

async function fetchAndParseTranscript(baseUrl: string) {
  const xml = await fetch(baseUrl, { headers: { 'User-Agent': YT_USER_AGENT } }).then(r => r.text())

  const segments = []
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  let match

  while ((match = pRegex.exec(xml)) !== null) {
    const start = parseInt(match[1], 10)
    const duration = parseInt(match[2], 10)
    const text = match[3]

    // Simple entity decode and tag removal
    let cleanText = (text || '')
    cleanText = cleanText.replace(/<[^>]+>/g, '')
    cleanText = cleanText.replace(/&amp;/g, '&')
    cleanText = cleanText.replace(/&lt;/g, '<')
    cleanText = cleanText.replace(/&gt;/g, '>')
    cleanText = cleanText.replace(/&quot;/g, '"')
    cleanText = cleanText.replace(/&#39;/g, '\'')

    if (cleanText && cleanText.trim()) {
      segments.push({ text: cleanText.trim(), duration, offset: start })
    }
  }

  return segments
}

export const fetchYoutubeTranscriptTool = tool({
  description: 'Extracts the transcript/captions from a YouTube video given its URL.',
  inputSchema: z.object({
    url: z.string().describe('The URL of the YouTube video.')
  }),
  execute: async ({ url }) => {
    try {
      const transcript = await fetchYoutubeTranscript(url)

      if (!transcript || transcript.length === 0) {
        return { error: 'No transcript found for this video. It might not have captions enabled.' }
      }

      // Combine transcript parts into a single text
      const fullText = transcript.map(part => part.text).join(' ')

      return {
        url,
        transcript: fullText,
        segments: transcript
      }
    } catch (e: unknown) {
      return { error: `Failed to fetch YouTube transcript: ${(e as Error).message}\nNote: Some videos may not have available transcripts or are region-restricted.` }
    }
  }
})
