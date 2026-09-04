'use client'

import * as React from 'react'
import type { Permission } from '@smlxl/domain'

export interface ClientSession {
  userId: string
  email: string
  name: string
  role: string
  permissions: string[]
  devBypass: boolean
  verified: boolean
}

const Ctx = React.createContext<ClientSession | null>(null)

export function SessionProvider({ value, children }: { value: ClientSession; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppSession(): ClientSession {
  const v = React.useContext(Ctx)
  if (!v) throw new Error('useAppSession debe usarse dentro de SessionProvider')
  return v
}

export function usePermission(permission: Permission): boolean {
  const s = useAppSession()
  return s.permissions.includes(permission)
}

export function useAnyPermission(required: readonly Permission[]): boolean {
  const s = useAppSession()
  return required.length === 0 || required.some((p) => s.permissions.includes(p))
}
