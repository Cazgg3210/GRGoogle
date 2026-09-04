'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type UrlPatch = Record<string, string | number | boolean | null | undefined>

/** Filtros sincronizados con la URL (replace, sin scroll). */
export function useUrlState() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const get = React.useCallback(
    (key: string): string | undefined => searchParams.get(key) ?? undefined,
    [searchParams],
  )

  const set = React.useCallback(
    (patch: UrlPatch, opts: { resetPage?: boolean; push?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '' || v === false) next.delete(k)
        else next.set(k, String(v))
      }
      if (opts.resetPage !== false && !('page' in patch)) next.delete('page')
      const qs = next.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (opts.push) router.push(url, { scroll: false })
      else router.replace(url, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const clear = React.useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams()
      for (const k of keep) {
        const v = searchParams.get(k)
        if (v) next.set(k, v)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return { get, set, clear, searchParams }
}
