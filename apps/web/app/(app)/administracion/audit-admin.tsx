'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import type { AuditEntryDto, UserDto } from '@smlxl/contracts'
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@smlxl/ui'
import type { Page } from '@/lib/api'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { describeError } from '@/lib/error-messages'
import { AuditTable } from '@/components/shared/audit-table'
import { Pagination } from '@/components/shared/pagination'

const ENTITIES = [
  'Meeting',
  'ActionItem',
  'CompletionProposal',
  'AiReviewItem',
  'User',
  'Area',
  'Project',
  'PlatformSettings',
  'WeeklyDigest',
  'GoogleSubscription',
]
const ANY = '__any'

export function AuditAdmin({ users, active }: { users: UserDto[]; active: boolean }) {
  const [filters, setFilters] = React.useState({
    entity: '',
    entityId: '',
    actorUserId: '',
    from: '',
    to: '',
  })
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const params = { ...filters, page, pageSize }
  const query = useQuery({
    queryKey: qk.audit(params),
    enabled: active,
    placeholderData: (prev) => prev,
    queryFn: () => clientApi.get<Page<AuditEntryDto>>('/admin/audit', { query: params }),
  })
  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-muted/50 p-3">
        <div className="flex flex-col gap-1">
          <Label>Entidad</Label>
          <Select
            value={filters.entity || ANY}
            onValueChange={(v) => set({ entity: v === ANY ? '' : v })}
          >
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todas</SelectItem>
              {ENTITIES.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="au-id">Id de entidad</Label>
          <Input
            id="au-id"
            className="h-8 w-64 font-mono text-xs"
            value={filters.entityId}
            onChange={(e) => set({ entityId: e.target.value.trim() })}
            placeholder="uuid"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Actor</Label>
          <Select
            value={filters.actorUserId || ANY}
            onValueChange={(v) => set({ actorUserId: v === ANY ? '' : v })}
          >
            <SelectTrigger size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Cualquiera</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="au-from">Desde</Label>
          <Input
            id="au-from"
            type="date"
            className="h-8 w-36 text-xs"
            value={filters.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="au-to">Hasta</Label>
          <Input
            id="au-to"
            type="date"
            className="h-8 w-36 text-xs"
            value={filters.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set({ entity: '', entityId: '', actorUserId: '', from: '', to: '' })}
        >
          <X />
          Limpiar
        </Button>
      </div>
      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          title={describeError(query.error).title}
          message={describeError(query.error).message}
          code={describeError(query.error).code}
          onRetry={() => void query.refetch()}
          compact
        />
      ) : !query.data || query.data.items.length === 0 ? (
        <EmptyState
          title="Sin registros de auditoría"
          description="Ajusta los filtros o espera a que ocurran mutaciones."
        />
      ) : (
        <div>
          <AuditTable entries={query.data.items} />
          <div className="rounded-b-lg border border-t-0 border-border bg-surface">
            <Pagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s)
                setPage(1)
              }}
              pageSizes={[25, 50, 100, 200]}
              itemLabel="registros"
            />
          </div>
        </div>
      )}
    </div>
  )
}
