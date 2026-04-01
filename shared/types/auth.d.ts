// auth.d.ts
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    avatar: string
    username: string
    provider: 'github' | 'google'
    providerId: string
    createdAt: Date
  }

  interface UserSession {
    extended?: boolean
  }
}

export {}
