'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  CalendarRange,
  LogOut,
  Search,
  Sparkles,
  ClipboardCheck,
  UserCircle2,
} from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ROLE_LABELS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UserAvatar,
  cn,
  labelFor,
} from '@smlxl/ui'
import { Permission } from '@smlxl/domain'
import { clientApi } from '@/lib/api.client'
import type { Page } from '@/lib/api'
import { PERIODS, PERIOD_COOKIE, type PeriodKey } from '@/lib/period'
import { qk } from '@/lib/query-keys'
import { useAppSession } from '@/components/session-context'
import { signOutAction } from '@/app/(app)/actions'

export function Header({ period }: { period: PeriodKey }) {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-3 border-b border-border bg-background/85 px-6 backdrop-blur lg:px-8">
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        <PeriodSelector value={period} />
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  )
}

function GlobalSearch() {
  const router = useRouter()
  const sp = useSearchParams()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [value, setValue] = React.useState(sp.get('q') ?? '')

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form
      role="search"
      className="relative w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        if (q.length < 2) return
        router.push(`/buscar?q=${encodeURIComponent(q)}`)
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar reuniones, pendientes, decisiones…  p. ej. “qué quedó pendiente con el contrato Alfa”"
        aria-label="Búsqueda global"
        className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-16 text-sm shadow-xs placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 md:flex">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </form>
  )
}

function PeriodSelector({ value }: { value: PeriodKey }) {
  const router = useRouter()
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        document.cookie = `${PERIOD_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        router.refresh()
      }}
    >
      <SelectTrigger size="sm" className="w-[150px] gap-1.5" aria-label="Periodo de análisis">
        <CalendarRange className="size-3.5 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {PERIODS.map((p) => (
          <SelectItem key={p.key} value={p.key}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface NotificationCounts {
  aiReview: number | null
  proposals: number | null
}

function NotificationsBell() {
  const session = useAppSession()
  const canReview = session.permissions.includes(Permission.AI_REVIEW_RESOLVE)
  const canRead = session.permissions.includes(Permission.ACTION_ITEM_READ)
  const query = useQuery({
    queryKey: qk.notifications,
    enabled: canReview || canRead,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NotificationCounts> => {
      const [ai, proposals] = await Promise.all([
        canReview
          ? clientApi
              .get<Page<unknown>>('/ai-review', { query: { page: 1, pageSize: 1 } })
              .then((p) => p.total)
              .catch(() => null)
          : Promise.resolve(null),
        canRead
          ? clientApi
              .get<Page<unknown>>('/action-items', {
                query: { view: 'proposed', status: 'COMPLETION_PROPOSED', page: 1, pageSize: 1 },
              })
              .then((p) => p.total)
              .catch(() => null)
          : Promise.resolve(null),
      ])
      return { aiReview: ai, proposals }
    },
  })
  const total = (query.data?.aiReview ?? 0) + (query.data?.proposals ?? 0)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notificaciones${total ? `: ${total} pendientes` : ''}`}
          className="relative"
        >
          <Bell className="size-4" />
          {total > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-500 px-1 font-mono text-[10px] font-semibold text-white">
              {total > 99 ? '99+' : total}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold">Requieren decisión humana</p>
          <p className="text-xs text-muted-foreground">La IA propone; una persona aprueba.</p>
        </div>
        <ul className="divide-y divide-border">
          {canReview ? (
            <li>
              <Link
                href="/revision-ia"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-100"
              >
                <span className="flex size-8 items-center justify-center rounded-md bg-ai-50 text-ai-700">
                  <Sparkles className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">Revisión IA</span>
                  <span className="block text-xs text-muted-foreground">
                    Extracciones con baja confianza o ambigüedad
                  </span>
                </span>
                <CountPill value={query.data?.aiReview} loading={query.isLoading} />
              </Link>
            </li>
          ) : null}
          {canRead ? (
            <li>
              <Link
                href="/pendientes?view=proposed"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-100"
              >
                <span className="flex size-8 items-center justify-center rounded-md bg-signal-50 text-signal-700">
                  <ClipboardCheck className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">Propuestas de cierre</span>
                  <span className="block text-xs text-muted-foreground">
                    Esperando aprobación o rechazo
                  </span>
                </span>
                <CountPill value={query.data?.proposals} loading={query.isLoading} />
              </Link>
            </li>
          ) : null}
        </ul>
        {query.isError ? (
          <p className="px-4 py-2 text-xs text-danger-700">
            No se pudieron consultar los contadores.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function CountPill({ value, loading }: { value: number | null | undefined; loading: boolean }) {
  if (loading) return <span className="h-5 w-8 animate-pulse-soft rounded-full bg-paper-200" />
  if (value === null || value === undefined)
    return <span className="font-mono text-xs text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 font-mono text-xs font-semibold',
        value > 0 ? 'bg-ink-900 text-paper-50' : 'bg-paper-200 text-paper-700',
      )}
    >
      {value}
    </span>
  )
}

function ProfileMenu() {
  const session = useAppSession()
  const role = labelFor(ROLE_LABELS, session.role)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-paper-200/70"
          aria-label="Menú de perfil"
        >
          <UserAvatar name={session.name} size="md" />
          {session.devBypass ? <Badge tone="warning">DEV</Badge> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block text-sm font-semibold text-foreground">{session.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {session.email}
          </span>
          <span className="mt-1.5 block">
            <Badge tone={role.tone}>{role.label}</Badge>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/equipo">
            <UserCircle2 />
            Ver equipo
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              Cerrar sesión
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
