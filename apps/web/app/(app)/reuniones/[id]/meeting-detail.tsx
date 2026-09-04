'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock, Globe, RefreshCw, ShieldAlert, Sparkles, Users } from 'lucide-react'
import type { ActionItemDto, AiReviewItemDto, MeetingDetailDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import {
  AI_REVIEW_REASON_LABELS,
  AiAnalysisBadge,
  ArtifactStatusBadge,
  Badge,
  Button,
  CaptureQualityChips,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CONFIDENTIALITY_LABELS,
  ConfidenceIndicator,
  ConfidentialityBadge,
  DetailRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DueDate,
  EmptyState,
  Field,
  InlineNotice,
  MEETING_SOURCE_LABELS,
  PROCESSING_STATUS_LABELS,
  PriorityBadge,
  ProcessingStatusBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserAvatar,
  cn,
  formatCurrencyUsd,
  formatDateTime,
  formatDuration,
  formatNumber,
  labelFor,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'
import { useUrlState } from '@/lib/hooks/use-url-state'
import { useAppSession } from '@/components/session-context'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EvidenceDrawer, type EvidenceQuote } from '@/components/shared/evidence-drawer'
import { CreateActionItemDialog } from '@/components/action-items/create-dialog'
import { ActionItemQuickActions } from '@/components/action-items/quick-actions'
import { TranscriptView } from './transcript-view'
import { MeetingAudit } from './meeting-audit'

const TABS = ['resumen', 'compromisos', 'decisiones', 'transcripcion', 'participantes', 'historial-ia', 'auditoria'] as const
type TabKey = (typeof TABS)[number]

export function MeetingDetailView({
  meeting,
  actionItems,
  actionItemsError,
  reviewItems,
  initialTab,
}: {
  meeting: MeetingDetailDto
  actionItems: ActionItemDto[]
  actionItemsError: string | null
  reviewItems: AiReviewItemDto[]
  initialTab?: string
}) {
  const session = useAppSession()
  const url = useUrlState()
  const tab: TabKey = (TABS as readonly string[]).includes(initialTab ?? '') ? (initialTab as TabKey) : 'resumen'
  const [evidence, setEvidence] = React.useState<{ title: string; quotes: EvidenceQuote[] } | null>(null)
  const [reprocessOpen, setReprocessOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  const canReprocess = session.permissions.includes(Permission.MEETING_REPROCESS)
  const canExclude = session.permissions.includes(Permission.MEETING_EXCLUDE)
  const canConfidentiality = session.permissions.includes(Permission.MEETING_SET_CONFIDENTIALITY)
  const canCreate = session.permissions.includes(Permission.ACTION_ITEM_CREATE)
  const canTranscript = session.permissions.includes(Permission.MEETING_READ_TRANSCRIPT)

  const reprocess = useApiMutation<{ queued: boolean; jobId?: string }>({
    mutationFn: () => clientApi.post(`/meetings/${meeting.id}/reprocess`),
    successMessage: 'Reprocesamiento encolado',
    invalidate: [qk.meeting(meeting.id), ['meetings']],
    onSuccess: () => setReprocessOpen(false),
  })

  const pendingReviews = reviewItems.filter((r) => r.status === 'PENDING')

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reuniones" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" />
        Reuniones
      </Link>

      <header className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ProcessingStatusBadge status={meeting.processingStatus} size="lg" />
              <AiAnalysisBadge status={meeting.aiAnalysisStatus} />
              <ConfidentialityBadge level={meeting.confidentialityLevel} />
              {meeting.excludedFromAi ? (
                <Badge tone="neutral">
                  <ShieldAlert className="size-3" />
                  Excluida de IA
                </Badge>
              ) : null}
              {meeting.isExternalHost ? (
                <Badge tone="warning">
                  <Globe className="size-3" />
                  Host externo
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">{MEETING_SOURCE_LABELS[meeting.source] ?? meeting.source}</span>
            </div>
            <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-ink-950">{meeting.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {formatDateTime(meeting.startAt)} · {formatDuration(meeting.durationSeconds)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                {meeting.participantCount} participantes
              </span>
              {meeting.organizerName || meeting.organizerEmail ? <span>Organiza {meeting.organizerName ?? meeting.organizerEmail}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCreate ? <CreateActionItemDialog meetingId={meeting.id} /> : null}
            {canExclude || canConfidentiality ? (
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <ShieldAlert />
                Confidencialidad / IA
              </Button>
            ) : null}
            {canReprocess ? (
              <Button variant="outline" size="sm" onClick={() => setReprocessOpen(true)} disabled={meeting.excludedFromAi}>
                <RefreshCw />
                Reprocesar
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailRow label="Calidad de captura">
            <CaptureQualityChips buckets={meeting.captureQuality} />
          </DetailRow>
          <DetailRow label="Artefactos">
            <span className="flex flex-wrap gap-1">
              <ArtifactStatusBadge status={meeting.transcriptStatus} kind="transcript" />
              <ArtifactStatusBadge status={meeting.smartNotesStatus} kind="notes" />
            </span>
          </DetailRow>
          <DetailRow label="Confianza de extracción">
            <ConfidenceIndicator value={meeting.extractionConfidence} />
          </DetailRow>
          <DetailRow label="Idioma">
            {meeting.detectedLanguageCode ?? meeting.reportedLanguageCode ?? '—'}
            {meeting.mixedLanguageDetected ? <span className="ml-1 text-xs text-warning-800">(mixto)</span> : null}
          </DetailRow>
        </dl>
        {meeting.lastErrorCode ? (
          <InlineNotice tone="danger" title="Último error de procesamiento" className="mt-4">
            <span className="font-mono text-xs">{meeting.lastErrorCode}</span>
          </InlineNotice>
        ) : null}
        {meeting.isExternalHost && (meeting.transcriptStatus === 'UNAVAILABLE_EXTERNAL_HOST' || meeting.smartNotesStatus === 'UNAVAILABLE_EXTERNAL_HOST') ? (
          <InlineNotice tone="warning" className="mt-4">
            Esta reunión fue organizada por un host externo: Google no garantiza que se generen transcripción ni notas para cuentas
            invitadas. Puedes importar la transcripción manualmente si la tienes.
          </InlineNotice>
        ) : null}
        {pendingReviews.length > 0 ? (
          <InlineNotice tone="ai" icon={Sparkles} className="mt-4" title={`${pendingReviews.length} elemento(s) esperan revisión humana`}>
            <Link href={`/revision-ia?meetingId=${meeting.id}`} className="underline">
              Ir a Revisión IA
            </Link>
          </InlineNotice>
        ) : null}
      </header>

      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'resumen' ? null : v })}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="compromisos">
            Compromisos <span className="font-mono text-[11px] text-muted-foreground">{actionItems.length}</span>
          </TabsTrigger>
          <TabsTrigger value="decisiones">
            Decisiones <span className="font-mono text-[11px] text-muted-foreground">{meeting.decisions.length}</span>
          </TabsTrigger>
          <TabsTrigger value="transcripcion">Transcripción</TabsTrigger>
          <TabsTrigger value="participantes">Participantes</TabsTrigger>
          <TabsTrigger value="historial-ia">Historial IA</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <SummaryTab meeting={meeting} />
        </TabsContent>

        <TabsContent value="compromisos">
          {actionItemsError ? (
            <InlineNotice tone="danger">No se pudieron cargar los compromisos ({actionItemsError}).</InlineNotice>
          ) : actionItems.length === 0 ? (
            <EmptyState
              title="Sin compromisos extraídos"
              description={
                meeting.processingStatus === 'COMPLETED'
                  ? 'El análisis no encontró compromisos en esta reunión.'
                  : `Estado de procesamiento: ${PROCESSING_STATUS_LABELS[meeting.processingStatus].label}.`
              }
              action={canCreate ? <CreateActionItemDialog meetingId={meeting.id} /> : undefined}
            />
          ) : (
            <div className="rounded-lg border border-border bg-surface shadow-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Clave</TableHead>
                    <TableHead>Compromiso</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Confianza</TableHead>
                    <TableHead>Evidencia</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionItems.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <Link href={`/pendientes/${it.id}`} className="font-mono text-xs text-info-700 hover:underline">
                          {it.externalKey}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[380px]">
                        <Link href={`/pendientes/${it.id}`} className="block truncate font-medium hover:underline">
                          {it.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1">
                          <PriorityBadge priority={it.priority} compact />
                          {it.requiresReview ? <Badge tone="ai">Revisión</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={it.status} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {it.ownerName ?? it.externalAssigneeName ?? <span className="text-warning-800">Sin responsable</span>}
                      </TableCell>
                      <TableCell>
                        <DueDate value={it.dueDate} isOverdue={it.isOverdue} status={it.status} />
                      </TableCell>
                      <TableCell>
                        <ConfidenceIndicator value={it.confidence} variant="inline" />
                      </TableCell>
                      <TableCell>
                        <Button variant="link" size="sm" className="px-0" disabled={it.sourceEvidence.length === 0} onClick={() => setEvidence({ title: it.title, quotes: it.sourceEvidence })}>
                          Ver evidencia{it.sourceEvidence.length ? ` (${it.sourceEvidence.length})` : ''}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <ActionItemQuickActions item={it} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="decisiones">
          {meeting.decisions.length === 0 ? (
            <EmptyState title="Sin decisiones registradas" description="La IA no detectó decisiones explícitas o la reunión aún no se analiza." />
          ) : (
            <ul className="flex flex-col gap-3">
              {meeting.decisions.map((d) => (
                <li key={d.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-3xl font-medium">{d.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge tone={d.status === 'CONFIRMED' ? 'success' : d.status === 'REJECTED' ? 'danger' : 'ai'}>
                        {d.status === 'CONFIRMED' ? 'Confirmada' : d.status === 'REJECTED' ? 'Rechazada' : 'Propuesta'}
                      </Badge>
                      <ConfidenceIndicator value={d.confidence} variant="dots" />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {d.decidedBy ? <span>Decidió: {d.decidedBy}</span> : null}
                    {d.effectiveDate ? <span>Vigente desde {d.effectiveDate}</span> : null}
                    <Button variant="link" size="sm" className="h-auto px-0 text-xs" disabled={d.evidence.length === 0} onClick={() => setEvidence({ title: d.description, quotes: d.evidence })}>
                      Ver evidencia{d.evidence.length ? ` (${d.evidence.length})` : ''}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="transcripcion">
          {canTranscript ? (
            <TranscriptView meetingId={meeting.id} meetingStartAt={meeting.startAt} active={tab === 'transcripcion'} />
          ) : (
            <InlineNotice tone="warning">Tu rol no permite leer transcripciones.</InlineNotice>
          )}
        </TabsContent>

        <TabsContent value="participantes">
          {meeting.participants.length === 0 ? (
            <EmptyState title="Sin participantes registrados" />
          ) : (
            <div className="rounded-lg border border-border bg-surface shadow-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Participante</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Entró</TableHead>
                    <TableHead>Salió</TableHead>
                    <TableHead className="text-right">Habló</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meeting.participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar name={p.displayName} size="sm" />
                          <span className="font-medium">{p.displayName}</span>
                          {p.isInternal ? <Badge tone="info">Interno</Badge> : <Badge tone="neutral">Externo</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.email ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.participantType}</TableCell>
                      <TableCell className="font-mono text-xs">{p.joinedAt ? formatDateTime(p.joinedAt) : '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{p.leftAt ? formatDateTime(p.leftAt) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular">{formatDuration(p.speakingDurationSeconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial-ia">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Ejecuciones de procesamiento</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {meeting.processingRuns.length === 0 ? (
                  <div className="px-5 pb-5">
                    <EmptyState compact title="Sin ejecuciones" description="Aún no se ha ejecutado análisis para esta reunión." />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Inicio</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Proveedor / modelo</TableHead>
                        <TableHead>Prompt</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">Costo</TableHead>
                        <TableHead className="text-right">Latencia</TableHead>
                        <TableHead>Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meeting.processingRuns.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(r.startedAt)}</TableCell>
                          <TableCell className="text-sm">{r.kind}</TableCell>
                          <TableCell className="text-xs">
                            {r.provider} · <span className="font-mono">{r.model}</span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.promptVersion} / {r.schemaVersion}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular">
                            {formatNumber(r.inputTokens)} → {formatNumber(r.outputTokens)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular">{formatCurrencyUsd(r.estimatedCostUsd)}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular">{r.latencyMs !== null ? `${formatNumber(r.latencyMs)} ms` : '—'}</TableCell>
                          <TableCell>
                            {r.success ? <Badge tone="success">OK</Badge> : <Badge tone="danger">{r.errorCode ?? 'Error'}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Elementos de revisión IA</CardTitle>
                {pendingReviews.length > 0 ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/revision-ia?meetingId=${meeting.id}`}>Resolver en Revisión IA</Link>
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {reviewItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">La IA no dejó elementos para revisión en esta reunión.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {reviewItems.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        <Badge tone={r.status === 'PENDING' ? 'signal' : r.status === 'REJECTED' ? 'danger' : 'success'}>
                          {r.status === 'PENDING' ? 'Pendiente' : r.status === 'APPROVED' ? 'Aprobado' : r.status === 'MERGED' ? 'Fusionado' : 'Descartado'}
                        </Badge>
                        <span className="flex flex-wrap gap-1">
                          {r.reasons.map((reason) => (
                            <Badge key={reason} tone={labelFor(AI_REVIEW_REASON_LABELS, reason).tone}>
                              {labelFor(AI_REVIEW_REASON_LABELS, reason).label}
                            </Badge>
                          ))}
                        </span>
                        {r.candidateActionItemKey ? (
                          <span className="text-xs text-muted-foreground">
                            coincide con <span className="font-mono">{r.candidateActionItemKey}</span>
                          </span>
                        ) : null}
                        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="auditoria">
          <MeetingAudit meetingId={meeting.id} active={tab === 'auditoria'} />
        </TabsContent>
      </Tabs>

      {evidence ? (
        <EvidenceDrawer open onOpenChange={(o) => !o && setEvidence(null)} title={evidence.title} meetingId={meeting.id} meetingTitle={meeting.title} meetingStartAt={meeting.startAt} evidence={evidence.quotes} />
      ) : null}

      <ConfirmDialog
        open={reprocessOpen}
        onOpenChange={setReprocessOpen}
        title="Reprocesar reunión"
        description="Se volverá a ejecutar el análisis IA. Los compromisos ya aprobados no se duplican: se reconcilian contra el backlog."
        confirmLabel="Encolar reprocesamiento"
        loading={reprocess.isPending}
        onConfirm={() => reprocess.mutate()}
      />

      <MeetingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} meeting={meeting} canExclude={canExclude} canConfidentiality={canConfidentiality} />
    </div>
  )
}

function SummaryTab({ meeting }: { meeting: MeetingDetailDto }) {
  const s = meeting.summary
  if (!s) {
    const meta = PROCESSING_STATUS_LABELS[meeting.processingStatus]
    return (
      <EmptyState
        icon={Sparkles}
        title="Aún no hay resumen IA"
        description={
          meeting.excludedFromAi
            ? 'La reunión está excluida del análisis IA.'
            : `Estado: ${meta.label}. ${meta.description ?? ''} El resumen aparecerá cuando el análisis termine.`
        }
      />
    )
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-ai-600" />
              Resumen ejecutivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {s.executiveSummary.map((line, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-signal-500" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {s.detailedSummary ? (
          <Card>
            <CardHeader>
              <CardTitle>Resumen detallado</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{s.detailedSummary}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Temas</CardTitle>
          </CardHeader>
          <CardContent>
            {s.topics.length ? (
              <div className="flex flex-wrap gap-1.5">
                {s.topics.map((t) => (
                  <Badge key={t} size="lg">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin temas.</p>
            )}
          </CardContent>
        </Card>
        <Card className={cn(s.risks.length && 'border-warning-200')}>
          <CardHeader>
            <CardTitle>Riesgos</CardTitle>
          </CardHeader>
          <CardContent>
            {s.risks.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {s.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin riesgos señalados.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preguntas abiertas</CardTitle>
          </CardHeader>
          <CardContent>
            {s.openQuestions.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {s.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin preguntas abiertas.</p>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Generado {formatDateTime(s.generatedAt)} · <span className="font-mono">{s.aiModel}</span> · prompt {s.promptVersion}
          {s.approvedAt ? ` · aprobado ${formatDateTime(s.approvedAt)}` : ''}
        </p>
      </div>
    </div>
  )
}

function MeetingSettingsDialog({
  open,
  onOpenChange,
  meeting,
  canExclude,
  canConfidentiality,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  meeting: MeetingDetailDto
  canExclude: boolean
  canConfidentiality: boolean
}) {
  const [level, setLevel] = React.useState(meeting.confidentialityLevel)
  const [excluded, setExcluded] = React.useState(meeting.excludedFromAi)
  React.useEffect(() => {
    if (open) {
      setLevel(meeting.confidentialityLevel)
      setExcluded(meeting.excludedFromAi)
    }
  }, [open, meeting.confidentialityLevel, meeting.excludedFromAi])
  const update = useApiMutation<MeetingDetailDto, Record<string, unknown>>({
    mutationFn: (body) => clientApi.patch<MeetingDetailDto>(`/meetings/${meeting.id}`, body),
    successMessage: 'Reunión actualizada',
    invalidate: [qk.meeting(meeting.id), ['meetings']],
    onSuccess: () => onOpenChange(false),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Confidencialidad y análisis IA</DialogTitle>
          <DialogDescription>Las reuniones jurídicas/ejecutivas restringen el acceso; excluir de IA detiene cualquier análisis aunque exista transcripción.</DialogDescription>
        </DialogHeader>
        {canConfidentiality ? (
          <Field label="Nivel de confidencialidad" htmlFor="m-level">
            <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
              <SelectTrigger id="m-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CONFIDENTIALITY_LABELS) as Array<keyof typeof CONFIDENTIALITY_LABELS>).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CONFIDENTIALITY_LABELS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {canExclude ? (
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Excluir del análisis IA</p>
              <p className="text-xs text-muted-foreground">No se generarán resúmenes ni compromisos.</p>
            </div>
            <Switch checked={excluded} onCheckedChange={setExcluded} aria-label="Excluir del análisis IA" />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate({
                ...(canConfidentiality ? { confidentialityLevel: level } : {}),
                ...(canExclude ? { excludedFromAi: excluded } : {}),
              })
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function useMeetingQuery(id: string, initial: MeetingDetailDto) {
  return useQuery({ queryKey: qk.meeting(id), queryFn: () => clientApi.get<MeetingDetailDto>(`/meetings/${id}`), initialData: initial })
}
