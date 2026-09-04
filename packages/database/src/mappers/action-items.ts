import type {
  ActionItem,
  ActionItemComment,
  ActionItemMeetingLink,
  ActionItemStatusHistory,
  AiReviewItem,
  CompletionProposal,
} from '@smlxl/domain'
import type {
  ActionItemComment as CommentRow,
  ActionItemMeetingLink as LinkRow,
  ActionItemStatusHistory as HistoryRow,
  AiReviewItem as ReviewRow,
  CompletionProposal as ProposalRow,
  Prisma,
} from '../generated/client/index.js'
import {
  asEvidence,
  asRecurrence,
  dateOnlyFromDb,
  dateOnlyToDb,
  jsonSafe,
  toJson,
  toNullableJson,
  type MapperContext,
} from './common.js'

/** Fila de action item con la tabla puente de colaboradores incluida. */
export type ActionItemRowWithCollaborators = Prisma.ActionItemGetPayload<{
  include: { collaborators: true }
}>

export const ACTION_ITEM_INCLUDE = { collaborators: true } as const

export function toActionItem(row: ActionItemRowWithCollaborators, ctx: MapperContext): ActionItem {
  return {
    id: row.id,
    externalKey: row.externalKey,
    title: row.title,
    description: row.description,
    type: row.type,
    ownerUserId: row.ownerUserId,
    externalAssigneeId: row.externalAssigneeId,
    ownerTextOriginal: row.ownerTextOriginal,
    collaboratorUserIds: row.collaborators.map((c) => c.userId),
    areaId: row.areaId,
    projectId: row.projectId,
    createdFromMeetingId: row.createdFromMeetingId,
    latestMeetingId: row.latestMeetingId,
    status: row.status,
    priority: row.priority,
    dueDate: dateOnlyFromDb(row.dueDate, ctx),
    dueDateTextOriginal: row.dueDateTextOriginal,
    dateConfidence: row.dateConfidence,
    startDate: dateOnlyFromDb(row.startDate, ctx),
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    confidence: row.confidence,
    requiresReview: row.requiresReview,
    sourceEvidence: asEvidence(row.sourceEvidence),
    recurrence: asRecurrence(row.recurrence),
    parentActionItemId: row.parentActionItemId,
    blocker: row.blocker,
    tags: row.tags,
    migrationTrust: row.migrationTrust,
    legacyId: row.legacyId,
    lastMentionedAt: row.lastMentionedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Campos escalares (sin `sequence`/`externalKey`, que se fijan al crear). */
export function actionItemScalarsToDb(
  item: ActionItem,
  ctx: MapperContext,
): Omit<Prisma.ActionItemUncheckedCreateInput, 'id' | 'sequence' | 'externalKey'> {
  return {
    title: item.title,
    description: item.description,
    type: item.type,
    ownerUserId: item.ownerUserId,
    externalAssigneeId: item.externalAssigneeId,
    ownerTextOriginal: item.ownerTextOriginal,
    areaId: item.areaId,
    projectId: item.projectId,
    createdFromMeetingId: item.createdFromMeetingId,
    latestMeetingId: item.latestMeetingId,
    status: item.status,
    priority: item.priority,
    dueDate: dateOnlyToDb(item.dueDate, ctx),
    dueDateTextOriginal: item.dueDateTextOriginal,
    dateConfidence: item.dateConfidence,
    startDate: dateOnlyToDb(item.startDate, ctx),
    completedAt: item.completedAt,
    cancelledAt: item.cancelledAt,
    confidence: item.confidence,
    requiresReview: item.requiresReview,
    sourceEvidence: jsonSafe(item.sourceEvidence),
    recurrence: toNullableJson(item.recurrence),
    parentActionItemId: item.parentActionItemId,
    blocker: item.blocker,
    tags: item.tags,
    migrationTrust: item.migrationTrust,
    legacyId: item.legacyId,
    lastMentionedAt: item.lastMentionedAt,
  }
}

// Links ----------------------------------------------------------------------

export function toLink(row: LinkRow, ctx: MapperContext): ActionItemMeetingLink {
  return {
    id: row.id,
    actionItemId: row.actionItemId,
    meetingId: row.meetingId,
    relationType: row.relationType,
    evidence: asEvidence(row.evidence),
    previousStatus: row.previousStatus,
    detectedStatus: row.detectedStatus,
    detectedDueDate: dateOnlyFromDb(row.detectedDueDate, ctx),
    createdAt: row.createdAt,
  }
}

export function linkToDb(
  l: ActionItemMeetingLink,
  ctx: MapperContext,
): Prisma.ActionItemMeetingLinkUncheckedCreateInput {
  return {
    id: l.id,
    actionItemId: l.actionItemId,
    meetingId: l.meetingId,
    relationType: l.relationType,
    evidence: jsonSafe(l.evidence),
    previousStatus: l.previousStatus,
    detectedStatus: l.detectedStatus,
    detectedDueDate: dateOnlyToDb(l.detectedDueDate, ctx),
    createdAt: l.createdAt,
  }
}

// Historial y comentarios ----------------------------------------------------

export function toStatusHistory(row: HistoryRow): ActionItemStatusHistory {
  return {
    id: row.id,
    actionItemId: row.actionItemId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedByUserId: row.changedByUserId,
    changedBySystem: row.changedBySystem,
    reason: row.reason,
    meetingId: row.meetingId,
    changedAt: row.changedAt,
  }
}

export function statusHistoryToDb(
  h: ActionItemStatusHistory,
): Prisma.ActionItemStatusHistoryUncheckedCreateInput {
  return {
    id: h.id,
    actionItemId: h.actionItemId,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    changedByUserId: h.changedByUserId,
    changedBySystem: h.changedBySystem,
    reason: h.reason,
    meetingId: h.meetingId,
    changedAt: h.changedAt,
  }
}

export function toComment(row: CommentRow): ActionItemComment {
  return {
    id: row.id,
    actionItemId: row.actionItemId,
    authorUserId: row.authorUserId,
    body: row.body,
    source: row.source,
    createdAt: row.createdAt,
  }
}

export function commentToDb(c: ActionItemComment): Prisma.ActionItemCommentUncheckedCreateInput {
  return {
    id: c.id,
    actionItemId: c.actionItemId,
    authorUserId: c.authorUserId,
    body: c.body,
    source: c.source,
    createdAt: c.createdAt,
  }
}

// Propuestas de cierre -------------------------------------------------------

export function toProposal(row: ProposalRow): CompletionProposal {
  return {
    id: row.id,
    actionItemId: row.actionItemId,
    proposedByType: row.proposedByType,
    proposedByUserId: row.proposedByUserId,
    proposedFromMeetingId: row.proposedFromMeetingId,
    reason: row.reason,
    evidenceSegmentIds: row.evidenceSegmentIds,
    evidence: asEvidence(row.evidence),
    confidence: row.confidence,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewComment: row.reviewComment,
    createdAt: row.createdAt,
  }
}

export function proposalToDb(p: CompletionProposal): Prisma.CompletionProposalUncheckedCreateInput {
  return {
    id: p.id,
    actionItemId: p.actionItemId,
    proposedByType: p.proposedByType,
    proposedByUserId: p.proposedByUserId,
    proposedFromMeetingId: p.proposedFromMeetingId,
    reason: p.reason,
    evidenceSegmentIds: p.evidenceSegmentIds,
    evidence: jsonSafe(p.evidence),
    confidence: p.confidence,
    status: p.status,
    reviewedByUserId: p.reviewedByUserId,
    reviewedAt: p.reviewedAt,
    reviewComment: p.reviewComment,
    createdAt: p.createdAt,
  }
}

// Revisión IA ----------------------------------------------------------------

export function toReviewItem(row: ReviewRow, ctx: MapperContext): AiReviewItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    processingRunId: row.processingRunId,
    reasons: row.reasons,
    reconcileDecision: row.reconcileDecision,
    candidateActionItemId: row.candidateActionItemId,
    candidateScore: row.candidateScore,
    proposedActionItemId: row.proposedActionItemId,
    extracted: row.extracted,
    suggestedOwnerUserId: row.suggestedOwnerUserId,
    suggestedOwnerConfidence: row.suggestedOwnerConfidence,
    suggestedDueDate: dateOnlyFromDb(row.suggestedDueDate, ctx),
    suggestedDueDateConfidence: row.suggestedDueDateConfidence,
    status: row.status,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: row.resolvedAt,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
  }
}

export function reviewItemToDb(
  r: AiReviewItem,
  ctx: MapperContext,
): Prisma.AiReviewItemUncheckedCreateInput {
  return {
    id: r.id,
    meetingId: r.meetingId,
    processingRunId: r.processingRunId,
    reasons: r.reasons,
    reconcileDecision: r.reconcileDecision,
    candidateActionItemId: r.candidateActionItemId,
    candidateScore: r.candidateScore,
    proposedActionItemId: r.proposedActionItemId,
    extracted: toJson(r.extracted),
    suggestedOwnerUserId: r.suggestedOwnerUserId,
    suggestedOwnerConfidence: r.suggestedOwnerConfidence,
    suggestedDueDate: dateOnlyToDb(r.suggestedDueDate, ctx),
    suggestedDueDateConfidence: r.suggestedDueDateConfidence,
    status: r.status,
    resolvedByUserId: r.resolvedByUserId,
    resolvedAt: r.resolvedAt,
    resolutionNote: r.resolutionNote,
    createdAt: r.createdAt,
  }
}
