'use client'

import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  formatNumber,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { describeError } from '@/lib/error-messages'

interface JobsResponse {
  queues: Array<{
    name: string
    created: number
    active: number
    completed: number
    failed: number
  }>
}

export function JobsAdmin({ active }: { active: boolean }) {
  const query = useQuery({
    queryKey: qk.jobs,
    enabled: active,
    refetchInterval: 15_000,
    queryFn: () => clientApi.get<JobsResponse>('/admin/jobs'),
  })
  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }
  if (query.isError) {
    const d = describeError(query.error)
    return (
      <ErrorState
        title={d.title}
        message={d.message}
        code={d.code}
        onRetry={() => void query.refetch()}
        compact
      />
    )
  }
  const queues = query.data?.queues ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Cola pg-boss sobre PostgreSQL. Se actualiza cada 15 s.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          loading={query.isFetching}
        >
          <RefreshCw />
          Actualizar
        </Button>
      </div>
      {queues.length === 0 ? (
        <EmptyState
          title="Sin colas registradas"
          description="El worker registra las colas al iniciar."
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Cola</TableHead>
                <TableHead className="text-right">En espera</TableHead>
                <TableHead className="text-right">Activos</TableHead>
                <TableHead className="text-right">Completados</TableHead>
                <TableHead className="text-right">Fallidos</TableHead>
                <TableHead>Salud</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queues.map((q) => (
                <TableRow key={q.name}>
                  <TableCell className="font-mono text-xs">{q.name}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">
                    {formatNumber(q.created)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">
                    {formatNumber(q.active)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular text-success-700">
                    {formatNumber(q.completed)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono text-xs tabular',
                      q.failed > 0 && 'font-semibold text-danger-700',
                    )}
                  >
                    {formatNumber(q.failed)}
                  </TableCell>
                  <TableCell>
                    {q.failed > 0 ? (
                      <Badge tone="danger">Con fallos</Badge>
                    ) : q.active > 0 ? (
                      <Badge tone="info">Procesando</Badge>
                    ) : (
                      <Badge tone="success">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
