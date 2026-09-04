import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import type { ActionItemDto } from '@smlxl/contracts'
import { AttentionReasonList, Card, CardContent, CardHeader, CardTitle, DueDate, EmptyState, PriorityBadge, StatusBadge, UserAvatar } from '@smlxl/ui'

export function AttentionList({ items }: { items: ActionItemDto[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="inline-flex items-center gap-2">
            <AlertCircle className="size-4 text-signal-600" />
            Necesitan atención
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Orden explicable: vencida + prioridad alta → cierre por aprobar → sin responsable → sin fecha → repetida → bloqueada → baja confianza.
          </p>
        </div>
        <Link href="/pendientes?sort=attention" className="text-xs text-info-700 hover:underline">
          Ver todos
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {items.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState compact title="Nada urgente por ahora" description="No hay pendientes con señales de atención en este período." />
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {items.slice(0, 8).map((it, idx) => (
              <li key={it.id} className="flex gap-4 px-5 py-3 transition-colors hover:bg-paper-100/60">
                <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-muted-foreground">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/pendientes/${it.id}`} className="font-mono text-[11px] text-info-700 hover:underline">
                      {it.externalKey}
                    </Link>
                    <StatusBadge status={it.status} />
                    <PriorityBadge priority={it.priority} compact />
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground" title="Score de atención">
                      {it.attentionScore}
                    </span>
                  </div>
                  <Link href={`/pendientes/${it.id}`} className="mt-1 block truncate text-sm font-medium text-foreground hover:underline">
                    {it.title}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {it.ownerName ?? it.externalAssigneeName ? (
                        <>
                          <UserAvatar name={it.ownerName ?? it.externalAssigneeName} size="xs" />
                          {it.ownerName ?? it.externalAssigneeName}
                        </>
                      ) : (
                        <span className="text-warning-800">Sin responsable</span>
                      )}
                    </span>
                    <DueDate value={it.dueDate} isOverdue={it.isOverdue} status={it.status} className="text-xs" />
                  </div>
                  <AttentionReasonList reasons={it.attentionReasons} compact className="mt-2" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
