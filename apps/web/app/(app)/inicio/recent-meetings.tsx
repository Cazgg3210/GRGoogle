import Link from 'next/link'
import type { MeetingListItemDto } from '@smlxl/contracts'
import {
  ArtifactStatusBadge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfidenceIndicator,
  EmptyState,
  ProcessingStatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatDateTime,
  formatDuration,
} from '@smlxl/ui'

export function RecentMeetings({ meetings }: { meetings: MeetingListItemDto[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Reuniones recientes</CardTitle>
        <Link href="/reuniones" className="text-xs text-info-700 hover:underline">
          Ver todas
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {meetings.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              compact
              title="Sin reuniones recientes"
              description="Cuando se detecten reuniones de las cuentas monitoreadas aparecerán aquí."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Fecha</TableHead>
                <TableHead>Reunión</TableHead>
                <TableHead>Organizador</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Transcript</TableHead>
                <TableHead>Procesamiento</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
                <TableHead>Confianza</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(m.startAt)}
                  </TableCell>
                  <TableCell>
                    <Link href={`/reuniones/${m.id}`} className="font-medium hover:underline">
                      {m.title}
                    </Link>
                    {m.isExternalHost ? (
                      <span className="ml-2 text-[11px] uppercase tracking-wider text-warning-700">
                        host externo
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.organizerName ?? m.organizerEmail ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular">
                    {formatDuration(m.durationSeconds)}
                  </TableCell>
                  <TableCell>
                    <ArtifactStatusBadge status={m.transcriptStatus} kind="transcript" />
                  </TableCell>
                  <TableCell>
                    <ProcessingStatusBadge status={m.processingStatus} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">
                    {m.actionItemCount}
                    {m.pendingReviewCount > 0 ? (
                      <span className="ml-1 text-ai-700">(+{m.pendingReviewCount} rev.)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <ConfidenceIndicator value={m.extractionConfidence} variant="inline" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
