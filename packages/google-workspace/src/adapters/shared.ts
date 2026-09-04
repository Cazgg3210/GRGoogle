import type { JWT } from 'google-auth-library'
import type { ImpersonatedAuthFactory } from '../auth/dwd.js'
import type { GoogleRetryOptions } from '../http/retry.js'

/** Dependencias comunes de los adapters reales. */
export interface GoogleAdapterDeps {
  auth: ImpersonatedAuthFactory
  retry?: GoogleRetryOptions
}

/** Subconjunto de gaxios/JWT usado para llamadas "raw" a endpoints sin typings. */
export interface RawGoogleRequester {
  request<T>(opts: {
    url: string
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
    params?: Record<string, string | number | boolean | undefined>
    data?: unknown
    signal?: AbortSignal
  }): Promise<{ data: T }>
}

export type AuthClient = JWT

export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Duración estilo protobuf ("604800s") en segundos. */
export function protoDuration(seconds: number): string {
  return `${Math.max(1, Math.floor(seconds))}s`
}

/** Pagina cualquier `list` de Google acumulando resultados. */
export async function collectPages<T>(
  fetchPage: (pageToken: string | undefined) => Promise<{ items: T[]; nextPageToken: string | null | undefined }>,
  maxPages = 50,
): Promise<T[]> {
  const out: T[] = []
  let token: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(token)
    out.push(...page.items)
    if (!page.nextPageToken) break
    token = page.nextPageToken
  }
  return out
}
