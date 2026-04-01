<script setup lang="ts">
const { loggedIn } = useUserSession()
const toast = useToast()

const props = defineProps<{
  open: () => void
}>()

function handleFileUpload() {
  if (!loggedIn.value) {
    toast.add({
      title: 'Login required',
      description: 'You need to be logged in to upload files.',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
    return
  }
  props.open()
}
</script>

<template>
  <UButton
    icon="i-lucide-paperclip"
    variant="ghost"
    color="neutral"
    size="sm"
    @click="handleFileUpload()"
  />
</template>
