import type {
  ActionItemDetailDto,
  ActionItemDto,
  AiReviewItemDto,
  AuditEntryDto,
  CommentDto,
  CompletionProposalDto,
  MeetingDetailDto,
  MeetingListItemDto,
  UserDto,
  AreaDto,
  ProjectDto,
} from '@smlxl/contracts'
import {
  ActionItemStatus,
  Permission,
  allowedTransitions,
  attentionScore,
  canApproveCompletion,
  captureQualityBuckets,
  daysOpen,
  daysUntilDue,
  hasPermission,
  isOverdue,
  type ActionItem,
  type ActionItemComment,
  type ActionItemMeetingLink,
  type ActionItemStatusHistory,
  type AiReviewItem,
  type Area,
  type AuditLogEntry,
  type CompletionProposal,
  type Decision,
  type Meeting,
  type MeetingParticipant,
  type MeetingSummary,
  type PlatformSettings,
  type Principal,
  type ProcessingRun,
  type Project,
  type ProjectAlias,
  type Repositories,
  type User,
} from '@smlxl/domain'
import { isoDate, isoDateTime } from '../shared.js'

/** Catálogos en memoria para mapear nombres sin N+1 por fila. */
export interface Lookups {
  users: Map<string, User>
  areas: Map<string, Area>
  projects: Map<string, Project>
  meetings: Map<string, Meeting>
  timezone: string
  now: Date
  thresholds: PlatformSettings['confidenceThresholds']
}

export async function loadLookups(repos: Repositories, settings: PlatformSettings, now: Date, meetingIds: Iterable<string> = []): Promise<Lookups> {
  const [users, areas, projects] = await Promise.all([repos.users.list(), repos.areas.list(), repos.projects.list()])
  const meetings = new Map<string, Meeting>()
  for (const id of new Set(meetingIds)) {
    const m = await repos.meetings.findById(id)
    if (m) meetings.set(id, m)
  }
  return {
    users: new Map(users.map((u) => [u.id, u])),
    areas: new Map(areas.map((a) => [a.id, a])),
    projects: new Map(projects.map((p) => [p.id, p])),
    meetings,
    timezone: settings.companyTimezone,
    now,
    thresholds: settings.confidenceThresholds,
  }
}

export function toActionItemDto(
  item: ActionItem,
  lk: Lookups,
  extra: { pendingProposalId?: string | null; mentionsWithoutProgress?: number; externalAssigneeName?: string | null } = {},
): ActionItemDto {
  const attention = attentionScore({ item, mentionsWithoutProgress: extra.mentionsWithoutProgress ?? 0, lowConfidenceThreshold: lk.thresholds.proposal }, lk.now, lk.timezone)
  const createdFrom = item.createdFromMeetingId ? lk.meetings.get(item.createdFromMeetingId) : undefined
  return {
    id: item.id,
    externalKey: item.externalKey,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    priority: item.priority,
    ownerUserId: item.ownerUserId,
    ownerName: item.ownerUserId ? (lk.users.get(item.ownerUserId)?.displayName ?? null) : null,
    externalAssigneeId: item.externalAssigneeId,
    externalAssigneeName: extra.externalAssigneeName ?? null,
    ownerTextOriginal: item.ownerTextOriginal,
    collaboratorUserIds: item.collaboratorUserIds,
    areaId: item.areaId,
    areaName: item.areaId ? (lk.areas.get(item.areaId)?.name ?? null) : null,
    projectId: item.projectId,
    projectName: item.projectId ? (lk.projects.get(item.projectId)?.canonicalName ?? null) : null,
    createdFromMeetingId: item.createdFromMeetingId,
    createdFromMeetingTitle: createdFrom?.title ?? null,
    latestMeetingId: item.latestMeetingId,
    dueDate: isoDate(item.dueDate, lk.timezone),
    dueDateTextOriginal: item.dueDateTextOriginal,
    dateConfidence: item.dateConfidence,
    startDate: isoDate(item.startDate, lk.timezone),
    completedAt: isoDateTime(item.completedAt),
    confidence: item.confidence,
    requiresReview: item.requiresReview,
    sourceEvidence: item.sourceEvidence,
    recurrence: item.recurrence,
    blocker: item.blocker,
    tags: item.tags,
    migrationTrust: item.migrationTrust,
    legacyId: item.legacyId,
    isOverdue: isOverdue({ dueDate: item.dueDate, status: item.status }, lk.now, lk.timezone),
    daysOpen: daysOpen(item.createdAt, lk.now, item.completedAt),
    daysUntilDue: item.dueDate ? daysUntilDue(item.dueDate, lk.now, lk.timezone) : null,
    lastMentionedAt: isoDateTime(item.lastMentionedAt),
    attentionScore: attention.score,
    attentionReasons: attention.reasons,
    pendingProposalId: extra.pendingProposalId ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

export function toCommentDto(c: ActionItemComment, lk: Lookups): CommentDto {
  return { id: c.id, authorUserId: c.authorUserId, authorName: c.authorUserId ? (lk.users.get(c.authorUserId)?.displayName ?? null) : null, body: c.body, source: c.source, createdAt: c.createdAt.toISOString() }
}

export function toProposalDto(p: CompletionProposal, lk: Lookups): CompletionProposalDto {
  return {
    id: p.id,
    actionItemId: p.actionItemId,
    proposedByType: p.proposedByType,
    proposedByUserId: p.proposedByUserId,
    proposedByName: p.proposedByUserId ? (lk.users.get(p.proposedByUserId)?.displayName ?? null) : p.proposedByType === 'AI' ? 'IA' : null,
    proposedFromMeetingId: p.proposedFromMeetingId,
    proposedFromMeetingTitle: p.proposedFromMeetingId ? (lk.meetings.get(p.proposedFromMeetingId)?.title ?? null) : null,
    reason: p.reason,
    evidence: p.evidence,
    confidence: p.confidence,
    status: p.status,
    reviewedByUserId: p.reviewedByUserId,
    reviewedAt: isoDateTime(p.reviewedAt),
    reviewComment: p.reviewComment,
    createdAt: p.createdAt.toISOString(),
  }
}

export function toActionItemDetailDto(
  item: ActionItem,
  principal: Principal,
  lk: Lookups,
  parts: { comments: ActionItemComment[]; history: ActionItemStatusHistory[]; links: ActionItemMeetingLink[]; proposals: CompletionProposal[]; mentionsWithoutProgress: number; externalAssigneeName?: string | null },
): ActionItemDetailDto {
  const pending = parts.proposals.find((p) => p.status === 'PENDING') ?? null
  const base = toActionItemDto(item, lk, { pendingProposalId: pending?.id ?? null, mentionsWithoutProgress: parts.mentionsWithoutProgress, externalAssigneeName: parts.externalAssigneeName ?? null })
  const transitions = allowedTransitions(item.status, 'USER').filter((s) => {
    if (s === ActionItemStatus.COMPLETED) return false
    if (s === ActionItemStatus.CANCELLED) return hasPermission(principal, Permission.ACTION_ITEM_CANCEL)
    return true
  })
  return {
    ...base,
    comments: parts.comments.map((c) => toCommentDto(c, lk)),
    statusHistory: parts.history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedByUserId: h.changedByUserId,
      changedByName: h.changedByUserId ? (lk.users.get(h.changedByUserId)?.displayName ?? null) : h.changedBySystem ? 'Sistema/IA' : null,
      changedBySystem: h.changedBySystem,
      reason: h.reason,
      meetingId: h.meetingId,
      changedAt: h.changedAt.toISOString(),
    })),
    meetingLinks: parts.links.map((l) => ({
      id: l.id,
      meetingId: l.meetingId,
      meetingTitle: lk.meetings.get(l.meetingId)?.title ?? '(reunión)',
      meetingStartAt: (lk.meetings.get(l.meetingId)?.startAt ?? l.createdAt).toISOString(),
      relationType: l.relationType,
      evidence: l.evidence,
      detectedStatus: l.detectedStatus,
      detectedDueDate: isoDate(l.detectedDueDate, lk.timezone),
      createdAt: l.createdAt.toISOString(),
    })),
    proposals: parts.proposals.map((p) => toProposalDto(p, lk)),
    allowedTransitions: [...transitions],
    canApproveCompletion: pending !== null && canApproveCompletion(principal, item),
  }
}

export function toMeetingListItemDto(
  m: Meeting,
  lk: Lookups,
  extra: { participants: MeetingParticipant[]; actionItemCount: number; pendingReviewCount: number; extractionConfidence?: number | null },
): MeetingListItemDto {
  return {
    id: m.id,
    title: m.title,
    startAt: m.startAt.toISOString(),
    endAt: isoDateTime(m.endAt),
    durationSeconds: m.durationSeconds,
    organizerUserId: m.organizerUserId,
    organizerName: m.organizerUserId ? (lk.users.get(m.organizerUserId)?.displayName ?? null) : (m.organizerEmail ?? null),
    organizerEmail: m.organizerEmail,
    isExternalHost: m.isExternalHost,
    participantCount: extra.participants.length,
    participantNames: extra.participants.map((p) => p.displayName),
    source: m.source,
    processingStatus: m.processingStatus,
    transcriptStatus: m.transcriptStatus,
    smartNotesStatus: m.smartNotesStatus,
    aiAnalysisStatus: m.aiAnalysisStatus,
    confidentialityLevel: m.confidentialityLevel,
    excludedFromAi: m.excludedFromAi,
    actionItemCount: extra.actionItemCount,
    pendingReviewCount: extra.pendingReviewCount,
    extractionConfidence: extra.extractionConfidence ?? null,
    areaId: m.areaId,
    projectId: m.projectId,
  }
}

export function toMeetingDetailDto(
  m: Meeting,
  lk: Lookups,
  extra: { participants: MeetingParticipant[]; actionItemCount: number; pendingReviewCount: number; summary: MeetingSummary | null; decisions: Decision[]; runs: ProcessingRun[]; extractionConfidence?: number | null },
): MeetingDetailDto {
  return {
    ...toMeetingListItemDto(m, lk, extra),
    googleConferenceRecordId: m.googleConferenceRecordId,
    googleMeetingCode: m.googleMeetingCode,
    googleCalendarEventId: m.googleCalendarEventId,
    reportedLanguageCode: m.reportedLanguageCode,
    detectedLanguageCode: m.detectedLanguageCode,
    mixedLanguageDetected: m.mixedLanguageDetected,
    lastErrorCode: m.lastErrorCode,
    participants: extra.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      isInternal: p.isInternal,
      internalUserId: p.internalUserId,
      participantType: p.participantType,
      joinedAt: isoDateTime(p.joinedAt),
      leftAt: isoDateTime(p.leftAt),
      speakingDurationSeconds: p.speakingDurationSeconds,
    })),
    summary: extra.summary
      ? {
          id: extra.summary.id,
          executiveSummary: extra.summary.executiveSummary,
          detailedSummary: extra.summary.detailedSummary,
          topics: extra.summary.topics,
          risks: extra.summary.risks,
          openQuestions: extra.summary.openQuestions,
          aiModel: extra.summary.aiModel,
          promptVersion: extra.summary.promptVersion,
          generatedAt: extra.summary.generatedAt.toISOString(),
          approvedAt: isoDateTime(extra.summary.approvedAt),
        }
      : null,
    decisions: extra.decisions.map((d) => ({
      id: d.id,
      description: d.description,
      decidedBy: d.decidedBy,
      effectiveDate: isoDate(d.effectiveDate, lk.timezone),
      confidence: d.confidence,
      evidence: d.evidence,
      status: d.status,
    })),
    processingRuns: extra.runs.map((r) => ({
      id: r.id,
      kind: r.kind,
      provider: r.provider,
      model: r.model,
      promptVersion: r.promptVersion,
      schemaVersion: r.schemaVersion,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      estimatedCostUsd: r.estimatedCostUsd,
      latencyMs: r.latencyMs,
      success: r.success,
      errorCode: r.errorCode,
      startedAt: r.startedAt.toISOString(),
      finishedAt: isoDateTime(r.finishedAt),
    })),
    captureQuality: captureQualityBuckets(m),
  }
}

export function toAiReviewItemDto(r: AiReviewItem, lk: Lookups, candidate: ActionItem | null): AiReviewItemDto {
  const meeting = lk.meetings.get(r.meetingId)
  return {
    id: r.id,
    meetingId: r.meetingId,
    meetingTitle: meeting?.title ?? '(reunión)',
    meetingStartAt: (meeting?.startAt ?? r.createdAt).toISOString(),
    reasons: r.reasons,
    reconcileDecision: r.reconcileDecision,
    candidateActionItemId: r.candidateActionItemId,
    candidateActionItemKey: candidate?.externalKey ?? null,
    candidateActionItemTitle: candidate?.title ?? null,
    candidateScore: r.candidateScore,
    proposedActionItemId: r.proposedActionItemId,
    extracted: r.extracted,
    suggestedOwnerUserId: r.suggestedOwnerUserId,
    suggestedOwnerName: r.suggestedOwnerUserId ? (lk.users.get(r.suggestedOwnerUserId)?.displayName ?? null) : null,
    suggestedOwnerConfidence: r.suggestedOwnerConfidence,
    suggestedDueDate: isoDate(r.suggestedDueDate, lk.timezone),
    suggestedDueDateConfidence: r.suggestedDueDateConfidence,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }
}

export function toAuditEntryDto(e: AuditLogEntry, lk: Lookups): AuditEntryDto {
  return {
    id: e.id,
    actorUserId: e.actorUserId,
    actorName: e.actorUserId ? (lk.users.get(e.actorUserId)?.displayName ?? null) : e.actorType === 'AI' ? 'IA' : e.actorType === 'SYSTEM' ? 'Sistema' : null,
    actorType: e.actorType,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    source: e.source,
    correlationId: e.correlationId,
    timestamp: e.timestamp.toISOString(),
  }
}

export function toUserDto(u: User, lk: Pick<Lookups, 'areas'>): UserDto {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, areaId: u.areaId, areaName: u.areaId ? (lk.areas.get(u.areaId)?.name ?? null) : null, managerId: u.managerId, active: u.active, monitored: u.monitored }
}

export function toAreaDto(a: Area): AreaDto {
  return { id: a.id, name: a.name, code: a.code, isExternalCategory: a.isExternalCategory, active: a.active, sortOrder: a.sortOrder }
}

export function toProjectDto(p: Project, aliases: ProjectAlias[]): ProjectDto {
  return { id: p.id, canonicalName: p.canonicalName, code: p.code, active: p.active, areaId: p.areaId, aliases: aliases.filter((a) => a.projectId === p.id).map((a) => a.aliasNormalized) }
}
