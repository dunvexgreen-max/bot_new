import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const google = createGoogleGenerativeAI({
    apiKey: config.google.apiKey
  })

  // 1. Nhận tin nhắn từ Zalo (Giải mã body của Zalo Webhook)
  // Lưu ý: Cấu trúc message của Zalo Bot có thể khác Zalo OA.
  // Thường là body.sender.id và body.message.text
  const userMessage = body.message?.text || body.text
  const fromUser = body.sender?.id || body.user_id

  if (!userMessage || !fromUser) return { status: 'no_message_or_user' }

  // 2. Gửi trạng thái "Đang soạn tin" (Typing indicator) nếu API hỗ trợ
  // Với Zalo Bot Token này, chúng ta sẽ thử gửi phản hồi trực tiếp.

  const supabase = useSupabase()

  // Lấy dữ liệu công nợ
  const { data: debtData } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', fromUser)
    .single()

  // 3. Gọi Gemini để xử lý
  const { text: responseText } = await generateText({
    model: google('gemini-1.5-flash'),
    system: `
      Bạn là AI Thư ký tài chính thông minh của anh Thông.
      Bạn đang hỗ trợ người dùng Zalo có ID: ${fromUser}.
      Thông tin nợ hiện tại (nếu có): ${JSON.stringify(debtData || 'Chưa có thông tin nợ')}.
      Nhiệm vụ: Trả lời câu hỏi ngắn gọn, chuyên nghiệp. Không dùng markdown quá phức tạp vì Zalo hiển thị hạn chế.
      Nếu khách hỏi về giá sản phẩm hoặc nợ, hãy tra cứu kỹ.
    `,
    prompt: userMessage
  })

  // 4. Trả kết quả về Zalo API bằng Bot Token
  try {
    // API dành cho Zalo Bot (thường dùng cho Bot tự động)
    await $fetch('https://bot.zalo.me/api/v1/message/send', {
      method: 'POST',
      headers: {
        'x-bot-token': config.zaloBotToken
      },
      body: {
        user_id: fromUser,
        text: responseText
      }
    })
  } catch (err: unknown) {
    const errorData = (err as { data?: { message?: string } })?.data || (err as Error)
    console.error('Lỗi khi gửi tin nhắn Zalo:', errorData.message || String(errorData))

    // Fallback: Nếu là Zalo OA API truyền thống
    try {
      await $fetch('https://openapi.zalo.me/v2.0/oa/message', {
        method: 'POST',
        headers: { access_token: config.zaloBotToken },
        body: {
          recipient: { user_id: fromUser },
          message: { text: responseText }
        }
      })
    } catch {
      console.error('Cả 2 cách gửi tin nhắn Zalo đều thất bại.')
    }
  }

  return {
    status: 'success',
    reply: responseText
  }
})
