'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bot,
  Check,
  ExternalLink,
  History,
  MessageSquare,
  Pencil,
  Quote,
  RotateCcw,
  User,
  X,
} from 'lucide-react'
import type { ActionItemDetailDto, CommentDto, CompletionProposalDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import {
  ACTION_ITEM_STATUS_LABELS,
  AttentionReasonList,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfidenceIndicator,
  DetailRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DueDate,
  EmptyState,
  InlineNotice,
  PROPOSAL_STATUS_LABELS,
  PriorityBadge,
  RELATION_TYPE_LABELS,
  RelativeDate,
  StatusBadge,
  Textarea,
  UserAvatar,
  cn,
  formatDate,
  formatDateTime,
  formatPercent,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'
import { useAppSession } from '@/components/session-context'
import { ActionItemQuickActions } from '@/components/action-items/quick-actions'
import {
  ActionItemForm,
  type ActionItemFormSubmit,
} from '@/components/action-items/action-item-form'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EvidenceDrawer, type EvidenceQuote } from '@/components/shared/evidence-drawer'

export function ActionItemDetail({ initial }: { initial: ActionItemDetailDto }) {
  const session = useAppSession()
  const query = useQuery({
    queryKey: qk.actionItem(initial.id),
    queryFn: () => clientApi.get<ActionItemDetailDto>(`/action-items/${initial.id}`),
    initialData: initial,
    staleTime: 10_000,
  })
  const item = query.data
  const canUpdate = session.permissions.includes(Permission.ACTION_ITEM_UPDATE)
  const [editOpen, setEditOpen] = React.useState(false)
  const [reopenOpen, setReopenOpen] = React.useState(false)
  const [evidence, setEvidence] = React.useState<{
    title: string
    meetingId: string | null
    meetingTitle: string | null
    meetingStartAt: string | null
    quotes: EvidenceQuote[]
  } | null>(null)

  const invalidate = [qk.actionItem(item.id), ['action-items'], ['dashboard'], qk.notifications]

  const update = useApiMutation<ActionItemDetailDto, ActionItemFormSubmit>({
    mutationFn: (values) =>
      clientApi.patch<ActionItemDetailDto>(`/action-items/${item.id}`, values),
    successMessage: 'Pendiente actualizado',
    invalidate,
    onSuccess: () => setEditOpen(false),
  })
  const reopen = useApiMutation<ActionItemDetailDto, string>({
    mutationFn: (reason) =>
      clientApi.post<ActionItemDetailDto>(`/action-items/${item.id}/reopen`, { reason }),
    successMessage: 'Pendiente reabierto',
    invalidate,
    onSuccess: () => setReopenOpen(false),
  })

  const pendingProposal = item.proposals.find((p) => p.status === 'PENDING')
  const owner = item.ownerName ?? item.externalAssigneeName

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/pendientes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Pendientes
        </Link>
      </div>

      <header
        className={cn(
          'rounded-xl border border-border bg-surface p-6 shadow-card',
          item.isOverdue && 'border-l-4 border-l-danger-500',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{item.externalKey}</span>
              <StatusBadge status={item.status} size="lg" />
              <PriorityBadge priority={item.priority} />
              {item.migrationTrust === 'LEGACY' ? (
                <Badge
                  tone="neutral"
                  title={item.legacyId ? `Id legado ${item.legacyId}` : undefined}
                >
                  Legado
                </Badge>
              ) : null}
              {item.type === 'RECURRING' ? <Badge tone="info">Recurrente</Badge> : null}
              {item.requiresReview ? <Badge tone="ai">Requiere revisión</Badge> : null}
            </div>
            <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-ink-950">
              {item.title}
            </h1>
            {item.description ? (
              <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-foreground/90">
                {item.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {canUpdate && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' ? (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil />
                Editar
              </Button>
            ) : null}
            {canUpdate && item.status === 'COMPLETED' ? (
              <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}>
                <RotateCcw />
                Reabrir
              </Button>
            ) : null}
            <ActionItemQuickActions
              item={item}
              transitions={item.allowedTransitions}
              size="sm"
              showDetailLink={false}
            />
          </div>
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailRow label="Responsable">
            {owner ? (
              <span className="inline-flex items-center gap-2">
                <UserAvatar name={owner} size="sm" />
                {owner}
                {item.externalAssigneeName && !item.ownerName ? (
                  <Badge tone="neutral">Externo</Badge>
                ) : null}
              </span>
            ) : (
              <span className="text-warning-800">Sin responsable</span>
            )}
            {item.ownerTextOriginal && item.ownerTextOriginal !== owner ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Texto original: “{item.ownerTextOriginal}”
              </span>
            ) : null}
          </DetailRow>
          <DetailRow label="Fecha compromiso">
            <DueDate value={item.dueDate} isOverdue={item.isOverdue} status={item.status} />
            {item.dueDateTextOriginal ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Texto original: “{item.dueDateTextOriginal}”
                {item.dateConfidence !== null
                  ? ` · ${formatPercent(item.dateConfidence)} confianza`
                  : ''}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow label="Área / Proyecto">
            {item.areaName ?? '—'}
            {item.projectName ? (
              <span className="text-muted-foreground"> · {item.projectName}</span>
            ) : null}
          </DetailRow>
          <DetailRow label="Confianza IA">
            <ConfidenceIndicator value={item.confidence} />
          </DetailRow>
          <DetailRow label="Días abierto">
            <span className="tabular">{item.daysOpen}</span>
            {item.daysUntilDue !== null && item.status !== 'COMPLETED' ? (
              <span className="text-muted-foreground">
                {' '}
                ·{' '}
                {item.daysUntilDue >= 0
                  ? `${item.daysUntilDue} d para vencer`
                  : `${Math.abs(item.daysUntilDue)} d de retraso`}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow label="Creado">
            {formatDateTime(item.createdAt)}
            {item.createdFromMeetingId ? (
              <Link
                href={`/reuniones/${item.createdFromMeetingId}`}
                className="mt-0.5 block truncate text-xs text-info-700 hover:underline"
              >
                {item.createdFromMeetingTitle ?? 'Reunión origen'}
              </Link>
            ) : (
              <span className="mt-0.5 block text-xs text-muted-foreground">Captura manual</span>
            )}
          </DetailRow>
          <DetailRow label="Última mención">
            <RelativeDate value={item.lastMentionedAt} withTime />
          </DetailRow>
          <DetailRow label="Etiquetas">
            {item.tags.length ? (
              <span className="flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </span>
            ) : (
              '—'
            )}
          </DetailRow>
        </dl>

        {item.blocker ? (
          <InlineNotice tone="danger" title="Bloqueo" className="mt-5">
            {item.blocker}
          </InlineNotice>
        ) : null}
        {item.attentionReasons.length > 0 ? (
          <div className="mt-5 rounded-md border border-border bg-surface-muted/60 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Por qué necesita atención · score {item.attentionScore}
            </p>
            <AttentionReasonList reasons={item.attentionReasons} />
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <ProposalsPanel item={item} pendingProposal={pendingProposal} />
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="inline-flex items-center gap-2">
                <Quote className="size-4 text-ai-600" />
                Evidencia de origen
              </CardTitle>
              {item.sourceEvidence.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEvidence({
                      title: item.title,
                      meetingId: item.createdFromMeetingId,
                      meetingTitle: item.createdFromMeetingTitle,
                      meetingStartAt: null,
                      quotes: item.sourceEvidence,
                    })
                  }
                >
                  Ver evidencia
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {item.sourceEvidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin citas registradas (captura manual o importación legado).
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {item.sourceEvidence.map((ev, i) => (
                    <li key={i} className="border-l-2 border-signal-300 pl-3 text-sm">
                      <span className="font-display text-base leading-snug">“{ev.text}”</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {ev.speaker ?? 'Speaker no identificado'}
                        {ev.startTime ? ` · ${ev.startTime}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                Reuniones vinculadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {item.meetingLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este pendiente no se ha mencionado en reuniones procesadas.
                </p>
              ) : (
                <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
                  {item.meetingLinks.map((link) => (
                    <li key={link.id} className="relative">
                      <span
                        className="absolute -left-[26px] top-1 size-2.5 rounded-full border-2 border-surface bg-ink-500"
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {labelFor2(link.relationType)}
                        </span>
                        <Link
                          href={`/reuniones/${link.meetingId}`}
                          className="font-medium text-info-700 hover:underline"
                        >
                          {link.meetingTitle}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(link.meetingStartAt)}
                        </span>
                        {link.detectedStatus ? <StatusBadge status={link.detectedStatus} /> : null}
                        {link.detectedDueDate ? (
                          <span className="text-xs text-muted-foreground">
                            fecha detectada {formatDate(link.detectedDueDate)}
                          </span>
                        ) : null}
                      </div>
                      {link.evidence.length > 0 ? (
                        <button
                          type="button"
                          className="mt-1 text-xs text-ai-700 hover:underline"
                          onClick={() =>
                            setEvidence({
                              title: item.title,
                              meetingId: link.meetingId,
                              meetingTitle: link.meetingTitle,
                              meetingStartAt: link.meetingStartAt,
                              quotes: link.evidence,
                            })
                          }
                        >
                          Ver evidencia ({link.evidence.length})
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <CommentsPanel itemId={item.id} comments={item.comments} />
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Historial de estados</CardTitle>
            </CardHeader>
            <CardContent>
              {item.statusHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {[...item.statusHistory].reverse().map((h) => (
                    <li key={h.id} className="flex gap-3 text-sm">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper-200 text-paper-700">
                        {h.changedBySystem ? (
                          <Bot className="size-3.5" />
                        ) : (
                          <User className="size-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {h.fromStatus ? (
                            <>
                              <StatusBadge status={h.fromStatus} />
                              <span className="text-muted-foreground">→</span>
                            </>
                          ) : null}
                          <StatusBadge status={h.toStatus} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {h.changedBySystem ? 'Sistema' : (h.changedByName ?? 'Usuario')} ·{' '}
                          {formatDateTime(h.changedAt)}
                          {h.meetingId ? (
                            <>
                              {' · '}
                              <Link
                                href={`/reuniones/${h.meetingId}`}
                                className="text-info-700 hover:underline"
                              >
                                reunión
                              </Link>
                            </>
                          ) : null}
                        </p>
                        {h.reason ? (
                          <p className="mt-1 text-xs text-foreground/80">“{h.reason}”</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {item.proposals.filter((p) => p.status !== 'PENDING').length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Propuestas anteriores</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {item.proposals
                  .filter((p) => p.status !== 'PENDING')
                  .map((p) => (
                    <ProposalSummary key={p.id} proposal={p} />
                  ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Editar {item.externalKey}</DialogTitle>
            <DialogDescription>
              Los cambios quedan en auditoría. El estado se cambia desde “Acciones”.
            </DialogDescription>
          </DialogHeader>
          <ActionItemForm
            initial={item}
            onSubmit={(v) => update.mutate(v)}
            onCancel={() => setEditOpen(false)}
            loading={update.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="Reabrir pendiente"
        description="Pasará a “En progreso”. La reapertura queda auditada con el motivo."
        confirmLabel="Reabrir"
        loading={reopen.isPending}
        reasonLabel="Motivo"
        reasonRequired
        onConfirm={(reason) => reopen.mutate(reason)}
      />

      {evidence ? (
        <EvidenceDrawer
          open
          onOpenChange={(o) => !o && setEvidence(null)}
          title={evidence.title}
          meetingId={evidence.meetingId}
          meetingTitle={evidence.meetingTitle}
          meetingStartAt={evidence.meetingStartAt}
          evidence={evidence.quotes}
        />
      ) : null}
    </div>
  )
}

function labelFor2(relationType: string): string {
  return (RELATION_TYPE_LABELS as Record<string, string>)[relationType] ?? relationType
}

function ProposalsPanel({
  item,
  pendingProposal,
}: {
  item: ActionItemDetailDto
  pendingProposal: CompletionProposalDto | undefined
}) {
  const [decision, setDecision] = React.useState<'approve' | 'reject' | null>(null)
  const [comment, setComment] = React.useState('')
  const [returnTo, setReturnTo] = React.useState<'PENDING' | 'IN_PROGRESS'>('IN_PROGRESS')
  const [evidenceOpen, setEvidenceOpen] = React.useState(false)
  const invalidate = [qk.actionItem(item.id), ['action-items'], ['dashboard'], qk.notifications]

  const review = useApiMutation<ActionItemDetailDto, { kind: 'approve' | 'reject' }>({
    mutationFn: ({ kind }) =>
      clientApi.post<ActionItemDetailDto>(
        `/action-items/${item.id}/proposals/${pendingProposal?.id}/${kind}`,
        {
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          ...(kind === 'reject' ? { returnToStatus: returnTo } : {}),
        },
      ),
    successMessage: (_d, v) =>
      v.kind === 'approve' ? 'Cierre aprobado: pendiente completado' : 'Propuesta rechazada',
    invalidate,
    onSuccess: () => {
      setDecision(null)
      setComment('')
    },
  })

  if (!pendingProposal) {
    if (item.status === 'COMPLETED') {
      return (
        <InlineNotice tone="success" icon={Check} title="Completado">
          Cerrado el {formatDateTime(item.completedAt)} mediante aprobación humana.
        </InlineNotice>
      )
    }
    return null
  }

  const p = pendingProposal
  return (
    <section className="rounded-xl border-2 border-signal-300 bg-signal-50/50 p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-700">
            Propuesta de cierre pendiente
          </p>
          <h2 className="mt-1 font-display text-2xl leading-tight text-ink-950">
            {p.proposedByType === 'AI'
              ? 'La IA propone cerrar este pendiente'
              : `${p.proposedByName ?? 'Un usuario'} propone cerrar este pendiente`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(p.createdAt)}
            {p.proposedFromMeetingId ? (
              <>
                {' · desde '}
                <Link
                  href={`/reuniones/${p.proposedFromMeetingId}`}
                  className="text-info-700 hover:underline"
                >
                  {p.proposedFromMeetingTitle ?? 'reunión'}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {p.proposedByType === 'AI' ? (
            <Badge tone="ai">IA</Badge>
          ) : (
            <Badge tone="info">Usuario</Badge>
          )}
          <ConfidenceIndicator value={p.confidence} variant="dots" />
        </div>
      </div>
      <blockquote className="mt-4 border-l-2 border-signal-400 pl-4 text-sm text-foreground">
        {p.reason}
      </blockquote>
      {p.evidence.length > 0 ? (
        <Button
          variant="link"
          size="sm"
          className="mt-2 px-0"
          onClick={() => setEvidenceOpen(true)}
        >
          Ver evidencia ({p.evidence.length})
        </Button>
      ) : null}

      {item.canApproveCompletion ? (
        <div className="mt-5 flex flex-col gap-3 border-t border-signal-200 pt-4">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario para la auditoría (opcional)"
            rows={2}
            aria-label="Comentario de revisión"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="success"
              onClick={() => setDecision('approve')}
              loading={review.isPending && decision === 'approve'}
            >
              <Check />
              Aprobar cierre
            </Button>
            <Button
              variant="danger"
              onClick={() => setDecision('reject')}
              loading={review.isPending && decision === 'reject'}
            >
              <X />
              Rechazar
            </Button>
            <span className="text-xs text-muted-foreground">
              Sólo la aprobación marca el pendiente como completado.
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Requiere aprobación de un gerente, director o administrador con alcance sobre este
          pendiente.
        </p>
      )}

      <ConfirmDialog
        open={decision === 'approve'}
        onOpenChange={(o) => !o && setDecision(null)}
        title="Aprobar cierre"
        description={`${item.externalKey} pasará a Completado. Esta decisión queda registrada con tu usuario.`}
        confirmLabel="Aprobar y completar"
        variant="success"
        loading={review.isPending}
        onConfirm={() => review.mutate({ kind: 'approve' })}
      />
      <ConfirmDialog
        open={decision === 'reject'}
        onOpenChange={(o) => !o && setDecision(null)}
        title="Rechazar propuesta"
        description="El pendiente regresa a un estado abierto."
        confirmLabel="Rechazar"
        variant="danger"
        loading={review.isPending}
        onConfirm={() => review.mutate({ kind: 'reject' })}
      >
        <div className="flex gap-2">
          {(['IN_PROGRESS', 'PENDING'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setReturnTo(s)}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                returnTo === s
                  ? 'border-ink-900 bg-ink-900 text-paper-50'
                  : 'border-border hover:bg-paper-100',
              )}
            >
              Regresar a “{ACTION_ITEM_STATUS_LABELS[s].label}”
            </button>
          ))}
        </div>
      </ConfirmDialog>
      <EvidenceDrawer
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        title={`Cierre propuesto: ${item.title}`}
        meetingId={p.proposedFromMeetingId}
        meetingTitle={p.proposedFromMeetingTitle}
        evidence={p.evidence}
      />
    </section>
  )
}

function ProposalSummary({ proposal }: { proposal: CompletionProposalDto }) {
  const meta = PROPOSAL_STATUS_LABELS[proposal.status]
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-xs text-muted-foreground">
          {proposal.proposedByType === 'AI' ? 'IA' : (proposal.proposedByName ?? 'Usuario')} ·{' '}
          {formatDateTime(proposal.createdAt)}
        </span>
      </div>
      <p className="mt-1.5 text-foreground/90">{proposal.reason}</p>
      {proposal.reviewedAt ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Revisado {formatDateTime(proposal.reviewedAt)}
          {proposal.reviewComment ? ` · “${proposal.reviewComment}”` : ''}
        </p>
      ) : null}
    </div>
  )
}

function CommentsPanel({ itemId, comments }: { itemId: string; comments: CommentDto[] }) {
  const [body, setBody] = React.useState('')
  const add = useApiMutation<CommentDto, string>({
    mutationFn: (text) =>
      clientApi.post<CommentDto>(`/action-items/${itemId}/comments`, { body: text }),
    successMessage: 'Comentario agregado',
    invalidate: [qk.actionItem(itemId)],
    onSuccess: () => setBody(''),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          Comentarios
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comments.length === 0 ? (
          <EmptyState
            compact
            title="Sin comentarios"
            description="Deja contexto para el equipo o para quien apruebe el cierre."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <UserAvatar name={c.authorName ?? c.source} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {c.authorName ?? (c.source === 'AI' ? 'IA' : 'Sistema')}
                    </span>{' '}
                    · {formatDateTime(c.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim()) add.mutate(body.trim())
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Escribe un comentario…"
            aria-label="Nuevo comentario"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim()}>
              Comentar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExternalLinkIcon() {
  return <ExternalLink className="size-3" />
}
