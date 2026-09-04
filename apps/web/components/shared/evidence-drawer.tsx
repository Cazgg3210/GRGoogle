'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Quote } from 'lucide-react'
import {
  Badge,
  Button,
  InlineNotice,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
  formatClock,
  formatDateTime,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { isApiError } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import { describeError } from '@/lib/error-messages'

export interface EvidenceQuote {
  text: string
  speaker?: string | undefined
  startTime?: string | undefined
  endTime?: string | undefined
  segmentId?: string | undefined
}

export interface TranscriptSegment {
  id: string
  sequence: number
  speakerLabel: string
  text: string
  startAt: string | null
  endAt: string | null
  participantId: string | null
}

export interface TranscriptResponse {
  transcripts: Array<{
    id: string
    sourceType: string
    languageCode: string | null
    segments: TranscriptSegment[]
  }>
}

export function useTranscript(meetingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.meetingTranscript(meetingId ?? ''),
    enabled: Boolean(meetingId) && enabled,
    staleTime: 10 * 60_000,
    queryFn: () => clientApi.get<TranscriptResponse>(`/meetings/${meetingId}/transcript`),
  })
}

/** Segmentos aplanados (prefiere transcript de Meet; luego notas; luego manual). */
export function flattenSegments(data: TranscriptResponse | undefined): TranscriptSegment[] {
  if (!data) return []
  const order = ['MEET_TRANSCRIPT', 'MANUAL', 'MEET_SMART_NOTES']
  const sorted = [...data.transcripts].sort(
    (a, b) => order.indexOf(a.sourceType) - order.indexOf(b.sourceType),
  )
  const primary = sorted[0]
  return primary ? [...primary.segments].sort((a, b) => a.sequence - b.sequence) : []
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Localiza el segmento de una evidencia por segmentId o por coincidencia textual. */
export function locateSegment(segments: TranscriptSegment[], evidence: EvidenceQuote): number {
  if (evidence.segmentId) {
    const byId = segments.findIndex((s) => s.id === evidence.segmentId)
    if (byId >= 0) return byId
  }
  const needle = normalize(evidence.text)
  if (!needle) return -1
  const exact = segments.findIndex((s) => normalize(s.text).includes(needle))
  if (exact >= 0) return exact
  // Coincidencia parcial: primeras 6 palabras.
  const head = needle.split(' ').slice(0, 6).join(' ')
  if (head.length >= 12) {
    const partial = segments.findIndex((s) => normalize(s.text).includes(head))
    if (partial >= 0) return partial
  }
  // Coincidencia inversa: el segmento cabe dentro de la evidencia.
  return segments.findIndex((s) => {
    const n = normalize(s.text)
    return n.length >= 20 && needle.includes(n)
  })
}

export function EvidenceDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  meetingId,
  meetingTitle,
  meetingStartAt,
  evidence,
  contextSize = 2,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: React.ReactNode
  meetingId: string | null
  meetingTitle?: string | null
  meetingStartAt?: string | null
  evidence: EvidenceQuote[]
  contextSize?: number
}) {
  const transcript = useTranscript(meetingId, open)
  const segments = React.useMemo(() => flattenSegments(transcript.data), [transcript.data])
  const forbidden =
    transcript.isError &&
    isApiError(transcript.error) &&
    (transcript.error.status === 403 || transcript.error.status === 404)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ai-700">
            Evidencia IA
          </p>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {subtitle}
              {meetingId ? (
                <Link
                  href={`/reuniones/${meetingId}?tab=transcripcion`}
                  className="inline-flex items-center gap-1 text-info-700 hover:underline"
                >
                  {meetingTitle ?? 'Ver reunión'}
                  <ExternalLink className="size-3" />
                </Link>
              ) : null}
              {meetingStartAt ? (
                <span className="text-muted-foreground">· {formatDateTime(meetingStartAt)}</span>
              ) : null}
            </div>
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6 pt-5">
          {evidence.length === 0 ? (
            <InlineNotice tone="warning">
              Este elemento no conserva citas de evidencia.
            </InlineNotice>
          ) : null}
          {!meetingId ? (
            <InlineNotice tone="neutral">
              Sin reunión asociada: se muestra la cita sin contexto de transcripción.
            </InlineNotice>
          ) : forbidden ? (
            <InlineNotice tone="warning">
              No tienes acceso a la transcripción de esta reunión; se muestra sólo la cita
              registrada.
            </InlineNotice>
          ) : transcript.isError ? (
            <InlineNotice tone="danger" title={describeError(transcript.error).title}>
              {describeError(transcript.error).message}
            </InlineNotice>
          ) : null}

          {evidence.map((ev, i) => (
            <EvidenceBlock
              key={`${ev.segmentId ?? 'ev'}-${i}`}
              index={i}
              evidence={ev}
              segments={segments}
              loading={Boolean(meetingId) && transcript.isLoading}
              meetingStartAt={meetingStartAt ?? null}
              contextSize={contextSize}
            />
          ))}
          {meetingId ? (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/reuniones/${meetingId}?tab=transcripcion`}>
                  Abrir transcripción completa
                </Link>
              </Button>
            </div>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function EvidenceBlock({
  index,
  evidence,
  segments,
  loading,
  meetingStartAt,
  contextSize,
}: {
  index: number
  evidence: EvidenceQuote
  segments: TranscriptSegment[]
  loading: boolean
  meetingStartAt: string | null
  contextSize: number
}) {
  const idx = React.useMemo(() => locateSegment(segments, evidence), [segments, evidence])
  const before = idx >= 0 ? segments.slice(Math.max(0, idx - contextSize), idx) : []
  const match = idx >= 0 ? segments[idx] : undefined
  const after = idx >= 0 ? segments.slice(idx + 1, idx + 1 + contextSize) : []
  const time = evidence.startTime
    ? formatClock(evidence.startTime, meetingStartAt)
    : match?.startAt
      ? formatClock(match.startAt, meetingStartAt)
      : null

  return (
    <section className="rounded-lg border border-border bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Badge tone="ai">Cita {index + 1}</Badge>
        {evidence.speaker || match?.speakerLabel ? (
          <span className="text-sm font-medium">{evidence.speaker ?? match?.speakerLabel}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Speaker no identificado</span>
        )}
        {time ? (
          <span className="ml-auto font-mono text-xs text-muted-foreground">{time}</span>
        ) : null}
      </header>
      <div className="px-4 py-3">
        <blockquote className="relative border-l-2 border-signal-400 bg-signal-50/60 py-2 pl-4 pr-3 font-display text-lg leading-snug text-ink-950">
          <Quote
            className="absolute -left-2 -top-2 size-4 rotate-180 text-signal-400"
            aria-hidden
          />
          “{evidence.text}”
        </blockquote>
        {loading ? (
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : segments.length > 0 ? (
          idx >= 0 ? (
            <ol className="mt-3 flex flex-col gap-1.5">
              {before.map((s) => (
                <ContextLine key={s.id} segment={s} meetingStartAt={meetingStartAt} />
              ))}
              {match ? (
                <ContextLine segment={match} meetingStartAt={meetingStartAt} highlight />
              ) : null}
              {after.map((s) => (
                <ContextLine key={s.id} segment={s} meetingStartAt={meetingStartAt} />
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              No se localizó esta cita en la transcripción (puede haber sido parafraseada por la
              IA).
            </p>
          )
        ) : null}
      </div>
    </section>
  )
}

function ContextLine({
  segment,
  meetingStartAt,
  highlight,
}: {
  segment: TranscriptSegment
  meetingStartAt: string | null
  highlight?: boolean
}) {
  return (
    <li
      className={cn(
        'grid grid-cols-[64px_120px_1fr] gap-2 rounded-sm px-2 py-1 text-sm',
        highlight ? 'bg-warning-50 ring-1 ring-warning-200' : 'text-muted-foreground',
      )}
    >
      <span className="font-mono text-[11px] tabular text-muted-foreground">
        {formatClock(segment.startAt, meetingStartAt)}
      </span>
      <span className={cn('truncate text-xs font-medium', highlight ? 'text-ink-900' : '')}>
        {segment.speakerLabel}
      </span>
      <span className={cn(highlight && 'text-foreground')}>{segment.text}</span>
    </li>
  )
}
