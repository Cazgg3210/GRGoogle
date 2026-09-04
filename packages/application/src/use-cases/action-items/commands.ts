import { JobNames } from '@smlxl/config'
import {
  ActionItemStatus,
  ActionItemType,
  CompletionProposalStatus,
  DomainError,
  DomainErrorCode,
  Permission,
  ProposedByType,
  RelationType,
  assertTransition,
  canAccessActionItem,
  canApproveCompletion,
  canProposeCompletion,
  canUpdateActionItem,
  formatExternalKey,
  hasPermission,
  parseLocalDate,
  toLocalDateString,
  zonedDateTime,
  zonedParts,
  type ActionItem,
  type ActionItemPriority,
  type CompletionProposal,
  type Principal,
  type RecurrenceRule,
  type Repositories,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { enqueueJob } from '../../context.js'
import { audit, requireActionItem } from '../../shared.js'

/**
 * Comandos humanos sobre ActionItem (§16.5, §22). Toda transición pasa por la
 * máquina de estados con actor USER; COMPLETED sólo vía aprobación de propuesta.
 */
export interface CreateActionItemInput {
  title: string
  description?: string | null
  ownerUserId?: string | null
  externalAssigneeId?: string | null
  areaId?: string | null
  projectId?: string | null
  priority?: ActionItemPriority
  dueDate?: string | null
  meetingId?: string | null
  type?: ActionItemType
  tags?: string[]
  recurrence?: RecurrenceRule | null
}

async function loadAccessible(repos: Repositories, principal: Principal, id: string): Promise<ActionItem> {
  const item = requireActionItem(await repos.actionItems.findById(id), id)
  if (!canAccessActionItem(principal, item)) throw DomainError.forbidden('No tienes acceso a esta tarea')
  return item
}

function assertUpdatable(principal: Principal, item: ActionItem): void {
  if (!canUpdateActionItem(principal, item)) throw DomainError.forbidden('No puedes modificar esta tarea')
}

export async function createActionItem(ctx: AppContext, principal: Principal, input: CreateActionItemInput): Promise<ActionItem> {
  if (!hasPermission(principal, Permission.ACTION_ITEM_CREATE)) throw DomainError.forbidden('No tienes permiso para crear tareas')
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  // Sin permiso de reasignar (MEMBER), una tarea creada sin responsable explícito queda a nombre del creador.
  const ownerUserId = input.ownerUserId === undefined ? (hasPermission(principal, Permission.ACTION_ITEM_REASSIGN) ? null : principal.id) : input.ownerUserId
  if (ownerUserId && ownerUserId !== principal.id && !hasPermission(principal, Permission.ACTION_ITEM_REASSIGN)) {
    throw DomainError.forbidden('No puedes asignar tareas a otras personas')
  }
  const dueDate = input.dueDate ? parseLocalDate(input.dueDate, settings.companyTimezone) : null
  if (input.dueDate && !dueDate) throw new DomainError(DomainErrorCode.VALIDATION_ERROR, 'dueDate inválida')
  const owner = ownerUserId ? await ctx.repos.users.findById(ownerUserId) : null
  if (ownerUserId && !owner) throw DomainError.notFound('User', ownerUserId)
  const item = await ctx.uow.run(async (repos) => {
    const seq = await repos.actionItems.nextSequence()
    const created: ActionItem = {
      id: ctx.ids.next(),
      externalKey: formatExternalKey(seq),
      title: input.title,
      description: input.description ?? null,
      type: input.type ?? (input.recurrence ? ActionItemType.RECURRING : ActionItemType.ONE_OFF),
      ownerUserId,
      externalAssigneeId: input.externalAssigneeId ?? null,
      ownerTextOriginal: null,
      collaboratorUserIds: [],
      areaId: input.areaId ?? owner?.areaId ?? principal.areaId,
      projectId: input.projectId ?? null,
      createdFromMeetingId: input.meetingId ?? null,
      latestMeetingId: input.meetingId ?? null,
      status: ActionItemStatus.PENDING,
      priority: input.priority ?? 'MEDIUM',
      dueDate,
      dueDateTextOriginal: null,
      dateConfidence: dueDate ? 1 : null,
      startDate: null,
      completedAt: null,
      cancelledAt: null,
      confidence: null,
      requiresReview: false,
      sourceEvidence: [],
      recurrence: input.recurrence ?? null,
      parentActionItemId: null,
      blocker: null,
      tags: input.tags ?? [],
      migrationTrust: 'PLATFORM',
      legacyId: null,
      lastMentionedAt: input.meetingId ? now : null,
      createdAt: now,
      updatedAt: now,
    }
    await repos.actionItems.save(created)
    await repos.actionItems.addStatusHistory({ id: ctx.ids.next(), actionItemId: created.id, fromStatus: null, toStatus: created.status, changedByUserId: principal.id, changedBySystem: false, reason: 'Creada manualmente', meetingId: input.meetingId ?? null, changedAt: now })
    if (input.meetingId) {
      await repos.actionItems.addLink({ id: ctx.ids.next(), actionItemId: created.id, meetingId: input.meetingId, relationType: RelationType.CREATED, evidence: [], previousStatus: null, detectedStatus: created.status, detectedDueDate: dueDate, createdAt: now })
    }
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.created', entity: 'ActionItem', entityId: created.id, after: { externalKey: created.externalKey, ownerUserId, dueDate } })
    return created
  })
  metrics.increment(MetricNames.ACTION_ITEMS_CREATED, 1, { status: item.status, source: 'user' })
  await ctx.events.publish({ type: 'ActionItemCreated', actionItemId: item.id, meetingId: item.createdFromMeetingId, ownerUserId: item.ownerUserId, proposed: false, occurredAt: now })
  if (item.ownerUserId && item.ownerUserId !== principal.id) await notifyNewAssignment(ctx, item.id, null)
  return item
}

export interface UpdateActionItemInput {
  title?: string
  description?: string | null
  status?: ActionItemStatus
  statusReason?: string
  ownerUserId?: string | null
  externalAssigneeId?: string | null
  areaId?: string | null
  projectId?: string | null
  priority?: ActionItemPriority
  dueDate?: string | null
  blocker?: string | null
  tags?: string[]
  collaboratorUserIds?: string[]
}

export async function updateActionItem(ctx: AppContext, principal: Principal, id: string, input: UpdateActionItemInput): Promise<ActionItem> {
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const current = await loadAccessible(ctx.repos, principal, id)
  assertUpdatable(principal, current)
  const ownerChanges = input.ownerUserId !== undefined && input.ownerUserId !== current.ownerUserId
  if (ownerChanges && input.ownerUserId !== principal.id && !hasPermission(principal, Permission.ACTION_ITEM_REASSIGN)) {
    throw DomainError.forbidden('No tienes permiso para reasignar tareas')
  }
  if (ownerChanges && input.ownerUserId) {
    const u = await ctx.repos.users.findById(input.ownerUserId)
    if (!u) throw DomainError.notFound('User', input.ownerUserId)
  }
  let dueDate = current.dueDate
  if (input.dueDate !== undefined) {
    dueDate = input.dueDate ? parseLocalDate(input.dueDate, settings.companyTimezone) : null
    if (input.dueDate && !dueDate) throw new DomainError(DomainErrorCode.VALIDATION_ERROR, 'dueDate inválida')
  }
  const updated = await ctx.uow.run(async (repos) => {
    const item = requireActionItem(await repos.actionItems.findById(id), id)
    const before = { title: item.title, ownerUserId: item.ownerUserId, dueDate: item.dueDate, priority: item.priority, status: item.status, areaId: item.areaId, projectId: item.projectId }
    let next: ActionItem = {
      ...item,
      title: input.title ?? item.title,
      description: input.description === undefined ? item.description : input.description,
      ownerUserId: input.ownerUserId === undefined ? item.ownerUserId : input.ownerUserId,
      externalAssigneeId: input.externalAssigneeId === undefined ? item.externalAssigneeId : input.externalAssigneeId,
      areaId: input.areaId === undefined ? item.areaId : input.areaId,
      projectId: input.projectId === undefined ? item.projectId : input.projectId,
      priority: input.priority ?? item.priority,
      dueDate,
      dueDateTextOriginal: input.dueDate !== undefined ? null : item.dueDateTextOriginal,
      dateConfidence: input.dueDate !== undefined ? (dueDate ? 1 : null) : item.dateConfidence,
      blocker: input.blocker === undefined ? item.blocker : input.blocker,
      tags: input.tags ?? item.tags,
      collaboratorUserIds: input.collaboratorUserIds ?? item.collaboratorUserIds,
      requiresReview: input.ownerUserId !== undefined || input.dueDate !== undefined ? false : item.requiresReview,
      updatedAt: now,
    }
    if (input.status && input.status !== item.status) {
      next = await applyStatusChange(ctx, repos, principal, next, input.status, input.statusReason ?? null, null)
    } else await repos.actionItems.save(next)
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.updated', entity: 'ActionItem', entityId: id, before, after: { title: next.title, ownerUserId: next.ownerUserId, dueDate: next.dueDate, priority: next.priority, status: next.status, areaId: next.areaId, projectId: next.projectId } })
    return next
  })
  if (ownerChanges) {
    await ctx.events.publish({ type: 'ActionItemReassigned', actionItemId: id, fromUserId: current.ownerUserId, toUserId: updated.ownerUserId, byUserId: principal.id, occurredAt: now })
    if (updated.ownerUserId && updated.ownerUserId !== principal.id) await notifyNewAssignment(ctx, id, current.ownerUserId)
  }
  return updated
}

/** Cambio de estado humano vía máquina de estados; escribe historial y evento. */
async function applyStatusChange(
  ctx: AppContext,
  repos: Repositories,
  principal: Principal,
  item: ActionItem,
  to: ActionItemStatus,
  reason: string | null,
  meetingId: string | null,
  extra: { viaApprovedCompletionProposal?: boolean } = {},
): Promise<ActionItem> {
  assertTransition(item.status, to, { actor: { kind: 'USER', userId: principal.id }, ...extra })
  if (to === ActionItemStatus.CANCELLED && !hasPermission(principal, Permission.ACTION_ITEM_CANCEL)) throw DomainError.forbidden('No tienes permiso para cancelar tareas')
  const now = ctx.clock.now()
  const next: ActionItem = {
    ...item,
    status: to,
    completedAt: to === ActionItemStatus.COMPLETED ? now : to === ActionItemStatus.IN_PROGRESS && item.status === ActionItemStatus.COMPLETED ? null : item.completedAt,
    cancelledAt: to === ActionItemStatus.CANCELLED ? now : item.cancelledAt,
    startDate: to === ActionItemStatus.IN_PROGRESS && !item.startDate ? now : item.startDate,
    requiresReview: item.status === ActionItemStatus.PROPOSED ? false : item.requiresReview,
    updatedAt: now,
  }
  await repos.actionItems.save(next)
  await repos.actionItems.addStatusHistory({ id: ctx.ids.next(), actionItemId: item.id, fromStatus: item.status, toStatus: to, changedByUserId: principal.id, changedBySystem: false, reason, meetingId, changedAt: now })
  await ctx.events.publish({ type: 'ActionItemStatusChanged', actionItemId: item.id, from: item.status, to, byUserId: principal.id, occurredAt: now })
  return next
}

export async function changeActionItemStatus(ctx: AppContext, principal: Principal, id: string, to: ActionItemStatus, reason?: string): Promise<ActionItem> {
  if (to === ActionItemStatus.COMPLETED) {
    throw new DomainError(DomainErrorCode.ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL, 'Una tarea sólo puede completarse aprobando una propuesta de cierre', { details: { id } })
  }
  const current = await loadAccessible(ctx.repos, principal, id)
  assertUpdatable(principal, current)
  return ctx.uow.run(async (repos) => {
    const item = requireActionItem(await repos.actionItems.findById(id), id)
    const next = await applyStatusChange(ctx, repos, principal, item, to, reason ?? null, null)
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.status_changed', entity: 'ActionItem', entityId: id, before: { status: item.status }, after: { status: to, reason: reason ?? null } })
    return next
  })
}

/** POST /action-items/:id/complete: el usuario propone el cierre (§16.5). */
export async function proposeCompletion(ctx: AppContext, principal: Principal, id: string, reason: string): Promise<{ item: ActionItem; proposal: CompletionProposal }> {
  const current = await loadAccessible(ctx.repos, principal, id)
  assertUpdatable(principal, current)
  if (!canProposeCompletion(current.status)) {
    throw new DomainError(DomainErrorCode.ACTION_ITEM_INVALID_TRANSITION, `No se puede proponer cierre desde ${current.status}`, { details: { status: current.status } })
  }
  const now = ctx.clock.now()
  const result = await ctx.uow.run(async (repos) => {
    const item = requireActionItem(await repos.actionItems.findById(id), id)
    const pending = await repos.completionProposals.findPendingByActionItem(id)
    if (pending) throw new DomainError(DomainErrorCode.CONFLICT, 'Ya existe una propuesta de cierre pendiente')
    const proposal = await repos.completionProposals.save({
      id: ctx.ids.next(),
      actionItemId: id,
      proposedByType: ProposedByType.USER,
      proposedByUserId: principal.id,
      proposedFromMeetingId: null,
      reason,
      evidenceSegmentIds: [],
      evidence: [],
      confidence: 1,
      status: CompletionProposalStatus.PENDING,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewComment: null,
      createdAt: now,
    })
    const next = await applyStatusChange(ctx, repos, principal, item, ActionItemStatus.COMPLETION_PROPOSED, reason, null)
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.completion_proposed', entity: 'ActionItem', entityId: id, after: { proposalId: proposal.id, reason } })
    return { item: next, proposal }
  })
  await ctx.events.publish({ type: 'CompletionProposed', actionItemId: id, proposalId: result.proposal.id, byType: 'USER', occurredAt: now })
  return result
}

/** Siguiente vencimiento de una recurrencia (§16.7). */
export function nextRecurrenceDueDate(rule: RecurrenceRule, from: Date, timeZone: string): Date {
  const interval = Math.max(1, rule.interval ?? 1)
  const p = zonedParts(from, timeZone)
  switch (rule.frequency) {
    case 'DAILY':
      return zonedDateTime(p.year, p.month, p.day + interval, 0, 0, 0, timeZone)
    case 'WEEKLY': {
      if (rule.weekdays && rule.weekdays.length > 0) {
        const sorted = [...rule.weekdays].sort((a, b) => a - b)
        const next = sorted.find((d) => d > p.weekday)
        const delta = next !== undefined ? next - p.weekday : 7 * interval - p.weekday + (sorted[0] ?? 0)
        return zonedDateTime(p.year, p.month, p.day + delta, 0, 0, 0, timeZone)
      }
      return zonedDateTime(p.year, p.month, p.day + 7 * interval, 0, 0, 0, timeZone)
    }
    case 'BIWEEKLY':
      return zonedDateTime(p.year, p.month, p.day + 14 * interval, 0, 0, 0, timeZone)
    case 'MONTHLY':
      return zonedDateTime(p.year, p.month + interval, p.day, 0, 0, 0, timeZone)
  }
}

export interface ReviewProposalInput {
  comment?: string
  returnToStatus?: 'PENDING' | 'IN_PROGRESS'
}

/** Aprueba la propuesta: única vía a COMPLETED (§16.5). Recurrentes generan la siguiente instancia. */
export async function approveCompletion(ctx: AppContext, principal: Principal, id: string, proposalId: string, input: ReviewProposalInput = {}): Promise<{ item: ActionItem; nextInstance: ActionItem | null }> {
  const current = await loadAccessible(ctx.repos, principal, id)
  if (!canApproveCompletion(principal, current)) throw DomainError.forbidden('No tienes permiso para aprobar cierres')
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const result = await ctx.uow.run(async (repos) => {
    const item = requireActionItem(await repos.actionItems.findById(id), id)
    const proposal = await repos.completionProposals.findById(proposalId)
    if (!proposal || proposal.actionItemId !== id) throw DomainError.notFound('CompletionProposal', proposalId)
    if (proposal.status !== CompletionProposalStatus.PENDING) throw new DomainError(DomainErrorCode.COMPLETION_PROPOSAL_NOT_PENDING, 'La propuesta ya fue revisada')
    await repos.completionProposals.save({ ...proposal, status: CompletionProposalStatus.APPROVED, reviewedByUserId: principal.id, reviewedAt: now, reviewComment: input.comment ?? null })
    const completed = await applyStatusChange(ctx, repos, principal, item, ActionItemStatus.COMPLETED, input.comment ?? 'Cierre aprobado', proposal.proposedFromMeetingId, { viaApprovedCompletionProposal: true })
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.completion_approved', entity: 'ActionItem', entityId: id, before: { status: item.status }, after: { status: completed.status, proposalId } })
    let nextInstance: ActionItem | null = null
    if (item.type === ActionItemType.RECURRING && item.recurrence) {
      const base = item.dueDate ?? now
      const seq = await repos.actionItems.nextSequence()
      nextInstance = {
        ...item,
        id: ctx.ids.next(),
        externalKey: formatExternalKey(seq),
        status: ActionItemStatus.PENDING,
        dueDate: nextRecurrenceDueDate(item.recurrence, base, settings.companyTimezone),
        dueDateTextOriginal: null,
        dateConfidence: 1,
        startDate: null,
        completedAt: null,
        cancelledAt: null,
        parentActionItemId: item.parentActionItemId ?? item.id,
        requiresReview: false,
        lastMentionedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      await repos.actionItems.save(nextInstance)
      await repos.actionItems.addStatusHistory({ id: ctx.ids.next(), actionItemId: nextInstance.id, fromStatus: null, toStatus: ActionItemStatus.PENDING, changedByUserId: null, changedBySystem: true, reason: `Instancia recurrente generada al cerrar ${item.externalKey}`, meetingId: null, changedAt: now })
      await audit(repos, ctx, { actorType: 'SYSTEM', action: 'action_item.recurrence_spawned', entity: 'ActionItem', entityId: nextInstance.id, after: { parentActionItemId: nextInstance.parentActionItemId, dueDate: nextInstance.dueDate } })
      metrics.increment(MetricNames.ACTION_ITEMS_CREATED, 1, { status: 'PENDING', source: 'recurrence' })
    }
    return { item: completed, proposal, nextInstance }
  })
  await ctx.events.publish({ type: 'CompletionApproved', actionItemId: id, proposalId, byUserId: principal.id, occurredAt: now })
  if (result.nextInstance) {
    await ctx.events.publish({ type: 'ActionItemCreated', actionItemId: result.nextInstance.id, meetingId: null, ownerUserId: result.nextInstance.ownerUserId, proposed: false, occurredAt: now })
  }
  return { item: result.item, nextInstance: result.nextInstance }
}

export async function rejectCompletion(ctx: AppContext, principal: Principal, id: string, proposalId: string, input: ReviewProposalInput = {}): Promise<ActionItem> {
  const current = await loadAccessible(ctx.repos, principal, id)
  if (!canApproveCompletion(principal, current)) throw DomainError.forbidden('No tienes permiso para rechazar cierres')
  const now = ctx.clock.now()
  const item = await ctx.uow.run(async (repos) => {
    const it = requireActionItem(await repos.actionItems.findById(id), id)
    const proposal = await repos.completionProposals.findById(proposalId)
    if (!proposal || proposal.actionItemId !== id) throw DomainError.notFound('CompletionProposal', proposalId)
    if (proposal.status !== CompletionProposalStatus.PENDING) throw new DomainError(DomainErrorCode.COMPLETION_PROPOSAL_NOT_PENDING, 'La propuesta ya fue revisada')
    await repos.completionProposals.save({ ...proposal, status: CompletionProposalStatus.REJECTED, reviewedByUserId: principal.id, reviewedAt: now, reviewComment: input.comment ?? null })
    let returnTo: ActionItemStatus = input.returnToStatus ?? ActionItemStatus.PENDING
    if (!input.returnToStatus) {
      const history = await repos.actionItems.listStatusHistory(id)
      const last = [...history].reverse().find((h) => h.toStatus === ActionItemStatus.COMPLETION_PROPOSED)
      if (last?.fromStatus === ActionItemStatus.IN_PROGRESS || last?.fromStatus === ActionItemStatus.PENDING) returnTo = last.fromStatus
    }
    const next = await applyStatusChange(ctx, repos, principal, it, returnTo, input.comment ?? 'Cierre rechazado', proposal.proposedFromMeetingId)
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.completion_rejected', entity: 'ActionItem', entityId: id, before: { status: it.status }, after: { status: next.status, proposalId } })
    return next
  })
  await ctx.events.publish({ type: 'CompletionRejected', actionItemId: id, proposalId, byUserId: principal.id, occurredAt: now })
  return item
}

export async function reopenActionItem(ctx: AppContext, principal: Principal, id: string, reason: string): Promise<ActionItem> {
  const current = await loadAccessible(ctx.repos, principal, id)
  assertUpdatable(principal, current)
  return ctx.uow.run(async (repos) => {
    const item = requireActionItem(await repos.actionItems.findById(id), id)
    const next = await applyStatusChange(ctx, repos, principal, item, ActionItemStatus.IN_PROGRESS, reason, null)
    await repos.actionItems.addComment({ id: ctx.ids.next(), actionItemId: id, authorUserId: principal.id, body: `Tarea reabierta: ${reason}`, source: 'SYSTEM', createdAt: ctx.clock.now() })
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.reopened', entity: 'ActionItem', entityId: id, before: { status: item.status }, after: { status: next.status, reason } })
    return next
  })
}

export async function addComment(ctx: AppContext, principal: Principal, id: string, body: string) {
  await loadAccessible(ctx.repos, principal, id)
  return ctx.uow.run(async (repos) => {
    const comment = await repos.actionItems.addComment({ id: ctx.ids.next(), actionItemId: id, authorUserId: principal.id, body, source: 'USER', createdAt: ctx.clock.now() })
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'action_item.commented', entity: 'ActionItem', entityId: id, after: { commentId: comment.id } })
    return comment
  })
}

/** Notificación de nueva asignación (§17.2): encola el job si Gmail está habilitado. */
export async function notifyNewAssignment(ctx: AppContext, actionItemId: string, previousOwnerUserId: string | null): Promise<{ queued: boolean }> {
  const settings = await ctx.getSettings()
  if (!settings.featureFlags.GMAIL_NOTIFICATIONS_ENABLED) return { queued: false }
  await enqueueJob(ctx, JobNames.SEND_ACTION_ITEM_NOTIFICATION, { actionItemId, type: 'NEW_ASSIGNMENT', previousOwnerUserId }, { singletonKey: `assign:${actionItemId}:${ctx.clock.now().getTime()}` })
  return { queued: true }
}

/** Handler del job SEND_ACTION_ITEM_NOTIFICATION: envía el correo de nueva asignación respetando preferencias. */
export async function sendNewAssignmentEmail(ctx: AppContext, actionItemId: string): Promise<{ sent: boolean; skipped: boolean }> {
  const settings = await ctx.getSettings()
  if (!settings.featureFlags.GMAIL_NOTIFICATIONS_ENABLED) return { sent: false, skipped: true }
  const item = await ctx.repos.actionItems.findById(actionItemId)
  if (!item?.ownerUserId) return { sent: false, skipped: true }
  const owner = await ctx.repos.users.findById(item.ownerUserId)
  if (!owner || !owner.active || !owner.notificationPreferences.newAssignment) return { sent: false, skipped: true }
  const due = item.dueDate ? toLocalDateString(item.dueDate, settings.companyTimezone) : 'sin fecha'
  const url = `${ctx.env.APP_URL}/pendientes/${item.id}`
  const res = await ctx.mail.send({
    to: [owner.email],
    subject: `Nueva tarea asignada: ${item.title}`,
    text: `Hola ${owner.displayName},\n\nSe te asignó la tarea ${item.externalKey}: ${item.title}\nFecha compromiso: ${due}\n\nVer detalle: ${url}\n`,
    html: `<p>Hola ${owner.displayName},</p><p>Se te asignó la tarea <strong>${item.externalKey}</strong>: ${item.title}</p><p>Fecha compromiso: <strong>${due}</strong></p><p><a href="${url}">Ver detalle en la plataforma</a></p>`,
    idempotencyKey: `assignment:${item.id}:${item.ownerUserId}:${toLocalDateString(ctx.clock.now(), settings.companyTimezone)}`,
  })
  return { sent: !res.skipped, skipped: res.skipped }
}
