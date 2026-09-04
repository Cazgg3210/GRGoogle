'use client'

import * as React from 'react'
import { cn } from '@smlxl/ui'
import type { PeriodKey } from '@/lib/period'
import { Sidebar, type SidebarNavItem } from './sidebar'
import { Header } from './header'

const STORAGE_KEY = 'smlxl.sidebar.collapsed'

export function AppShell({ nav, period, children }: { nav: SidebarNavItem[]; period: PeriodKey; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === '1') setCollapsed(true)
      else if (stored === null && window.innerWidth < 1280) setCollapsed(true)
    } catch {
      /* sin storage */
    }
    setHydrated(true)
  }, [])

  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* sin storage */
      }
      return next
    })
  }, [])

  return (
    <div className={cn('app-shell flex min-h-dvh', !hydrated && 'invisible')}>
      <Sidebar items={nav} collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header period={period} />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-6 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
