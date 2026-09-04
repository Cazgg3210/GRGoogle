'use client'

import * as React from 'react'
import Link from 'next/link'
import { ExternalLink, Sparkles, X } from 'lucide-react'
import {
  ExtractedActionItemSchema,
  type AiReviewItemDto,
  type ExtractedActionItemDto,
} from '@smlxl/contracts'
import type { AiReviewReason } from '@smlxl/domain'
import {
  AI_REVIEW_REASON_LABELS,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  Label,
  PRIORITY_LABELS,
  RECONCILE_DECISION_LABELS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  formatDate,
  formatDateTime,
  formatPercent,
  labelFor,
} from '@smlxl/ui'
import type { Page } from '@/lib/api'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'
import { useUrlState } from '@/lib/hooks/use-url-state'
import { CatalogSelect } from '@/components/shared/catalog-select'
import { EvidenceDrawer } from '@/components/shared/evidence-drawer'
import { Pagination } from '@/components/shared/pagination'

const REASONS = Object.keys(AI_REVIEW_REASON_LABELS) as AiReviewReason[]

function parseExtracted(raw: unknown): ExtractedActionItemDto | null {
  const r = ExtractedActionItemSchema.safeParse(raw)
  return r.success ? r.data : null
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : ` (${formatPercent(v)})`
}

export function ReviewList({
  page,
  reason,
  meetingId,
}: {
  page: Page<AiReviewItemDto>
  reason?: string
  meetingId?: string
}) {
  const url = useUrlState()
  const items = React.useMemo(() => {
    const pending = page.items.filter((i) => i.status === 'PENDING')
    return reason ? pending.filter((i) => i.reasons.includes(reason)) : pending
  }, [page.items, reason])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Motivo
        </span>
        <button
          type="button"
          onClick={() => url.set({ reason: null })}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs transition-colors',
            !reason
              ? 'border-ink-900 bg-ink-900 text-paper-50'
              : 'border-border hover:bg-paper-100',
          )}
        >
          Todos
        </button>
        {REASONS.map((r) => {
          const meta = AI_REVIEW_REASON_LABELS[r]
          const n = page.items.filter((i) => i.status === 'PENDING' && i.reasons.includes(r)).length
          return (
            <button
              key={r}
              type="button"
              onClick={() => url.set({ reason: reason === r ? null : r })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                reason === r
                  ? 'border-ink-900 bg-ink-900 text-paper-50'
                  : 'border-border hover:bg-paper-100',
              )}
            >
              {meta.label} <span className="font-mono opacity-70">{n}</span>
            </button>
          )
        })}
        {meetingId ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => url.set({ meetingId: null })}
            className="ml-auto"
          >
            <X />
            Quitar filtro de reunión
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nada pendiente de revisión"
          description="Cuando la IA no esté segura de un compromiso, aparecerá aquí para que una persona decida."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <ReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <div className="rounded-lg border border-border bg-surface">
        <Pagination
          page={page.page}
          pageSize={page.pageSize}
          total={page.total}
          onPageChange={(p) => url.set({ page: p === 1 ? null : p }, { resetPage: false })}
          itemLabel="elementos"
        />
      </div>
    </div>
  )
}

function ReviewCard({ item }: { item: AiReviewItemDto }) {
  const extracted = React.useMemo(() => parseExtracted(item.extracted), [item.extracted])
  const [dialog, setDialog] = React.useState<null | 'approve' | 'merge' | 'reject'>(null)
  const [evidenceOpen, setEvidenceOpen] = React.useState(false)
  const invalidate = [
    ['ai-review'],
    qk.notifications,
    ['action-items'],
    ['dashboard'],
    qk.meetingReviewItems(item.meetingId),
  ]

  const approve = useApiMutation<AiReviewItemDto, Record<string, unknown>>({
    mutationFn: (body) => clientApi.post<AiReviewItemDto>(`/ai-review/${item.id}/approve`, body),
    successMessage: 'Pendiente creado a partir de la extracción',
    invalidate,
    onSuccess: () => setDialog(null),
  })
  const merge = useApiMutation<AiReviewItemDto, Record<string, unknown>>({
    mutationFn: (body) => clientApi.post<AiReviewItemDto>(`/ai-review/${item.id}/merge`, body),
    successMessage: 'Pendiente existente actualizado',
    invalidate,
    onSuccess: () => setDialog(null),
  })
  const reject = useApiMutation<AiReviewItemDto, Record<string, unknown>>({
    mutationFn: (body) => clientApi.post<AiReviewItemDto>(`/ai-review/${item.id}/reject`, body),
    successMessage: 'Extracción descartada',
    invalidate,
    onSuccess: () => setDialog(null),
  })

  const quote =
    extracted?.evidence[0]?.text ??
    (typeof item.extracted === 'object' && item.extracted && 'title' in item.extracted
      ? String((item.extracted as { title: unknown }).title)
      : null)
  const title = extracted?.title ?? quote ?? 'Extracción sin título'
  const evidence = extracted?.evidence ?? []

  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <span className="flex size-6 items-center justify-center rounded-sm bg-ai-50 text-ai-700">
          <Sparkles className="size-3.5" />
        </span>
        {item.reasons.map((r) => {
          const meta = labelFor(AI_REVIEW_REASON_LABELS, r)
          return (
            <Badge key={r} tone={meta.tone}>
              {meta.label}
            </Badge>
          )
        })}
        <span className="ml-auto text-xs text-muted-foreground" title={item.reconcileDecision}>
          {(RECONCILE_DECISION_LABELS as Record<string, string>)[item.reconcileDecision] ??
            item.reconcileDecision}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ai-700">
            IA detectó:
          </p>
          <blockquote className="mt-1 border-l-2 border-signal-400 pl-3 font-display text-xl leading-snug text-ink-950">
            “{quote ?? title}”
          </blockquote>
          {extracted && quote !== extracted.title ? (
            <p className="mt-2 text-sm font-medium">{extracted.title}</p>
          ) : null}
          {extracted?.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{extracted.description}</p>
          ) : null}
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Responsable sugerido</dt>
            <dd className="font-medium">
              {item.suggestedOwnerName ?? extracted?.owner?.name ?? (
                <span className="text-warning-800">No identificado</span>
              )}
              <span className="text-muted-foreground">{pct(item.suggestedOwnerConfidence)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fecha sugerida</dt>
            <dd className="font-medium">
              {item.suggestedDueDate ? (
                formatDate(item.suggestedDueDate)
              ) : extracted?.dueDate ? (
                formatDate(extracted.dueDate)
              ) : (
                <span className="text-warning-800">Sin fecha</span>
              )}
              <span className="text-muted-foreground">{pct(item.suggestedDueDateConfidence)}</span>
              {extracted?.dueDateTextOriginal ? (
                <span className="block text-xs text-muted-foreground">
                  “{extracted.dueDateTextOriginal}”
                </span>
              ) : null}
            </dd>
          </div>
          {item.candidateActionItemId ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Coincide con pendiente existente</dt>
              <dd className="font-medium">
                <Link
                  href={`/pendientes/${item.candidateActionItemId}`}
                  className="font-mono text-info-700 hover:underline"
                >
                  #{item.candidateActionItemKey ?? item.candidateActionItemId.slice(0, 8)}
                </Link>
                {item.candidateActionItemTitle ? (
                  <span className="ml-1">{item.candidateActionItemTitle}</span>
                ) : null}
                <span className="text-muted-foreground">{pct(item.candidateScore)}</span>
              </dd>
            </div>
          ) : null}
          {extracted ? (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Confianza global{' '}
                <span className="font-mono">{formatPercent(extracted.confidence)}</span>
              </span>
              {extracted.priority ? (
                <Badge tone={PRIORITY_LABELS[extracted.priority].tone}>
                  {PRIORITY_LABELS[extracted.priority].label}
                </Badge>
              ) : null}
              <Badge>hint: {extracted.statusHint}</Badge>
            </div>
          ) : null}
        </dl>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Link
            href={`/reuniones/${item.meetingId}`}
            className="inline-flex items-center gap-1 text-info-700 hover:underline"
          >
            {item.meetingTitle}
            <ExternalLink className="size-3" />
          </Link>
          <span>{formatDateTime(item.meetingStartAt)}</span>
          <button
            type="button"
            className="text-ai-700 hover:underline"
            onClick={() => setEvidenceOpen(true)}
            disabled={evidence.length === 0}
          >
            Ver evidencia{evidence.length ? ` (${evidence.length})` : ''}
          </button>
        </p>
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
        {item.candidateActionItemId ? (
          <Button size="sm" onClick={() => setDialog('merge')}>
            Actualizar existente
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={item.candidateActionItemId ? 'outline' : 'default'}
          onClick={() => setDialog('approve')}
        >
          Crear nuevo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-danger-700"
          onClick={() => setDialog('reject')}
        >
          Descartar
        </Button>
      </footer>

      <ApproveDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        item={item}
        extracted={extracted}
        loading={approve.isPending}
        onSubmit={(b) => approve.mutate(b)}
      />
      <MergeDialog
        open={dialog === 'merge'}
        onOpenChange={(o) => !o && setDialog(null)}
        item={item}
        loading={merge.isPending}
        onSubmit={(b) => merge.mutate(b)}
      />
      <RejectDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        loading={reject.isPending}
        onSubmit={(b) => reject.mutate(b)}
      />
      <EvidenceDrawer
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        title={title}
        meetingId={item.meetingId}
        meetingTitle={item.meetingTitle}
        meetingStartAt={item.meetingStartAt}
        evidence={evidence}
      />
    </article>
  )
}

function ApproveDialog({
  open,
  onOpenChange,
  item,
  extracted,
  loading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  item: AiReviewItemDto
  extracted: ExtractedActionItemDto | null
  loading: boolean
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [title, setTitle] = React.useState('')
  const [owner, setOwner] = React.useState<string | null>(null)
  const [dueDate, setDueDate] = React.useState('')
  const [priority, setPriority] = React.useState<string>('MEDIUM')
  const [note, setNote] = React.useState('')
  React.useEffect(() => {
    if (open) {
      setTitle(extracted?.title ?? '')
      setOwner(item.suggestedOwnerUserId)
      setDueDate(item.suggestedDueDate ?? extracted?.dueDate ?? '')
      setPriority(extracted?.priority ?? 'MEDIUM')
      setNote('')
    }
  }, [open, item, extracted])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear pendiente nuevo</DialogTitle>
          <DialogDescription>
            Puedes corregir lo que la IA sugirió antes de crearlo. La evidencia y la reunión origen
            se conservan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Título" htmlFor="ap-title" required>
            <Input id="ap-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsable" htmlFor="ap-owner">
              <CatalogSelect
                id="ap-owner"
                kind="users"
                value={owner}
                onChange={setOwner}
                emptyLabel="Sin responsable"
              />
            </Field>
            <Field label="Fecha compromiso" htmlFor="ap-date">
              <Input
                id="ap-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <Field label="Prioridad" htmlFor="ap-priority">
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="ap-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Nota de revisión" htmlFor="ap-note">
            <Textarea
              id="ap-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={loading}
            disabled={title.trim().length < 3}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                ownerUserId: owner,
                dueDate: dueDate || null,
                priority,
                ...(note.trim() ? { note: note.trim() } : {}),
              })
            }
          >
            Crear pendiente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergeDialog({
  open,
  onOpenChange,
  item,
  loading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  item: AiReviewItemDto
  loading: boolean
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [target, setTarget] = React.useState<string>(item.candidateActionItemId ?? '')
  const [applyDueDate, setApplyDueDate] = React.useState(true)
  const [applyOwner, setApplyOwner] = React.useState(false)
  const [note, setNote] = React.useState('')
  React.useEffect(() => {
    if (open) {
      setTarget(item.candidateActionItemId ?? '')
      setApplyDueDate(true)
      setApplyOwner(false)
      setNote('')
    }
  }, [open, item])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar pendiente existente</DialogTitle>
          <DialogDescription>
            Se vinculará esta mención a{' '}
            <span className="font-mono">#{item.candidateActionItemKey ?? '…'}</span> y se registrará
            la evidencia. Elige qué datos aplicar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field
            label="Pendiente destino (id)"
            htmlFor="mg-target"
            hint="Por defecto el candidato detectado; pega otro id si corresponde."
          >
            <Input
              id="mg-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={applyDueDate} onCheckedChange={(v) => setApplyDueDate(Boolean(v))} />
            Aplicar fecha sugerida{' '}
            {item.suggestedDueDate ? `(${formatDate(item.suggestedDueDate)})` : '(sin fecha)'}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={applyOwner} onCheckedChange={(v) => setApplyOwner(Boolean(v))} />
            Aplicar responsable sugerido{' '}
            {item.suggestedOwnerName ? `(${item.suggestedOwnerName})` : '(ninguno)'}
          </label>
          <Field label="Nota" htmlFor="mg-note">
            <Textarea
              id="mg-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={loading}
            disabled={!target.trim()}
            onClick={() =>
              onSubmit({
                targetActionItemId: target.trim(),
                applyDueDate,
                applyOwner,
                ...(note.trim() ? { note: note.trim() } : {}),
              })
            }
          >
            Actualizar existente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  loading: boolean
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [note, setNote] = React.useState('')
  React.useEffect(() => {
    if (open) setNote('')
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Descartar extracción</DialogTitle>
          <DialogDescription>
            No se creará ni modificará ningún pendiente. La decisión queda auditada.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rj-note">Motivo (opcional)</Label>
          <Textarea
            id="rj-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. No es un compromiso, es una opinión."
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={() => onSubmit(note.trim() ? { note: note.trim() } : {})}
          >
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
