'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Globe, X } from 'lucide-react'
import type { MeetingListItemDto } from '@smlxl/contracts'
import {
  AiAnalysisBadge,
  ArtifactStatusBadge,
  Badge,
  Button,
  CONFIDENTIALITY_LABELS,
  ConfidenceIndicator,
  ConfidentialityBadge,
  EmptyState,
  Input,
  Label,
  PROCESSING_STATUS_LABELS,
  ProcessingStatusBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SimpleTooltip,
  formatDateTime,
  formatDuration,
} from '@smlxl/ui'
import type { Page } from '@/lib/api'
import { useUrlState } from '@/lib/hooks/use-url-state'
import { CatalogSelect } from '@/components/shared/catalog-select'
import { DataTable } from '@/components/shared/data-table'
import { Pagination } from '@/components/shared/pagination'

export type MeetingsQuery = {
  page: number
  pageSize: number
  from?: string
  to?: string
  organizerUserId?: string
  areaId?: string
  participantUserId?: string
  processed?: boolean
  withActionItems?: boolean
  confidentiality?: string
  processingStatus?: string
  search?: string
}

const col = createColumnHelper<MeetingListItemDto>()

export function MeetingsTable({
  page,
  query,
  error,
}: {
  page: Page<MeetingListItemDto> | null
  query: MeetingsQuery
  error?: React.ReactNode
}) {
  const url = useUrlState()
  const router = useRouter()
  const [search, setSearch] = React.useState(query.search ?? '')

  const columns = React.useMemo(
    () => [
      col.accessor('startAt', {
        header: 'Fecha',
        size: 150,
        cell: (c) => (
          <span className="whitespace-nowrap font-mono text-xs tabular text-muted-foreground">
            {formatDateTime(c.getValue())}
          </span>
        ),
      }),
      col.accessor('title', {
        header: 'Título',
        cell: (c) => (
          <div className="min-w-[220px] max-w-[420px]">
            <Link
              href={`/reuniones/${c.row.original.id}`}
              className="block truncate font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {c.getValue()}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {c.row.original.isExternalHost ? (
                <Badge tone="warning">
                  <Globe className="size-3" />
                  Host externo
                </Badge>
              ) : null}
              <ConfidentialityBadge level={c.row.original.confidentialityLevel} />
              {c.row.original.excludedFromAi ? <Badge tone="neutral">Excluida de IA</Badge> : null}
            </div>
          </div>
        ),
      }),
      col.accessor('organizerName', {
        header: 'Organizador',
        size: 160,
        cell: (c) => (
          <span className="text-sm">{c.getValue() ?? c.row.original.organizerEmail ?? '—'}</span>
        ),
      }),
      col.accessor('participantCount', {
        header: 'Participantes',
        size: 110,
        cell: (c) => (
          <SimpleTooltip
            label={
              c.row.original.participantNames.length
                ? c.row.original.participantNames.join(', ')
                : 'Sin participantes registrados'
            }
          >
            <span className="cursor-help font-mono text-xs tabular underline decoration-dotted underline-offset-2">
              {c.getValue()}
            </span>
          </SimpleTooltip>
        ),
      }),
      col.accessor('durationSeconds', {
        header: 'Duración',
        size: 90,
        cell: (c) => (
          <span className="font-mono text-xs tabular">{formatDuration(c.getValue())}</span>
        ),
      }),
      col.accessor('transcriptStatus', {
        header: 'Transcript',
        size: 150,
        cell: (c) => (
          <div className="flex flex-col gap-1">
            <ArtifactStatusBadge status={c.getValue()} kind="transcript" />
            {c.row.original.smartNotesStatus !== 'NOT_REQUESTED' ? (
              <ArtifactStatusBadge
                status={c.row.original.smartNotesStatus}
                kind="notes"
                className="opacity-80"
              />
            ) : null}
          </div>
        ),
      }),
      col.accessor('aiAnalysisStatus', {
        header: 'IA',
        size: 130,
        cell: (c) => (
          <div className="flex flex-col gap-1">
            <AiAnalysisBadge status={c.getValue()} />
            <ProcessingStatusBadge
              status={c.row.original.processingStatus}
              className="opacity-80"
            />
          </div>
        ),
      }),
      col.accessor('actionItemCount', {
        header: 'Acciones',
        size: 80,
        cell: (c) => <span className="font-mono text-xs tabular">{c.getValue()}</span>,
      }),
      col.accessor('extractionConfidence', {
        header: 'Confianza',
        size: 110,
        cell: (c) => <ConfidenceIndicator value={c.getValue()} variant="inline" />,
      }),
      col.accessor('pendingReviewCount', {
        header: 'Revisión',
        size: 120,
        cell: (c) => {
          const n = c.getValue()
          const st = c.row.original.processingStatus
          if (n > 0) return <Badge tone="signal">{n} por revisar</Badge>
          if (st === 'COMPLETED') return <Badge tone="success">Revisada</Badge>
          if (st === 'EXCLUDED') return <Badge tone="neutral">Excluida</Badge>
          if (st === 'FAILED') return <Badge tone="danger">Error</Badge>
          return <Badge tone="neutral">En proceso</Badge>
        },
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: page?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  const hasFilters = Boolean(
    query.from ||
    query.to ||
    query.organizerUserId ||
    query.areaId ||
    query.participantUserId ||
    query.processed !== undefined ||
    query.withActionItems !== undefined ||
    query.confidentiality ||
    query.processingStatus ||
    query.search,
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-muted/50 p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-from">Desde</Label>
          <Input
            id="f-from"
            type="date"
            className="h-8 w-36 text-xs"
            value={query.from ?? ''}
            onChange={(e) => url.set({ from: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-to">Hasta</Label>
          <Input
            id="f-to"
            type="date"
            className="h-8 w-36 text-xs"
            value={query.to ?? ''}
            onChange={(e) => url.set({ to: e.target.value })}
          />
        </div>
        <div className="flex w-44 flex-col gap-1">
          <Label>Organizador</Label>
          <CatalogSelect
            kind="users"
            size="sm"
            value={query.organizerUserId ?? null}
            onChange={(v) => url.set({ organizerUserId: v })}
            emptyLabel="Cualquiera"
            placeholder="Organizador"
          />
        </div>
        <div className="flex w-44 flex-col gap-1">
          <Label>Participante</Label>
          <CatalogSelect
            kind="users"
            size="sm"
            value={query.participantUserId ?? null}
            onChange={(v) => url.set({ participantUserId: v })}
            emptyLabel="Cualquiera"
            placeholder="Participante"
          />
        </div>
        <div className="flex w-40 flex-col gap-1">
          <Label>Área</Label>
          <CatalogSelect
            kind="areas"
            size="sm"
            value={query.areaId ?? null}
            onChange={(v) => url.set({ areaId: v })}
            emptyLabel="Todas"
            placeholder="Área"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Procesada</Label>
          <Select
            value={query.processed === undefined ? 'any' : String(query.processed)}
            onValueChange={(v) => url.set({ processed: v === 'any' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Todas</SelectItem>
              <SelectItem value="true">Procesadas</SelectItem>
              <SelectItem value="false">No procesadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Con tareas</Label>
          <Select
            value={query.withActionItems === undefined ? 'any' : String(query.withActionItems)}
            onValueChange={(v) => url.set({ withActionItems: v === 'any' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Todas</SelectItem>
              <SelectItem value="true">Con tareas</SelectItem>
              <SelectItem value="false">Sin tareas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Confidencialidad</Label>
          <Select
            value={query.confidentiality ?? 'any'}
            onValueChange={(v) => url.set({ confidentiality: v === 'any' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Todas</SelectItem>
              {(
                Object.keys(CONFIDENTIALITY_LABELS) as Array<keyof typeof CONFIDENTIALITY_LABELS>
              ).map((k) => (
                <SelectItem key={k} value={k}>
                  {CONFIDENTIALITY_LABELS[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Estado</Label>
          <Select
            value={query.processingStatus ?? 'any'}
            onValueChange={(v) => url.set({ processingStatus: v === 'any' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Cualquier estado</SelectItem>
              {(
                Object.keys(PROCESSING_STATUS_LABELS) as Array<
                  keyof typeof PROCESSING_STATUS_LABELS
                >
              ).map((k) => (
                <SelectItem key={k} value={k}>
                  {PROCESSING_STATUS_LABELS[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            url.set({ search: search.trim() || null })
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-search">Título</Label>
            <Input
              id="f-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-44 text-xs"
              placeholder="Buscar…"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Buscar
          </Button>
        </form>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => url.clear()}>
            <X />
            Limpiar
          </Button>
        ) : null}
      </div>

      {error ? (
        error
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-card">
          <DataTable
            table={table}
            onRowClick={(m) => router.push(`/reuniones/${m.id}`)}
            emptyState={
              <EmptyState
                compact
                title="No hay reuniones con estos filtros"
                description="Ajusta los filtros o importa una reunión manualmente para la demo."
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
              onPageSizeChange={(s) => url.set({ pageSize: s === 25 ? null : s })}
              itemLabel="reuniones"
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
