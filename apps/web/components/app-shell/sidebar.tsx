'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { SimpleTooltip, cn } from '@smlxl/ui'
import { NAV_ITEMS } from '@/lib/permissions'
import { useAppSession } from '@/components/session-context'

export interface SidebarNavItem {
  href: string
  label: string
}

export function Sidebar({ items, collapsed, onToggle }: { items: SidebarNavItem[]; collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname()
  const session = useAppSession()
  return (
    <aside
      className={cn(
        'sticky top-0 flex h-dvh shrink-0 flex-col border-r border-ink-800 bg-ink-950 text-ink-200 transition-[width] duration-200',
        collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
      )}
      aria-label="Navegación principal"
    >
      <div className={cn('flex h-[var(--header-height)] items-center border-b border-ink-800/80', collapsed ? 'justify-center px-2' : 'px-5')}>
        <Link href="/inicio" className="flex items-center gap-2.5" aria-label="SMLXL inicio">
          <span className="flex size-7 items-center justify-center rounded-sm bg-signal-500 font-display text-lg leading-none text-white">S</span>
          {!collapsed ? (
            <span className="flex flex-col leading-none">
              <span className="font-display text-xl tracking-tight text-paper-50">SMLXL</span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">Compromisos</span>
            </span>
          ) : null}
        </Link>
      </div>

      <nav className={cn('flex flex-1 flex-col gap-0.5 py-3', collapsed ? 'px-2' : 'px-3')}>
        {items.map((item) => {
          const meta = NAV_ITEMS.find((n) => n.href === item.href)
          const Icon = meta?.icon
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'px-3',
                active ? 'bg-ink-800/90 text-paper-50' : 'text-ink-300 hover:bg-ink-900 hover:text-paper-50',
              )}
            >
              {active ? <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-r bg-signal-400" aria-hidden /> : null}
              {Icon ? <Icon className={cn('size-4 shrink-0', active ? 'text-signal-300' : 'text-ink-400 group-hover:text-ink-200')} /> : null}
              {!collapsed ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
            </Link>
          )
          return collapsed ? (
            <SimpleTooltip key={item.href} label={item.label} side="right">
              {link}
            </SimpleTooltip>
          ) : (
            link
          )
        })}
      </nav>

      <div className={cn('border-t border-ink-800/80 py-3', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed ? (
          <div className="mb-2 px-3">
            <p className="truncate text-xs font-medium text-paper-100">{session.name}</p>
            <p className="truncate text-[11px] text-ink-400">{session.email}</p>
            {!session.verified ? (
              <p className="mt-1 text-[10px] uppercase tracking-wider text-warning-300">API sin conexión</p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex w-full items-center gap-2 rounded-md py-1.5 text-xs text-ink-400 transition-colors hover:bg-ink-900 hover:text-paper-50',
            collapsed ? 'justify-center' : 'px-3',
          )}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed ? <span>Contraer</span> : null}
        </button>
      </div>
    </aside>
  )
}
