import { ActionItemStatus } from '../enums.js'
import { DomainError, DomainErrorCode } from '../errors.js'

/**
 * Máquina de estados de ActionItem (§16.5 + §9.7, ADR-010).
 *
 * Regla inmutable: `COMPLETED` sólo se alcanza mediante la aprobación humana de
 * una CompletionProposal. La IA nunca escribe COMPLETED. Un humano tampoco
 * "salta" a COMPLETED desde un estado abierto sin pasar por la propuesta: el
 * caso de uso `ApproveCompletion` crea la propuesta (USER) y la aprueba en la
 * misma transacción, dejando la traza.
 */

export type TransitionActor =
  { kind: 'AI' } | { kind: 'USER'; userId: string } | { kind: 'SYSTEM' } | { kind: 'IMPORT' }

export interface TransitionContext {
  actor: TransitionActor
  /** Sólo el caso de uso de aprobación pasa esto; es la única vía a COMPLETED. */
  viaApprovedCompletionProposal?: boolean
}

const OPEN_FOR_PROPOSAL: readonly ActionItemStatus[] = [
  ActionItemStatus.PENDING,
  ActionItemStatus.IN_PROGRESS,
  ActionItemStatus.BLOCKED,
  ActionItemStatus.WAITING,
]

/** Transiciones válidas para actores humanos/sistema (sin contar la regla especial de COMPLETED). */
const HUMAN_TRANSITIONS: Record<ActionItemStatus, readonly ActionItemStatus[]> = {
  PROPOSED: [ActionItemStatus.PENDING, ActionItemStatus.IN_PROGRESS, ActionItemStatus.CANCELLED],
  PENDING: [
    ActionItemStatus.IN_PROGRESS,
    ActionItemStatus.BLOCKED,
    ActionItemStatus.WAITING,
    ActionItemStatus.COMPLETION_PROPOSED,
    ActionItemStatus.CANCELLED,
  ],
  IN_PROGRESS: [
    ActionItemStatus.PENDING,
    ActionItemStatus.BLOCKED,
    ActionItemStatus.WAITING,
    ActionItemStatus.COMPLETION_PROPOSED,
    ActionItemStatus.CANCELLED,
  ],
  BLOCKED: [
    ActionItemStatus.PENDING,
    ActionItemStatus.IN_PROGRESS,
    ActionItemStatus.WAITING,
    ActionItemStatus.COMPLETION_PROPOSED,
    ActionItemStatus.CANCELLED,
  ],
  WAITING: [
    ActionItemStatus.PENDING,
    ActionItemStatus.IN_PROGRESS,
    ActionItemStatus.BLOCKED,
    ActionItemStatus.COMPLETION_PROPOSED,
    ActionItemStatus.CANCELLED,
  ],
  COMPLETION_PROPOSED: [
    // Aprobación (con viaApprovedCompletionProposal) o rechazo humano.
    ActionItemStatus.COMPLETED,
    ActionItemStatus.PENDING,
    ActionItemStatus.IN_PROGRESS,
    ActionItemStatus.CANCELLED,
  ],
  // Reapertura auditada.
  COMPLETED: [ActionItemStatus.IN_PROGRESS],
  CANCELLED: [ActionItemStatus.PENDING],
}

/** La IA sólo puede: crear PROPOSED, proponer cierre, o señalar reapertura como candidata (vía revisión). */
const AI_TRANSITIONS: Record<ActionItemStatus, readonly ActionItemStatus[]> = {
  PROPOSED: [],
  PENDING: [ActionItemStatus.COMPLETION_PROPOSED],
  IN_PROGRESS: [ActionItemStatus.COMPLETION_PROPOSED],
  BLOCKED: [ActionItemStatus.COMPLETION_PROPOSED],
  WAITING: [ActionItemStatus.COMPLETION_PROPOSED],
  COMPLETION_PROPOSED: [],
  COMPLETED: [],
  CANCELLED: [],
}

export function canTransition(
  from: ActionItemStatus,
  to: ActionItemStatus,
  ctx: TransitionContext,
): boolean {
  if (from === to) return false
  if (to === ActionItemStatus.COMPLETED) {
    return (
      from === ActionItemStatus.COMPLETION_PROPOSED &&
      ctx.viaApprovedCompletionProposal === true &&
      ctx.actor.kind === 'USER'
    )
  }
  if (ctx.actor.kind === 'AI') {
    return AI_TRANSITIONS[from].includes(to)
  }
  if (ctx.actor.kind === 'IMPORT') {
    // La migración legado fija estados iniciales directamente, pero nunca COMPLETED por esta vía
    // (el importador usa `initialStatusFromLegacy`, no una transición).
    return false
  }
  return HUMAN_TRANSITIONS[from].includes(to)
}

export function assertTransition(
  from: ActionItemStatus,
  to: ActionItemStatus,
  ctx: TransitionContext,
): void {
  if (canTransition(from, to, ctx)) return
  if (to === ActionItemStatus.COMPLETED) {
    throw new DomainError(
      DomainErrorCode.ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL,
      'Una tarea sólo puede completarse aprobando una propuesta de cierre',
      { details: { from, to, actor: ctx.actor.kind } },
    )
  }
  throw new DomainError(
    DomainErrorCode.ACTION_ITEM_INVALID_TRANSITION,
    `Transición no permitida: ${from} -> ${to} (${ctx.actor.kind})`,
    { details: { from, to, actor: ctx.actor.kind } },
  )
}

export function allowedTransitions(
  from: ActionItemStatus,
  actorKind: TransitionActor['kind'],
): readonly ActionItemStatus[] {
  if (actorKind === 'AI') return AI_TRANSITIONS[from]
  if (actorKind === 'IMPORT') return []
  return HUMAN_TRANSITIONS[from]
}

export function canProposeCompletion(status: ActionItemStatus): boolean {
  return OPEN_FOR_PROPOSAL.includes(status)
}

export function isOpenStatus(status: ActionItemStatus): boolean {
  return status !== ActionItemStatus.COMPLETED && status !== ActionItemStatus.CANCELLED
}

/**
 * Mapeo inicial del legado (§16.5). `Completo` migra como COMPLETED con
 * migrationTrust=LEGACY; `Entregado` entra como COMPLETION_PROPOSED.
 */
export function initialStatusFromLegacy(legacyStatus: string | null | undefined): {
  status: ActionItemStatus
  recognized: boolean
} {
  const s = (legacyStatus ?? '').trim().toLowerCase()
  if (s === '' || s === '0') return { status: ActionItemStatus.PENDING, recognized: false }
  if (s === 'pendiente') return { status: ActionItemStatus.PENDING, recognized: true }
  if (s === 'en proceso' || s === 'en progreso')
    return { status: ActionItemStatus.IN_PROGRESS, recognized: true }
  if (s === 'completo' || s === 'completa' || s === 'completado' || s === 'completada')
    return { status: ActionItemStatus.COMPLETED, recognized: true }
  if (s === 'entregado' || s === 'entregada')
    return { status: ActionItemStatus.COMPLETION_PROPOSED, recognized: true }
  if (s === 'bloqueado' || s === 'bloqueada' || s === 'en pausa')
    return { status: ActionItemStatus.BLOCKED, recognized: true }
  if (s === 'cancelado' || s === 'cancelada')
    return { status: ActionItemStatus.CANCELLED, recognized: true }
  return { status: ActionItemStatus.PENDING, recognized: false }
}
