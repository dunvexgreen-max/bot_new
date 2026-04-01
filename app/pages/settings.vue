<script setup lang="ts">
const prompt = ref('')
const loading = ref(false)
const toast = useToast()

// Sử dụng useCsrf để lấy token cho cả GET và POST nếu cần
const { csrf, headerName } = useCsrf()

const { data, refresh } = await useFetch('/api/settings/system-prompt', {
  headers: { [headerName]: csrf }
})

if (data.value) {
  prompt.value = data.value.value || ''
}

async function saveSettings() {
  loading.value = true
  try {
    await $fetch('/api/settings/system-prompt', {
      method: 'POST',
      body: { value: prompt.value },
      headers: { [headerName]: csrf }
    })
    toast.add({ 
      title: 'Đã lưu cấu hình!', 
      description: 'Hệ thống đã cập nhật trí tuệ mới nhất cho Bot.',
      icon: 'i-lucide-check-circle',
      color: 'primary' 
    })
    await refresh()
  } catch (e: any) {
    toast.add({ 
      title: 'Lỗi khi lưu', 
      description: e.message || 'Vui lòng thử lại', 
      icon: 'i-lucide-alert-triangle',
      color: 'red' 
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
    <!-- Header chuẩn không dùng Pro component -->
    <header class="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-6 z-20">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-settings-2" class="w-5 h-5 text-primary-500" />
        <h1 class="text-lg font-bold">Cấu hình Trợ lý Bot</h1>
      </div>
      <div class="flex items-center gap-3">
        <UBadge v-if="loading" label="Đang lưu..." color="gray" variant="soft" />
        <UButton
          label="Lưu Cấu Hình (Ctrl+S)"
          icon="i-lucide-save"
          color="primary"
          variant="solid"
          :loading="loading"
          class="font-bold shadow-lg shadow-primary-500/20"
          @click="saveSettings"
        />
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto p-6">
      <div class="max-w-[1400px] mx-auto space-y-6">
        <!-- Status Row -->
        <div class="flex items-center gap-4 mb-2">
          <div class="w-12 h-12 rounded-2xl bg-primary-500 flex items-center justify-center shadow-xl shadow-primary-500/30">
            <UIcon name="i-lucide-brain-circuit" class="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 class="text-2xl font-black tracking-tight">Trí Tuệ Hệ Thống</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">Định nghĩa vai trò, phong cách và các kỹ năng cốt lõi cho Bot</p>
          </div>
        </div>

        <UCard class="ring-1 ring-gray-200 dark:ring-gray-800 shadow-sm overflow-hidden bg-white dark:bg-gray-900 relative">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-align-left" class="text-gray-400" />
                <span class="text-sm font-medium text-gray-500">Soạn thảo Prompt</span>
              </div>
              <UButton
                label="Xóa toàn bộ"
                icon="i-lucide-trash-2"
                color="red"
                variant="ghost"
                size="xs"
                @click="prompt = ''"
              />
            </div>
          </template>

          <textarea
            v-model="prompt"
            rows="30"
            autofocus
            placeholder="Dán hoặc nhập hướng dẫn vận hành tại đây..."
            class="font-mono text-base w-full min-h-[600px] p-4 bg-transparent focus:ring-2 focus:ring-primary-500 focus:outline-none border-0 resize-none text-gray-900 dark:text-gray-100"
          ></textarea>
          
          <template #footer>
            <div class="flex items-center justify-between text-xs text-gray-400 font-medium">
              <div class="flex items-center gap-6">
                <span class="flex items-center gap-1.5"><UIcon name="i-lucide-code-2" class="w-4 h-4 text-primary-500" /> Hỗ trợ Markdown</span>
                <span class="flex items-center gap-1.5"><UIcon name="i-lucide-zap" class="w-4 h-4 text-orange-500" /> Tự động ghi nhớ kiến thức</span>
                <span class="flex items-center gap-1.5"><UIcon name="i-lucide-shield-check" class="w-4 h-4 text-green-500" /> Mã hóa bảo mật</span>
              </div>
              <div>
                Độ dài: <span class="text-primary-500">{{ prompt.length }}</span> ký tự
              </div>
            </div>
          </template>
        </UCard>

        <!-- Tool Guide Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 pb-12">
           <div class="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 flex gap-4">
              <UIcon name="i-lucide-search" class="w-6 h-6 text-primary-500" />
              <div>
                <h4 class="font-bold text-sm">Tra Cứu Web</h4>
                <p class="text-xs text-gray-500 mt-1">Dùng search_web khi cần thông tin thời gian thực hoặc tin tức mới.</p>
              </div>
           </div>
           <div class="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 flex gap-4">
              <UIcon name="i-lucide-database" class="w-6 h-6 text-orange-500" />
              <div>
                <h4 class="font-bold text-sm">Cơ Sở Dữ Liệu</h4>
                <p class="text-xs text-gray-500 mt-1">Dùng search_knowledge để tìm dữ liệu từ tệp tin đã học.</p>
              </div>
           </div>
           <div class="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 flex gap-4">
              <UIcon name="i-lucide-sync" class="w-6 h-6 text-green-500" />
              <div>
                <h4 class="font-bold text-sm">Đồng Bộ Firestore</h4>
                <p class="text-xs text-gray-500 mt-1">Dùng sync_firestore để đẩy dữ liệu mới về kho lưu trữ.</p>
              </div>
           </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Tuỳ chỉnh selection mà không dùng @apply để tránh lỗi Tailwind 4 */
:deep(textarea)::selection {
  background-color: rgb(var(--color-primary-500) / 0.2);
}
</style>
