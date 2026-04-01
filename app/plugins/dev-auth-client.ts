export default defineNuxtPlugin(async () => {
  // Skip in SSR
  if (import.meta.server) {
    return
  }

  // Fetch current session to refresh
  try {
    await $fetch('/api/auth/session')
  } catch (error) {
    console.debug('[Dev Auth Plugin] Session fetch error:', error)
  }
})
