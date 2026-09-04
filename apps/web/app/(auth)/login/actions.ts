'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { DEV_CREDENTIALS_PROVIDER_ID } from '@smlxl/auth/next'
import { devBypassEnabled, googleLoginEnabled, signIn } from '@/auth'

function safeCallback(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/inicio'
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  if (!googleLoginEnabled) redirect('/login?error=GoogleNotConfigured')
  const redirectTo = safeCallback(formData.get('callbackUrl'))
  try {
    await signIn('google', { redirectTo })
  } catch (err) {
    if (err instanceof AuthError) redirect(`/login?error=${encodeURIComponent(err.type)}`)
    throw err
  }
}

export async function devSignInAction(formData: FormData): Promise<void> {
  if (!devBypassEnabled) redirect('/login?error=AccessDenied')
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const redirectTo = safeCallback(formData.get('callbackUrl'))
  try {
    await signIn(DEV_CREDENTIALS_PROVIDER_ID, { email, redirectTo })
  } catch (err) {
    if (err instanceof AuthError) redirect(`/login?error=${encodeURIComponent(err.type)}`)
    throw err
  }
}
