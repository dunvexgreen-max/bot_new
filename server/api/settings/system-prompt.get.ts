export default defineEventHandler(async (event) => {
  const supabase = useSupabase()
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'system_prompt')
    .single()

  if (error) {
    return { value: 'Bạn là trợ lý tài chính chuyên nghiệp hỗ trợ anh Thông. Bạn có nhiệm vụ tư vấn về thuế, sản phẩm và theo dõi công nợ khách hàng.' }
  }

  return data
})
