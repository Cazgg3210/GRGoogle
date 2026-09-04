import NextAuth from 'next-auth'
import { createAuthConfig } from '@smlxl/auth/next'
import { env } from '@/env'

export const authConfig = createAuthConfig({
  NODE_ENV: env.NODE_ENV,
  API_URL: env.API_URL,
  AUTH_SECRET: env.AUTH_SECRET,
  AUTH_DEV_BYPASS: env.AUTH_DEV_BYPASS,
  GOOGLE_OAUTH_CLIENT_ID: env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: env.GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_WORKSPACE_DOMAIN: env.GOOGLE_WORKSPACE_DOMAIN,
})

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)

export const googleLoginEnabled = Boolean(
  env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET,
)
export const devBypassEnabled = env.AUTH_DEV_BYPASS && env.NODE_ENV !== 'production'
