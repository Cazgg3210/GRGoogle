import { ActionItemPriority, ActionItemStatus } from '../enums.js'
import type { ActionItem } from '../entities.js'
import { isOverdue } from './dates.js'

/**
 * Score explicable de "Necesitan atención" (§20.5). El orden de razones es
 * el orden de prioridad del documento; cada razón aporta puntos y se devuelve
 * la lista de razones para mostrar el porqué en UI.
 */
export const AttentionReason = {
  OVERDUE_HIGH_PRIORITY: 'OVERDUE_HIGH_PRIORITY',
  OVERDUE: 'OVERDUE',
  COMPLETION_PROPOSED: 'COMPLETION_PROPOSED',
  NO_OWNER: 'NO_OWNER',
  NO_DUE_DATE: 'NO_DUE_DATE',
  REPEATED_WITHOUT_PROGRESS: 'REPEATED_WITHOUT_PROGRESS',
  BLOCKED: 'BLOCKED',
  LOW_AI_CONFIDENCE: 'LOW_AI_CONFIDENCE',
} as const
export type AttentionReason = (typeof AttentionReason)[keyof typeof AttentionReason]

const WEIGHTS: Record<AttentionReason, number> = {
  OVERDUE_HIGH_PRIORITY: 100,
  OVERDUE: 60,
  COMPLETION_PROPOSED: 50,
  NO_OWNER: 40,
  NO_DUE_DATE: 30,
  REPEATED_WITHOUT_PROGRESS: 25,
  BLOCKED: 20,
  LOW_AI_CONFIDENCE: 15,
}

export interface AttentionInput {
  item: Pick<
    ActionItem,
    'status' | 'priority' | 'dueDate' | 'ownerUserId' | 'externalAssigneeId' | 'confidence'
  >
  /** Veces que la tarea se ha mencionado en reuniones sin cambio de estado. */
  mentionsWithoutProgress?: number
  lowConfidenceThreshold?: number
}

export interface AttentionResult {
  score: number
  reasons: AttentionReason[]
}

export function attentionScore(
  input: AttentionInput,
  now: Date,
  timeZone?: string,
): AttentionResult {
  const { item } = input
  const reasons: AttentionReason[] = []
  if (item.status === ActionItemStatus.COMPLETED || item.status === ActionItemStatus.CANCELLED) {
    return { score: 0, reasons }
  }
  const overdue = isOverdue({ dueDate: item.dueDate, status: item.status }, now, timeZone)
  const highPriority =
    item.priority === ActionItemPriority.HIGH || item.priority === ActionItemPriority.URGENT
  if (overdue && highPriority) reasons.push(AttentionReason.OVERDUE_HIGH_PRIORITY)
  else if (overdue) reasons.push(AttentionReason.OVERDUE)
  if (item.status === ActionItemStatus.COMPLETION_PROPOSED)
    reasons.push(AttentionReason.COMPLETION_PROPOSED)
  if (!item.ownerUserId && !item.externalAssigneeId) reasons.push(AttentionReason.NO_OWNER)
  if (!item.dueDate) reasons.push(AttentionReason.NO_DUE_DATE)
  if ((input.mentionsWithoutProgress ?? 0) >= 2)
    reasons.push(AttentionReason.REPEATED_WITHOUT_PROGRESS)
  if (item.status === ActionItemStatus.BLOCKED) reasons.push(AttentionReason.BLOCKED)
  const threshold = input.lowConfidenceThreshold ?? 0.7
  if (item.confidence !== null && item.confidence < threshold)
    reasons.push(AttentionReason.LOW_AI_CONFIDENCE)
  const score = reasons.reduce((acc, r) => acc + WEIGHTS[r], 0)
  return { score, reasons }
}
