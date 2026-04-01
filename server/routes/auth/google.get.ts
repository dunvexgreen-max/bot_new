import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'

export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user: googleUser }) {
    const session = await getUserSession(event)

    let user = await db.query.users.findFirst({
      where: () => and(
        eq(schema.users.provider, 'google'),
        eq(schema.users.providerId, googleUser.sub)
      )
    })
    if (!user) {
      [user] = await db.insert(schema.users).values({
        id: crypto.randomUUID(),
        name: googleUser.name || '',
        email: googleUser.email || '',
        avatar: googleUser.picture || '',
        username: googleUser.email.split('@')[0],
        provider: 'google',
        providerId: googleUser.sub
      }).returning()
    } else {
      // Assign anonymous chats with session id to user
      await db.update(schema.chats).set({
        userId: user.id
      }).where(eq(schema.chats.userId, session.id))
    }

    await setUserSession(event, { user })

    return sendRedirect(event, '/')
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/')
  }
})
