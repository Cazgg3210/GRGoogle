import {
  ActionItemStatus,
  ActionItemType,
  AiReviewItemStatus,
  DomainError,
  DomainErrorCode,
  Permission,
  RelationType,
  assertTransition,
  detectRecurrenceHint,
  formatExternalKey,
  hasPermission,
  parseLocalDate,
  type ActionItem,
  type ActionItemPriority,
  type AiReviewItem,
  type EvidenceQuote,
  type ExtractedActionItem,
  type Principal,
  type Repositories,
} from '@smlxl/domain'
import { ExtractedActionItemSchema } from '@smlxl/contracts'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { audit, requireActionItem } from '../../shared.js'

/**
 * Bandeja de revisión IA (§23): aprobar (crear/aceptar), rechazar (descartar /
 * cancelar propuesta) o fusionar con una tarea existente. Actor USER.
 */
export interface ApproveReviewInput {
  ownerUserId?: string | null
  dueDate?: string | null
  priority?: ActionItemPriority
  title?: string
  note?: string
}

export interface MergeReviewInput {
  targetActionItemId: string
  applyDueDate?: boolean
  applyOwner?: boolean
  note?: string
}

function assertResolvable(principal: Principal, item: AiReviewItem): void {
  if (!hasPermission(principal, Permission.AI_REVIEW_RESOLVE))
    throw DomainError.forbidden('No tienes permiso para resolver la bandeja de revisión IA')
  if (item.status !== AiReviewItemStatus.PENDING)
    throw new DomainError(DomainErrorCode.CONFLICT, 'El elemento de revisión ya fue resuelto')
}

function extractedOf(item: AiReviewItem): ExtractedActionItem {
  const parsed = ExtractedActionItemSchema.safeParse(item.extracted)
  if (parsed.success) return parsed.data
  const raw = (item.extracted ?? {}) as Partial<ExtractedActionItem>
  return {
    title: raw.title ?? 'Tarea detectada por IA',
    owner: raw.owner ?? null,
    dueDate: raw.dueDate ?? null,
    priority: raw.priority ?? null,
    statusHint: raw.statusHint ?? 'UNKNOWN',
    evidence: raw.evidence ?? [{ text: 'Sin evidencia' }],
    confidence: raw.confidence ?? 0,
    ...(raw.description ? { description: raw.description } : {}),
    ...(raw.dueDateTextOriginal ? { dueDateTextOriginal: raw.dueDateTextOriginal } : {}),
  }
}

async function loadReview(repos: Repositories, id: string): Promise<AiReviewItem> {
  const item = await repos.aiReview.findById(id)
  if (!item) throw DomainError.notFound('AiReviewItem', id)
  return item
}

export async function approveAiReview(
  ctx: AppContext,
  principal: Principal,
  reviewId: string,
  input: ApproveReviewInput = {},
): Promise<{ review: AiReviewItem; actionItem: ActionItem }> {
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const initial = await loadReview(ctx.repos, reviewId)
  assertResolvable(principal, initial)
  if (
    input.ownerUserId &&
    input.ownerUserId !== principal.id &&
    !hasPermission(principal, Permission.ACTION_ITEM_REASSIGN)
  )
    throw DomainError.forbidden('No puedes asignar a otras personas')
  const dueOverride =
    input.dueDate === undefined
      ? undefined
      : input.dueDate
        ? parseLocalDate(input.dueDate, settings.companyTimezone)
        : null
  if (input.dueDate && dueOverride === null)
    throw new DomainError(DomainErrorCode.VALIDATION_ERROR, 'dueDate inválida')
  return ctx.uow.run(async (repos) => {
    const review = await loadReview(repos, reviewId)
    const meeting = await repos.meetings.findById(review.meetingId)
    let actionItem: ActionItem
    if (review.proposedActionItemId) {
      const existing = requireActionItem(
        await repos.actionItems.findById(review.proposedActionItemId),
        review.proposedActionItemId,
      )
      const before = {
        status: existing.status,
        ownerUserId: existing.ownerUserId,
        dueDate: existing.dueDate,
      }
      let next: ActionItem = {
        ...existing,
        title: input.title ?? existing.title,
        ownerUserId: input.ownerUserId === undefined ? existing.ownerUserId : input.ownerUserId,
        dueDate: dueOverride === undefined ? existing.dueDate : dueOverride,
        dateConfidence:
          dueOverride === undefined ? existing.dateConfidence : dueOverride ? 1 : null,
        priority: input.priority ?? existing.priority,
        requiresReview: false,
        updatedAt: now,
      }
      if (existing.status === ActionItemStatus.PROPOSED) {
        assertTransition(existing.status, ActionItemStatus.PENDING, {
          actor: { kind: 'USER', userId: principal.id },
        })
        next = { ...next, status: ActionItemStatus.PENDING }
        await repos.actionItems.addStatusHistory({
          id: ctx.ids.next(),
          actionItemId: existing.id,
          fromStatus: existing.status,
          toStatus: ActionItemStatus.PENDING,
          changedByUserId: principal.id,
          changedBySystem: false,
          reason: input.note ?? 'Propuesta IA aprobada',
          meetingId: review.meetingId,
          changedAt: now,
        })
        await ctx.events.publish({
          type: 'ActionItemStatusChanged',
          actionItemId: existing.id,
          from: existing.status,
          to: ActionItemStatus.PENDING,
          byUserId: principal.id,
          occurredAt: now,
        })
      }
      actionItem = await repos.actionItems.save(next)
      await audit(repos, ctx, {
        actorType: 'USER',
        actorUserId: principal.id,
        action: 'ai_review.approved',
        entity: 'ActionItem',
        entityId: actionItem.id,
        before,
        after: {
          status: actionItem.status,
          ownerUserId: actionItem.ownerUserId,
          dueDate: actionItem.dueDate,
          reviewId,
        },
      })
    } else {
      const e = extractedOf(review)
      const seq = await repos.actionItems.nextSequence()
      const ownerUserId =
        input.ownerUserId === undefined ? review.suggestedOwnerUserId : input.ownerUserId
      const owner = ownerUserId ? await repos.users.findById(ownerUserId) : null
      const dueDate = dueOverride === undefined ? review.suggestedDueDate : dueOverride
      const recurrence = e.recurringHint
        ? (detectRecurrenceHint(`${e.title} ${e.description ?? ''}`) ?? {
            frequency: 'WEEKLY' as const,
          })
        : null
      const evidence: EvidenceQuote[] = e.evidence
      actionItem = {
        id: ctx.ids.next(),
        externalKey: formatExternalKey(seq),
        title: input.title ?? e.title,
        description: e.description ?? null,
        type: recurrence ? ActionItemType.RECURRING : ActionItemType.ONE_OFF,
        ownerUserId,
        externalAssigneeId: null,
        ownerTextOriginal: e.owner?.name ?? e.owner?.email ?? null,
        collaboratorUserIds: [],
        areaId: owner?.areaId ?? meeting?.areaId ?? null,
        projectId: meeting?.projectId ?? null,
        createdFromMeetingId: review.meetingId,
        latestMeetingId: review.meetingId,
        status: ActionItemStatus.PENDING,
        priority: input.priority ?? e.priority ?? 'MEDIUM',
        dueDate,
        dueDateTextOriginal: e.dueDateTextOriginal ?? null,
        dateConfidence:
          dueOverride !== undefined ? (dueDate ? 1 : null) : review.suggestedDueDateConfidence,
        startDate: null,
        completedAt: null,
        cancelledAt: null,
        confidence: e.confidence,
        requiresReview: false,
        sourceEvidence: evidence,
        recurrence,
        parentActionItemId: null,
        blocker: null,
        tags: [],
        migrationTrust: 'PLATFORM',
        legacyId: null,
        lastMentionedAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await repos.actionItems.save(actionItem)
      await repos.actionItems.addStatusHistory({
        id: ctx.ids.next(),
        actionItemId: actionItem.id,
        fromStatus: null,
        toStatus: ActionItemStatus.PENDING,
        changedByUserId: principal.id,
        changedBySystem: false,
        reason: input.note ?? 'Creada desde revisión IA',
        meetingId: review.meetingId,
        changedAt: now,
      })
      await repos.actionItems.addLink({
        id: ctx.ids.next(),
        actionItemId: actionItem.id,
        meetingId: review.meetingId,
        relationType: RelationType.CREATED,
        evidence,
        previousStatus: null,
        detectedStatus: ActionItemStatus.PENDING,
        detectedDueDate: dueDate,
        createdAt: now,
      })
      await audit(repos, ctx, {
        actorType: 'USER',
        actorUserId: principal.id,
        action: 'ai_review.approved_create',
        entity: 'ActionItem',
        entityId: actionItem.id,
        after: { externalKey: actionItem.externalKey, reviewId },
      })
      await ctx.events.publish({
        type: 'ActionItemCreated',
        actionItemId: actionItem.id,
        meetingId: review.meetingId,
        ownerUserId,
        proposed: false,
        occurredAt: now,
      })
      metrics.increment(MetricNames.ACTION_ITEMS_CREATED, 1, {
        status: 'PENDING',
        source: 'ai_review',
      })
    }
    const resolved = await repos.aiReview.save({
      ...review,
      status: AiReviewItemStatus.APPROVED,
      resolvedByUserId: principal.id,
      resolvedAt: now,
      resolutionNote: input.note ?? null,
      proposedActionItemId: actionItem.id,
    })
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'ai_review.resolved',
      entity: 'AiReviewItem',
      entityId: reviewId,
      after: { status: resolved.status, actionItemId: actionItem.id },
    })
    return { review: resolved, actionItem }
  })
}

export async function rejectAiReview(
  ctx: AppContext,
  principal: Principal,
  reviewId: string,
  input: { note?: string } = {},
): Promise<AiReviewItem> {
  const initial = await loadReview(ctx.repos, reviewId)
  assertResolvable(principal, initial)
  const now = ctx.clock.now()
  return ctx.uow.run(async (repos) => {
    const review = await loadReview(repos, reviewId)
    if (review.proposedActionItemId) {
      const item = await repos.actionItems.findById(review.proposedActionItemId)
      if (item && item.status === ActionItemStatus.PROPOSED) {
        assertTransition(item.status, ActionItemStatus.CANCELLED, {
          actor: { kind: 'USER', userId: principal.id },
        })
        await repos.actionItems.save({
          ...item,
          status: ActionItemStatus.CANCELLED,
          cancelledAt: now,
          requiresReview: false,
          updatedAt: now,
        })
        await repos.actionItems.addStatusHistory({
          id: ctx.ids.next(),
          actionItemId: item.id,
          fromStatus: item.status,
          toStatus: ActionItemStatus.CANCELLED,
          changedByUserId: principal.id,
          changedBySystem: false,
          reason: input.note ?? 'Propuesta IA descartada',
          meetingId: review.meetingId,
          changedAt: now,
        })
        await ctx.events.publish({
          type: 'ActionItemStatusChanged',
          actionItemId: item.id,
          from: item.status,
          to: ActionItemStatus.CANCELLED,
          byUserId: principal.id,
          occurredAt: now,
        })
        await audit(repos, ctx, {
          actorType: 'USER',
          actorUserId: principal.id,
          action: 'ai_review.rejected_cancel',
          entity: 'ActionItem',
          entityId: item.id,
          before: { status: item.status },
          after: { status: ActionItemStatus.CANCELLED },
        })
      }
    }
    const resolved = await repos.aiReview.save({
      ...review,
      status: AiReviewItemStatus.REJECTED,
      resolvedByUserId: principal.id,
      resolvedAt: now,
      resolutionNote: input.note ?? null,
    })
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'ai_review.resolved',
      entity: 'AiReviewItem',
      entityId: reviewId,
      after: { status: resolved.status },
    })
    return resolved
  })
}

export async function mergeAiReview(
  ctx: AppContext,
  principal: Principal,
  reviewId: string,
  input: MergeReviewInput,
): Promise<{ review: AiReviewItem; actionItem: ActionItem }> {
  const initial = await loadReview(ctx.repos, reviewId)
  assertResolvable(principal, initial)
  const now = ctx.clock.now()
  const applyDueDate = input.applyDueDate ?? true
  const applyOwner = input.applyOwner ?? false
  if (applyOwner && !hasPermission(principal, Permission.ACTION_ITEM_REASSIGN))
    throw DomainError.forbidden('No puedes reasignar tareas')
  return ctx.uow.run(async (repos) => {
    const review = await loadReview(repos, reviewId)
    const target = requireActionItem(
      await repos.actionItems.findById(input.targetActionItemId),
      input.targetActionItemId,
    )
    const e = extractedOf(review)
    const before = { dueDate: target.dueDate, ownerUserId: target.ownerUserId }
    const changes =
      applyDueDate && review.suggestedDueDate
        ? true
        : applyOwner && review.suggestedOwnerUserId
          ? true
          : false
    const next: ActionItem = {
      ...target,
      dueDate: applyDueDate && review.suggestedDueDate ? review.suggestedDueDate : target.dueDate,
      dueDateTextOriginal:
        applyDueDate && review.suggestedDueDate
          ? (e.dueDateTextOriginal ?? target.dueDateTextOriginal)
          : target.dueDateTextOriginal,
      dateConfidence: applyDueDate && review.suggestedDueDate ? 1 : target.dateConfidence,
      ownerUserId:
        applyOwner && review.suggestedOwnerUserId
          ? review.suggestedOwnerUserId
          : target.ownerUserId,
      latestMeetingId: review.meetingId,
      lastMentionedAt: now,
      updatedAt: now,
    }
    await repos.actionItems.save(next)
    await repos.actionItems.addLink({
      id: ctx.ids.next(),
      actionItemId: target.id,
      meetingId: review.meetingId,
      relationType: changes ? RelationType.UPDATED : RelationType.MENTIONED,
      evidence: e.evidence,
      previousStatus: target.status,
      detectedStatus: null,
      detectedDueDate: review.suggestedDueDate,
      createdAt: now,
    })
    await ctx.events.publish({
      type: 'ActionItemLinkedToMeeting',
      actionItemId: target.id,
      meetingId: review.meetingId,
      relation: changes ? RelationType.UPDATED : RelationType.MENTIONED,
      occurredAt: now,
    })
    if (review.proposedActionItemId && review.proposedActionItemId !== target.id) {
      const proposed = await repos.actionItems.findById(review.proposedActionItemId)
      if (proposed && proposed.status === ActionItemStatus.PROPOSED) {
        await repos.actionItems.save({
          ...proposed,
          status: ActionItemStatus.CANCELLED,
          cancelledAt: now,
          requiresReview: false,
          updatedAt: now,
        })
        await repos.actionItems.addStatusHistory({
          id: ctx.ids.next(),
          actionItemId: proposed.id,
          fromStatus: proposed.status,
          toStatus: ActionItemStatus.CANCELLED,
          changedByUserId: principal.id,
          changedBySystem: false,
          reason: `Fusionada en ${target.externalKey}`,
          meetingId: review.meetingId,
          changedAt: now,
        })
      }
    }
    metrics.increment(MetricNames.ACTION_ITEMS_MERGED, 1, { decision: 'HUMAN_MERGE' })
    const resolved = await repos.aiReview.save({
      ...review,
      status: AiReviewItemStatus.MERGED,
      resolvedByUserId: principal.id,
      resolvedAt: now,
      resolutionNote: input.note ?? null,
      candidateActionItemId: target.id,
    })
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'ai_review.merged',
      entity: 'ActionItem',
      entityId: target.id,
      before,
      after: { dueDate: next.dueDate, ownerUserId: next.ownerUserId, reviewId },
    })
    return { review: resolved, actionItem: next }
  })
}
