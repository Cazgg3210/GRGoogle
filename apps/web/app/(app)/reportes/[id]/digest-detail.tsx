'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Send } from 'lucide-react'
import type { WeeklyDigestDto } from '@smlxl/contracts'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, InlineNotice, Tabs, SegmentedList, SegmentedTrigger, formatDate, formatDateTime } from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

/** Secciones A–G del digest (§18). Las llaves del payload se mapean por nombre conocido; el resto se muestra genérico. */
const SECTION_META: Array<{ letter: string; keys: string[]; title: string }> = [
  { letter: 'A', keys: ['executiveSummary', 'executiveNarrative', 'summary', 'resumen'], title: 'Resumen ejecutivo' },
  { letter: 'B', keys: ['kpis', 'indicators', 'metrics'], title: 'Indicadores de la semana' },
  { letter: 'C', keys: ['completed', 'completedItems', 'closed'], title: 'Completadas (aprobadas)' },
  { letter: 'D', keys: ['overdue', 'overdueItems', 'vencidas'], title: 'Vencidas y en riesgo' },
  { letter: 'E', keys: ['newItems', 'created', 'nuevas', 'highlights'], title: 'Nuevos compromisos' },
  { letter: 'F', keys: ['byArea', 'byPerson', 'areas', 'people'], title: 'Por área y por persona' },
  { letter: 'G', keys: ['meetings', 'captureQuality', 'risks', 'risksNarrative', 'nextWeek', 'upcoming'], title: 'Reuniones, calidad de captura y próxima semana' },
]

const KEY_LABELS: Record<string, string> = {
  executiveSummary: 'Resumen ejecutivo',
  executiveNarrative: 'Narrativa ejecutiva',
  highlights: 'Destacados',
  risksNarrative: 'Riesgos',
  kpis: 'KPIs',
  completed: 'Completadas',
  overdue: 'Vencidas',
  newItems: 'Nuevas',
  byArea: 'Por área',
  byPerson: 'Por persona',
  meetings: 'Reuniones',
  captureQuality: 'Calidad de captura',
  upcoming: 'Próximas',
  nextWeek: 'Próxima semana',
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function Value({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactElement {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  if (typeof value === 'string') return <span className="whitespace-pre-line">{value}</span>
  if (typeof value === 'number') return <span className="font-mono tabular">{value}</span>
  if (typeof value === 'boolean') return <Badge tone={value ? 'success' : 'neutral'}>{value ? 'Sí' : 'No'}</Badge>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">Sin elementos</span>
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return (
        <ul className="list-disc space-y-1 pl-5">
          {value.map((v, i) => (
            <li key={i}>{String(v)}</li>
          ))}
        </ul>
      )
    }
    if (value.every(isRecord)) {
      const cols = Array.from(new Set(value.flatMap((r) => Object.keys(r)))).slice(0, 10)
      return (
        <div className="overflow-x-auto rounded-md border border-border scrollbar-thin">
          <table className="w-full text-xs">
            <thead className="bg-surface-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                    {KEY_LABELS[c] ?? c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((r, i) => (
                <tr key={i} className="border-t border-border/70">
                  {cols.map((c) => (
                    <td key={c} className="max-w-[240px] px-2 py-1 align-top">
                      <Value value={r[c]} depth={depth + 1} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    return (
      <ul className="space-y-2">
        {value.map((v, i) => (
          <li key={i}>
            <Value value={v} depth={depth + 1} />
          </li>
        ))}
      </ul>
    )
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.every(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null)) {
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {entries.map(([k, v]) => (
            <div key={k} className="rounded-md bg-surface-muted/60 px-2.5 py-1.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{KEY_LABELS[k] ?? k}</dt>
              <dd className="text-sm">
                <Value value={v} depth={depth + 1} />
              </dd>
            </div>
          ))}
        </dl>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        {entries.map(([k, v]) => (
          <div key={k}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{KEY_LABELS[k] ?? k}</p>
            <Value value={v} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }
  return <span>{String(value)}</span>
}

export function DigestDetail({ digest, canSend }: { digest: WeeklyDigestDto; canSend: boolean }) {
  const [view, setView] = React.useState<'secciones' | 'correo'>('secciones')
  const [confirm, setConfirm] = React.useState(false)
  const send = useApiMutation<WeeklyDigestDto>({
    mutationFn: () => clientApi.post<WeeklyDigestDto>(`/reports/weekly/${digest.id}/send`),
    successMessage: 'Digest enviado',
    invalidate: [qk.digests, qk.digest(digest.id)],
    onSuccess: () => setConfirm(false),
  })
  const payload = isRecord(digest.payload) ? digest.payload : null
  const used = new Set<string>()
  const sections = payload
    ? SECTION_META.map((s) => {
        const present = s.keys.filter((k) => k in payload)
        present.forEach((k) => used.add(k))
        return { ...s, entries: present.map((k) => [k, payload[k]] as const) }
      })
    : []
  const rest = payload ? Object.entries(payload).filter(([k]) => !used.has(k)) : []

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reportes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" />
        Reportes
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-surface p-6 shadow-card">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-600">Digest semanal · {digest.audience}</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-ink-950">Semana {digest.weekLabel}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(digest.weekStart)} – {formatDate(digest.weekEnd)} · generado {formatDateTime(digest.generatedAt)} · versión {digest.version}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {digest.sentAt ? (
              <>
                <Badge tone="success">Enviado</Badge> {formatDateTime(digest.sentAt)} a {digest.recipientEmails.join(', ') || 'sin destinatarios'}
              </>
            ) : (
              <>
                <Badge tone="neutral">Sin enviar</Badge> Destinatarios configurados: {digest.recipientEmails.join(', ') || 'ninguno'}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as 'secciones' | 'correo')}>
            <SegmentedList>
              <SegmentedTrigger value="secciones">Secciones</SegmentedTrigger>
              <SegmentedTrigger value="correo">
                <Mail className="size-3.5" />
                Vista de correo
              </SegmentedTrigger>
            </SegmentedList>
          </Tabs>
          {canSend ? (
            <Button onClick={() => setConfirm(true)}>
              <Send />
              {digest.sentAt ? 'Reenviar' : 'Enviar'}
            </Button>
          ) : null}
        </div>
      </header>

      {view === 'secciones' ? (
        !payload ? (
          <InlineNotice tone="warning">El digest no tiene contenido estructurado.</InlineNotice>
        ) : (
          <div className="grid gap-4">
            {sections
              .filter((s) => s.entries.length > 0)
              .map((s) => (
                <Card key={s.letter}>
                  <CardHeader className="flex-row items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-sm bg-ink-900 font-display text-lg text-paper-50">{s.letter}</span>
                    <CardTitle>{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {s.entries.map(([k, v]) => (
                      <div key={k}>
                        {s.entries.length > 1 ? <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{KEY_LABELS[k] ?? k}</p> : null}
                        <Value value={v} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            {rest.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Otros datos</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {rest.map(([k, v]) => (
                    <div key={k}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{KEY_LABELS[k] ?? k}</p>
                      <Value value={v} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        )
      ) : digest.emailPreviewHtml ? (
        <div className="overflow-hidden rounded-xl border border-border bg-paper-200 p-4 shadow-card">
          <iframe
            title={`Vista previa del correo ${digest.weekLabel}`}
            sandbox=""
            srcDoc={digest.emailPreviewHtml}
            className="h-[75dvh] w-full rounded-md border border-border bg-white"
          />
        </div>
      ) : (
        <InlineNotice tone="neutral">Este digest no incluye vista previa de correo.</InlineNotice>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Enviar digest por correo"
        description={`Se enviará a: ${digest.recipientEmails.join(', ') || 'los destinatarios configurados'}. Requiere GMAIL_NOTIFICATIONS_ENABLED; en modo fake se registra sin enviar.`}
        confirmLabel="Enviar"
        variant="accent"
        loading={send.isPending}
        onConfirm={() => send.mutate()}
      />
    </div>
  )
}
