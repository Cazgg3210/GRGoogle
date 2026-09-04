'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { Badge, EmptyState, ErrorState, Input, Skeleton, cn, formatClock } from '@smlxl/ui'
import { describeError } from '@/lib/error-messages'
import { useTranscript, type TranscriptSegment } from '@/components/shared/evidence-drawer'

const SOURCE_LABELS: Record<string, string> = {
  MEET_TRANSCRIPT: 'Transcripción de Meet',
  MEET_SMART_NOTES: 'Smart Notes',
  MANUAL: 'Importación manual',
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-warning-200 px-0.5">{text.slice(idx, idx + term.length)}</mark>
      {highlight(text.slice(idx + term.length), term)}
    </>
  )
}

const SPEAKER_TONES = [
  'text-ink-800',
  'text-ai-700',
  'text-signal-700',
  'text-info-700',
  'text-success-700',
  'text-danger-700',
  'text-warning-800',
]

export function TranscriptView({
  meetingId,
  meetingStartAt,
  active,
}: {
  meetingId: string
  meetingStartAt: string
  active: boolean
}) {
  const query = useTranscript(meetingId, active)
  const [term, setTerm] = React.useState('')
  const [sourceId, setSourceId] = React.useState<string | null>(null)

  const transcripts = query.data?.transcripts ?? []
  const selected = transcripts.find((t) => t.id === sourceId) ?? transcripts[0]
  const segments = React.useMemo(
    () => (selected ? [...selected.segments].sort((a, b) => a.sequence - b.sequence) : []),
    [selected],
  )
  const speakers = React.useMemo(
    () => Array.from(new Set(segments.map((s) => s.speakerLabel))),
    [segments],
  )
  const filtered = React.useMemo(() => {
    const t = term.trim().toLowerCase()
    if (!t) return segments
    return segments.filter(
      (s) => s.text.toLowerCase().includes(t) || s.speakerLabel.toLowerCase().includes(t),
    )
  }, [segments, term])

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
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
  if (transcripts.length === 0 || segments.length === 0) {
    return (
      <EmptyState
        title="Sin transcripción disponible"
        description="Google no ha publicado la transcripción o la reunión no tiene artefactos ingeridos."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar en la transcripción…"
            className="pl-8"
            aria-label="Buscar en la transcripción"
          />
        </div>
        {transcripts.length > 1 ? (
          <div className="flex gap-1">
            {transcripts.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSourceId(t.id)}
                className={cn(
                  'rounded-sm border px-2 py-1 text-xs',
                  selected?.id === t.id
                    ? 'border-ink-900 bg-ink-900 text-paper-50'
                    : 'border-border hover:bg-paper-100',
                )}
              >
                {SOURCE_LABELS[t.sourceType] ?? t.sourceType}
              </button>
            ))}
          </div>
        ) : (
          <Badge>{SOURCE_LABELS[selected?.sourceType ?? ''] ?? selected?.sourceType}</Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} / {segments.length} intervenciones · {speakers.length} speakers
          {selected?.languageCode ? ` · ${selected.languageCode}` : ''}
        </span>
      </div>
      <ol className="max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-surface shadow-card scrollbar-thin">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            Sin coincidencias.
          </li>
        ) : (
          filtered.map((s) => (
            <SegmentRow
              key={s.id}
              segment={s}
              meetingStartAt={meetingStartAt}
              term={term.trim()}
              tone={SPEAKER_TONES[speakers.indexOf(s.speakerLabel) % SPEAKER_TONES.length] ?? ''}
            />
          ))
        )}
      </ol>
    </div>
  )
}

function SegmentRow({
  segment,
  meetingStartAt,
  term,
  tone,
}: {
  segment: TranscriptSegment
  meetingStartAt: string
  term: string
  tone: string
}) {
  return (
    <li
      id={`seg-${segment.id}`}
      className="grid grid-cols-[72px_150px_1fr] gap-3 border-b border-border/70 px-4 py-2 text-sm last:border-0 hover:bg-paper-100/60"
    >
      <span className="pt-0.5 font-mono text-[11px] tabular text-muted-foreground">
        {formatClock(segment.startAt, meetingStartAt)}
      </span>
      <span
        className={cn('truncate pt-0.5 text-xs font-semibold', tone)}
        title={segment.speakerLabel}
      >
        {highlight(segment.speakerLabel, term)}
      </span>
      <span className="leading-relaxed">{highlight(segment.text, term)}</span>
    </li>
  )
}
