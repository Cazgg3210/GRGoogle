'use client'

import { useQuery } from '@tanstack/react-query'
import type { AuditEntryDto } from '@smlxl/contracts'
import { EmptyState, ErrorState, Skeleton } from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { describeError } from '@/lib/error-messages'
import { AuditTable } from '@/components/shared/audit-table'

export function MeetingAudit({ meetingId, active }: { meetingId: string; active: boolean }) {
  const query = useQuery({
    queryKey: qk.meetingAudit(meetingId),
    enabled: active,
    queryFn: () => clientApi.get<AuditEntryDto[]>(`/meetings/${meetingId}/audit`),
  })
  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
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
        compact
        onRetry={() => void query.refetch()}
      />
    )
  }
  const entries = query.data ?? []
  if (entries.length === 0)
    return (
      <EmptyState
        title="Sin eventos de auditoría"
        description="Las mutaciones sensibles sobre esta reunión aparecerán aquí."
      />
    )
  return <AuditTable entries={entries} />
}
