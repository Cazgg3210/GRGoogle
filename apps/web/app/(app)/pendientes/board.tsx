'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { Columns3, KanbanSquare, List, SlidersHorizontal, X } from 'lucide-react'
import type { ActionItemDto } from '@smlxl/contracts'
import {
  ACTION_ITEM_STATUS_LABELS,
  ACTION_ITEM_VIEW_LABELS,
  AttentionReasonList,
  Badge,
  Button,
  ConfidenceIndicator,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DueDate,
  EmptyState,
  Input,
  PRIORITY_LABELS,
  PriorityBadge,
  RelativeDate,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Tabs,
  SegmentedList,
  SegmentedTrigger,
  UserAvatar,
  cn,
} from '@smlxl/ui'
import type { Page } from '@/lib/api'
import { useUrlState } from '@/lib/hooks/use-url-state'
import { CatalogSelect } from '@/components/shared/catalog-select'
import { DataTable } from '@/components/shared/data-table'
import { Pagination } from '@/components/shared/pagination'
import { ActionItemQuickActions } from '@/components/action-items/quick-actions'

export type PendientesQuery = {
  view: string
  page: number
  pageSize: number
  sort: string
  ownerUserId?: string
  areaId?: string
  projectId?: string
  priority?: string
  status?: string
  search?: string
}

const VIEW_KEYS = [
  'all',
  'mine',
  'team',
  'overdue',
  'thisWeek',
  'noDueDate',
  'noOwner',
  'blocked',
  'completed',
  'proposed',
] as const
const COLUMNS_STORAGE = 'smlxl.pendientes.columns'
const MODE_STORAGE = 'smlxl.pendientes.mode'
const KANBAN_COLUMNS = [
  'PROPOSED',
  'PENDING',
  'IN_PROGRESS',
  'BLOCKED',
  'WAITING',
  'COMPLETION_PROPOSED',
  'COMPLETED',
] as const

const col = createColumnHelper<ActionItemDto>()

const DEFAULT_VISIBILITY: VisibilityState = {
  area: false,
  project: false,
  daysOpen: false,
  lastMentioned: false,
  updatedAt: false,
  meeting: false,
}

export function PendientesBoard({
  page,
  query,
  error,
}: {
  page: Page<ActionItemDto> | null
  query: PendientesQuery
  error?: React.ReactNode
}) {
  const url = useUrlState()
  const router = useRouter()
  const [mode, setMode] = React.useState<'table' | 'kanban'>('table')
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [visibility, setVisibility] = React.useState<VisibilityState>(DEFAULT_VISIBILITY)
  const [search, setSearch] = React.useState(query.search ?? '')
  const [filtersOpen, setFiltersOpen] = React.useState(
    Boolean(query.ownerUserId || query.areaId || query.projectId || query.priority),
  )

  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(COLUMNS_STORAGE)
      if (v) setVisibility({ ...DEFAULT_VISIBILITY, ...(JSON.parse(v) as VisibilityState) })
      const m = window.localStorage.getItem(MODE_STORAGE)
      if (m === 'kanban') setMode('kanban')
    } catch {
      /* sin storage */
    }
  }, [])

  const updateVisibility = React.useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setVisibility((old) => {
        const next = typeof updater === 'function' ? updater(old) : updater
        try {
          window.localStorage.setItem(COLUMNS_STORAGE, JSON.stringify(next))
        } catch {
          /* sin storage */
        }
        return next
      })
    },
    [],
  )

  const changeMode = (m: 'table' | 'kanban') => {
    setMode(m)
    try {
      window.localStorage.setItem(MODE_STORAGE, m)
    } catch {
      /* sin storage */
    }
  }

  const columns = React.useMemo(
    () => [
      col.accessor('externalKey', {
        id: 'key',
        header: 'Clave',
        size: 96,
        cell: (c) => (
          <Link
            href={`/pendientes/${c.row.original.id}`}
            className="font-mono text-xs text-info-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {c.getValue()}
          </Link>
        ),
      }),
      col.accessor('title', {
        id: 'title',
        header: 'Pendiente',
        cell: (c) => (
          <div className="min-w-[240px] max-w-[460px]">
            <p className="truncate font-medium text-foreground" title={c.getValue()}>
              {c.getValue()}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {c.row.original.migrationTrust === 'LEGACY' ? (
                <Badge tone="neutral">Legado</Badge>
              ) : null}
              {c.row.original.requiresReview ? <Badge tone="ai">Revisión</Badge> : null}
              {c.row.original.blocker ? (
                <span className="truncate text-xs text-danger-700" title={c.row.original.blocker}>
                  Bloqueo: {c.row.original.blocker}
                </span>
              ) : null}
            </div>
          </div>
        ),
      }),
      col.accessor('status', {
        id: 'status',
        header: 'Estado',
        size: 130,
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
      col.accessor('priority', {
        id: 'priority',
        header: 'Prioridad',
        size: 96,
        cell: (c) => <PriorityBadge priority={c.getValue()} />,
      }),
      col.accessor('ownerName', {
        id: 'owner',
        header: 'Responsable',
        size: 180,
        cell: (c) => {
          const it = c.row.original
          const name = it.ownerName ?? it.externalAssigneeName
          if (!name) {
            return (
              <span className="inline-flex items-center rounded-sm border border-dashed border-warning-400 bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warning-800">
                Sin responsable
              </span>
            )
          }
          return (
            <span className="inline-flex items-center gap-2">
              <UserAvatar name={name} size="xs" />
              <span className="truncate text-sm">{name}</span>
              {it.externalAssigneeName && !it.ownerName ? (
                <Badge tone="neutral">Externo</Badge>
              ) : null}
            </span>
          )
        },
      }),
      col.accessor('dueDate', {
        id: 'dueDate',
        header: 'Fecha',
        size: 140,
        cell: (c) => (
          <DueDate
            value={c.getValue()}
            isOverdue={c.row.original.isOverdue}
            status={c.row.original.status}
          />
        ),
      }),
      col.accessor('areaName', {
        id: 'area',
        header: 'Área',
        size: 140,
        cell: (c) => c.getValue() ?? <span className="text-muted-foreground">—</span>,
      }),
      col.accessor('projectName', {
        id: 'project',
        header: 'Proyecto',
        size: 160,
        cell: (c) => c.getValue() ?? <span className="text-muted-foreground">—</span>,
      }),
      col.accessor('attentionReasons', {
        id: 'attention',
        header: 'Atención',
        cell: (c) => <AttentionReasonList reasons={c.getValue()} compact max={2} />,
      }),
      col.accessor('confidence', {
        id: 'confidence',
        header: 'Confianza',
        size: 110,
        cell: (c) => <ConfidenceIndicator value={c.getValue()} variant="inline" />,
      }),
      col.accessor('daysOpen', {
        id: 'daysOpen',
        header: 'Días abierto',
        size: 90,
        cell: (c) => <span className="font-mono text-xs tabular">{c.getValue()}</span>,
      }),
      col.accessor('lastMentionedAt', {
        id: 'lastMentioned',
        header: 'Última mención',
        size: 130,
        cell: (c) => <RelativeDate value={c.getValue()} className="text-xs" />,
      }),
      col.accessor('createdFromMeetingTitle', {
        id: 'meeting',
        header: 'Reunión origen',
        size: 200,
        cell: (c) =>
          c.row.original.createdFromMeetingId ? (
            <Link
              href={`/reuniones/${c.row.original.createdFromMeetingId}`}
              className="truncate text-xs text-info-700 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {c.getValue() ?? 'Ver reunión'}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Manual</span>
          ),
      }),
      col.accessor('updatedAt', {
        id: 'updatedAt',
        header: 'Actualizado',
        size: 120,
        cell: (c) => <RelativeDate value={c.getValue()} className="text-xs" withTime />,
      }),
      col.display({
        id: 'actions',
        header: '',
        size: 44,
        enableHiding: false,
        cell: (c) => <ActionItemQuickActions item={c.row.original} />,
      }),
    ],
    [],
  )

  const items = React.useMemo(() => page?.items ?? [], [page])
  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: updateVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: true,
  })

  const COLUMN_LABELS: Record<string, string> = {
    key: 'Clave',
    title: 'Pendiente',
    status: 'Estado',
    priority: 'Prioridad',
    owner: 'Responsable',
    dueDate: 'Fecha',
    area: 'Área',
    project: 'Proyecto',
    attention: 'Atención',
    confidence: 'Confianza',
    daysOpen: 'Días abierto',
    lastMentioned: 'Última mención',
    meeting: 'Reunión origen',
    updatedAt: 'Actualizado',
  }

  const activeFilters = [
    query.ownerUserId,
    query.areaId,
    query.projectId,
    query.priority,
    query.status,
  ].filter(Boolean).length

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={query.view} onValueChange={(v) => url.set({ view: v === 'all' ? null : v })}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedList className="h-auto flex-wrap">
            {VIEW_KEYS.map((v) => (
              <SegmentedTrigger key={v} value={v}>
                {ACTION_ITEM_VIEW_LABELS[v]}
              </SegmentedTrigger>
            ))}
          </SegmentedList>
          <div className="flex items-center gap-2">
            <Button
              variant={filtersOpen ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <SlidersHorizontal />
              Filtros
              {activeFilters > 0 ? <Badge tone="solid">{activeFilters}</Badge> : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={mode === 'kanban'}>
                  <Columns3 />
                  Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                    >
                      {COLUMN_LABELS[c.id] ?? c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="inline-flex rounded-md border border-border-strong bg-surface p-0.5">
              <button
                type="button"
                onClick={() => changeMode('table')}
                className={cn(
                  'rounded-sm p-1.5 transition-colors',
                  mode === 'table'
                    ? 'bg-ink-900 text-paper-50'
                    : 'text-muted-foreground hover:bg-paper-200',
                )}
                aria-pressed={mode === 'table'}
                aria-label="Vista tabla"
              >
                <List className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => changeMode('kanban')}
                className={cn(
                  'rounded-sm p-1.5 transition-colors',
                  mode === 'kanban'
                    ? 'bg-ink-900 text-paper-50'
                    : 'text-muted-foreground hover:bg-paper-200',
                )}
                aria-pressed={mode === 'kanban'}
                aria-label="Vista kanban"
              >
                <KanbanSquare className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            url.set({ search: search.trim() || null })
          }}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en pendientes…"
            className="h-8 w-64 text-xs"
            aria-label="Buscar en pendientes"
          />
          <Button type="submit" size="sm" variant="secondary">
            Buscar
          </Button>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ordenar</span>
          <Select
            value={query.sort}
            onValueChange={(v) => url.set({ sort: v === 'attention' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-[150px]" aria-label="Ordenar por">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attention">Atención</SelectItem>
              <SelectItem value="dueDate">Fecha compromiso</SelectItem>
              <SelectItem value="priority">Prioridad</SelectItem>
              <SelectItem value="createdAt">Creación</SelectItem>
              <SelectItem value="updatedAt">Actualización</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtersOpen ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-muted/50 p-3">
          <div className="w-52">
            <CatalogSelect
              kind="users"
              size="sm"
              value={query.ownerUserId ?? null}
              onChange={(v) => url.set({ ownerUserId: v })}
              emptyLabel="Cualquier responsable"
              placeholder="Responsable"
            />
          </div>
          <div className="w-48">
            <CatalogSelect
              kind="areas"
              size="sm"
              value={query.areaId ?? null}
              onChange={(v) => url.set({ areaId: v })}
              emptyLabel="Cualquier área"
              placeholder="Área"
            />
          </div>
          <div className="w-48">
            <CatalogSelect
              kind="projects"
              size="sm"
              value={query.projectId ?? null}
              onChange={(v) => url.set({ projectId: v })}
              emptyLabel="Cualquier proyecto"
              placeholder="Proyecto"
            />
          </div>
          <Select
            value={query.priority ?? '__all'}
            onValueChange={(v) => url.set({ priority: v === '__all' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-40" aria-label="Prioridad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Cualquier prioridad</SelectItem>
              {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={query.status ?? '__all'}
            onValueChange={(v) => url.set({ status: v === '__all' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-44" aria-label="Estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Cualquier estado</SelectItem>
              {(
                Object.keys(ACTION_ITEM_STATUS_LABELS) as Array<
                  keyof typeof ACTION_ITEM_STATUS_LABELS
                >
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {ACTION_ITEM_STATUS_LABELS[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => url.clear(['view', 'sort'])}>
            <X />
            Limpiar
          </Button>
        </div>
      ) : null}

      {error ? (
        error
      ) : mode === 'table' ? (
        <div className="rounded-lg border border-border bg-surface shadow-card">
          <DataTable
            table={table}
            onRowClick={(row) => router.push(`/pendientes/${row.id}`)}
            rowClassName={(row) => (row.isOverdue ? 'bg-danger-50/30' : undefined)}
            emptyState={
              <EmptyState
                compact
                title="No hay pendientes en esta vista"
                description="Cambia de vista, ajusta los filtros o crea un pendiente nuevo."
                className="m-3"
              />
            }
          />
          {page ? (
            <Pagination
              page={page.page}
              pageSize={page.pageSize}
              total={page.total}
              onPageChange={(p) => url.set({ page: p === 1 ? null : p }, { resetPage: false })}
              onPageSizeChange={(s) => url.set({ pageSize: s === 50 ? null : s })}
              pageSizes={[25, 50, 100, 200]}
              itemLabel="pendientes"
            />
          ) : null}
        </div>
      ) : (
        <Kanban items={items} />
      )}
    </div>
  )
}

function Kanban({ items }: { items: ActionItemDto[] }) {
  const groups = React.useMemo(() => {
    const map = new Map<string, ActionItemDto[]>()
    for (const k of KANBAN_COLUMNS) map.set(k, [])
    for (const it of items) {
      const bucket = map.get(it.status)
      if (bucket) bucket.push(it)
    }
    return map
  }, [items])
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
      {KANBAN_COLUMNS.map((status) => {
        const list = groups.get(status) ?? []
        const meta = ACTION_ITEM_STATUS_LABELS[status]
        return (
          <section
            key={status}
            className="flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-surface-muted/50"
            aria-label={meta.label}
          >
            <header className="flex items-center justify-between px-3 py-2">
              <StatusBadge status={status} />
              <span className="font-mono text-xs text-muted-foreground">{list.length}</span>
            </header>
            <div className="flex min-h-[120px] flex-col gap-2 px-2 pb-2">
              {list.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">Vacío</p>
              ) : null}
              {list.map((it) => (
                <article
                  key={it.id}
                  className={cn(
                    'rounded-md border border-border bg-surface p-3 shadow-card',
                    it.isOverdue && 'border-l-2 border-l-danger-500',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/pendientes/${it.id}`}
                      className="font-mono text-[11px] text-info-700 hover:underline"
                    >
                      {it.externalKey}
                    </Link>
                    <div className="flex items-center gap-1">
                      <PriorityBadge priority={it.priority} compact />
                      <ActionItemQuickActions item={it} />
                    </div>
                  </div>
                  <Link
                    href={`/pendientes/${it.id}`}
                    className="mt-1 block text-sm font-medium leading-snug text-foreground hover:underline"
                  >
                    {it.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {(it.ownerName ?? it.externalAssigneeName) ? (
                        <>
                          <UserAvatar name={it.ownerName ?? it.externalAssigneeName} size="xs" />
                          <span className="truncate">
                            {it.ownerName ?? it.externalAssigneeName}
                          </span>
                        </>
                      ) : (
                        <span className="text-warning-800">Sin responsable</span>
                      )}
                    </span>
                    <DueDate
                      value={it.dueDate}
                      isOverdue={it.isOverdue}
                      status={it.status}
                      className="text-xs"
                      showDays={false}
                    />
                  </div>
                  {it.attentionReasons.length > 0 ? (
                    <AttentionReasonList
                      reasons={it.attentionReasons}
                      compact
                      max={2}
                      className="mt-2"
                    />
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
