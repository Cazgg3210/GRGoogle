import type {
  ActionItemPriority,
  ActionItemStatus,
  ArtifactStatus,
  AttentionReason,
  CaptureQualityBucket,
  ConfidentialityLevel,
  MeetingProcessingStatus,
  UserRole,
} from '@smlxl/domain'
import { AlertTriangle, ArrowDown, ArrowUp, Flame, Minus } from 'lucide-react'
import { Badge } from '../components/badge.js'
import { cn } from '../lib/cn.js'
import {
  ACTION_ITEM_STATUS_LABELS,
  AI_ANALYSIS_STATUS_LABELS,
  ARTIFACT_STATUS_LABELS,
  ATTENTION_REASON_LABELS,
  CAPTURE_QUALITY_LABELS,
  CONFIDENTIALITY_LABELS,
  PRIORITY_LABELS,
  PROCESSING_STATUS_LABELS,
  ROLE_LABELS,
  labelFor,
} from '../lib/labels.js'

export function StatusBadge({
  status,
  className,
  size,
}: {
  status: ActionItemStatus | string
  className?: string
  size?: 'default' | 'lg'
}) {
  const meta = labelFor(ACTION_ITEM_STATUS_LABELS, status)
  return (
    <Badge tone={meta.tone} size={size} dot className={className} title={meta.description}>
      {meta.label}
    </Badge>
  )
}

const PRIORITY_ICON: Record<ActionItemPriority, React.ComponentType<{ className?: string }>> = {
  LOW: ArrowDown,
  MEDIUM: Minus,
  HIGH: ArrowUp,
  URGENT: Flame,
}

export function PriorityBadge({
  priority,
  className,
  compact,
}: {
  priority: ActionItemPriority | string
  className?: string
  compact?: boolean
}) {
  const meta = labelFor(PRIORITY_LABELS, priority)
  const Icon = PRIORITY_ICON[priority as ActionItemPriority] ?? Minus
  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-sm',
          meta.tone === 'danger' && 'bg-danger-100 text-danger-700',
          meta.tone === 'warning' && 'bg-warning-100 text-warning-700',
          meta.tone === 'info' && 'bg-info-50 text-info-700',
          meta.tone === 'neutral' && 'bg-paper-200 text-paper-700',
          className,
        )}
        title={`Prioridad ${meta.label.toLowerCase()}`}
        aria-label={`Prioridad ${meta.label.toLowerCase()}`}
      >
        <Icon className="size-3" />
      </span>
    )
  }
  return (
    <Badge tone={meta.tone} className={className}>
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  )
}

export function ProcessingStatusBadge({
  status,
  className,
  size,
}: {
  status: MeetingProcessingStatus | string
  className?: string
  size?: 'default' | 'lg'
}) {
  const meta = labelFor(PROCESSING_STATUS_LABELS, status)
  const busy = status === 'ANALYZING' || status === 'INGESTING'
  return (
    <Badge
      tone={meta.tone}
      size={size}
      className={cn(busy && 'animate-pulse-soft', className)}
      title={meta.description}
    >
      {meta.label}
    </Badge>
  )
}

export function ArtifactStatusBadge({
  status,
  kind,
  className,
}: {
  status: ArtifactStatus | string
  kind?: 'transcript' | 'notes'
  className?: string
}) {
  const meta = labelFor(ARTIFACT_STATUS_LABELS, status)
  const prefix = kind === 'transcript' ? 'Transcript: ' : kind === 'notes' ? 'Notas: ' : ''
  return (
    <Badge
      tone={meta.tone}
      className={className}
      title={`${prefix}${meta.label}${meta.description ? ` — ${meta.description}` : ''}`}
    >
      {status === 'UNAVAILABLE_EXTERNAL_HOST' || status === 'CAPABILITY_BLOCKED' ? (
        <AlertTriangle className="size-3" />
      ) : null}
      {meta.label}
    </Badge>
  )
}

export function AiAnalysisBadge({ status, className }: { status: string; className?: string }) {
  const meta = labelFor(AI_ANALYSIS_STATUS_LABELS, status)
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  )
}

export function ConfidentialityBadge({
  level,
  className,
}: {
  level: ConfidentialityLevel | string
  className?: string
}) {
  const meta = labelFor(CONFIDENTIALITY_LABELS, level)
  if (level === 'NORMAL') return null
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  )
}

export function RoleBadge({ role, className }: { role: UserRole | string; className?: string }) {
  const meta = labelFor(ROLE_LABELS, role)
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  )
}

export function CaptureQualityChips({
  buckets,
  className,
}: {
  buckets: Array<CaptureQualityBucket | string>
  className?: string
}) {
  if (buckets.length === 0)
    return <span className="text-xs text-muted-foreground">Sin datos de captura</span>
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {buckets.map((b) => {
        const meta = labelFor(CAPTURE_QUALITY_LABELS, b)
        return (
          <Badge key={b} tone={meta.tone}>
            {meta.label}
          </Badge>
        )
      })}
    </div>
  )
}

export function AttentionReasonList({
  reasons,
  className,
  compact,
  max,
}: {
  reasons: Array<AttentionReason | string>
  className?: string
  compact?: boolean
  max?: number
}) {
  if (reasons.length === 0) return null
  const shown = max ? reasons.slice(0, max) : reasons
  const rest = reasons.length - shown.length
  if (compact) {
    return (
      <div className={cn('flex flex-wrap gap-1', className)}>
        {shown.map((r) => {
          const meta = labelFor(ATTENTION_REASON_LABELS, r)
          return (
            <Badge key={r} tone={meta.tone} title={meta.description}>
              {meta.label}
            </Badge>
          )
        })}
        {rest > 0 ? <Badge tone="neutral">+{rest}</Badge> : null}
      </div>
    )
  }
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {shown.map((r) => {
        const meta = labelFor(ATTENTION_REASON_LABELS, r)
        return (
          <li key={r} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                meta.tone === 'danger' && 'bg-danger-500',
                meta.tone === 'warning' && 'bg-warning-500',
                meta.tone === 'signal' && 'bg-signal-500',
                meta.tone === 'ai' && 'bg-ai-500',
                meta.tone === 'neutral' && 'bg-paper-500',
                meta.tone === 'info' && 'bg-info-500',
                meta.tone === 'success' && 'bg-success-500',
              )}
              aria-hidden
            />
            <span>
              <span className="font-medium">{meta.label}</span>
              {meta.description ? (
                <span className="text-muted-foreground"> — {meta.description}</span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
