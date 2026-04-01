/**
 * Auth session endpoint for nuxt-auth-utils
 * Client calls this to check current session status
 */

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event)

    // If no session and dev mode, inject mock session
    if (!session || !session.user) {
      if (process.env.NODE_ENV === 'development') {
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

        console.log('[Dev Auth Session] Created mock session')

        return {
          user: mockUser,
          loggedInAt: new Date()
        }
      }
    }

    return session || null
  }
  catch (error) {
    console.error('[Auth Session Error]', error)
    return null
  }
})
