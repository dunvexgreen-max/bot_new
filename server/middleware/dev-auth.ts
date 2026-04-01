export default defineEventHandler(async (event) => {
  // Only apply to dev environment
  if (process.env.NODE_ENV !== 'development') {
    return
  }

  // Bypass auth checks for API routes in dev mode
  const path = event.node.req.url || ''

  // List of routes that require auth
  const protectedRoutes = [
    '/api/chats',
    '/api/upload',
    '/api/settings'
  ]

  const isProtected = protectedRoutes.some(route => path.startsWith(route))

  if (!isProtected) {
    return
  }

  try {
    // Try to get existing session
    const session = await getUserSession(event)

    // If no session exists, create a mock one for dev
    if (!session || !session.user) {
      const mockUser = {
        id: 'dev-user-' + Date.now(),
        email: 'dev@localhost.test',
        username: 'devuser',
        name: 'Development User',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dev',
        provider: 'github' as const,
        providerId: 'dev-mode'
      }

      await setUserSession(event, {
        user: mockUser,
        loggedInAt: new Date()
      })

      console.log('[Dev Auth] Injected mock session for:', path)
    }
  } catch (error) {
    console.debug('[Dev Auth Middleware] Error:', error)
  }
})
