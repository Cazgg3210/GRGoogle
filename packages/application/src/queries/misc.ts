import { googleMode } from '@smlxl/config'
import type { AiReviewItemDto, AreaDto, AuditEntryDto, ExternalAssigneeDto, GoogleStatusDto, NotificationCountsDto, ProjectDto, SessionDto, UserDto } from '@smlxl/contracts'
import {
  DomainError,
  Permission,
  canAccessMeeting,
  canApproveCompletion,
  hasPermission,
  parseLocalDate,
  endOfDay,
  permissionsFor,
  type AiReviewReason,
  type Page,
  type Principal,
} from '@smlxl/domain'
import type { AppContext } from '../context.js'
import { paginate, requireMeeting } from '../shared.js'
import { loadLookups, toAiReviewItemDto, toAreaDto, toAuditEntryDto, toProjectDto, toUserDto } from './mappers.js'

export interface ListAiReviewQuery {
  meetingId?: string
  /** Filtra por motivo de revisión (§16.3), p. ej. POSSIBLE_COMPLETION. */
  reason?: AiReviewReason | string
  page?: number
  pageSize?: number
}

export async function listAiReviewItems(ctx: AppContext, principal: Principal, q: ListAiReviewQuery = {}): Promise<Page<AiReviewItemDto>> {
  if (!hasPermission(principal, Permission.AI_REVIEW_RESOLVE)) throw DomainError.forbidden('No tienes permiso para ver la bandeja de revisión IA')
  const settings = await ctx.getSettings()
  let pending = await ctx.repos.aiReview.listPending(q.meetingId ? { meetingId: q.meetingId } : {})
  if (q.reason) pending = pending.filter((r) => (r.reasons as string[]).includes(q.reason as string))
  const page = paginate(pending, q.page ?? 1, q.pageSize ?? 25)
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now(), page.items.map((r) => r.meetingId))
  const items: AiReviewItemDto[] = []
  for (const r of page.items) {
    const candidate = r.candidateActionItemId ? await ctx.repos.actionItems.findById(r.candidateActionItemId) : null
    items.push(toAiReviewItemDto(r, lk, candidate))
  }
  return { ...page, items }
}

export async function getAiReviewItem(ctx: AppContext, principal: Principal, id: string): Promise<AiReviewItemDto> {
  if (!hasPermission(principal, Permission.AI_REVIEW_RESOLVE)) throw DomainError.forbidden('No tienes permiso para ver la bandeja de revisión IA')
  const r = await ctx.repos.aiReview.findById(id)
  if (!r) throw DomainError.notFound('AiReviewItem', id)
  const settings = await ctx.getSettings()
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now(), [r.meetingId])
  const candidate = r.candidateActionItemId ? await ctx.repos.actionItems.findById(r.candidateActionItemId) : null
  return toAiReviewItemDto(r, lk, candidate)
}

/** GET /meetings/:id/review-items (todos los estados). */
export async function listReviewItemsByMeeting(ctx: AppContext, principal: Principal, meetingId: string): Promise<AiReviewItemDto[]> {
  const meeting = requireMeeting(await ctx.repos.meetings.findById(meetingId), meetingId)
  const participants = await ctx.repos.meetings.listParticipants(meetingId)
  if (!canAccessMeeting(principal, { ...meeting, participantUserIds: participants.map((p) => p.internalUserId).filter((x): x is string => x !== null) })) throw DomainError.forbidden('No tienes acceso a esta reunión')
  const settings = await ctx.getSettings()
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now(), [meetingId])
  const out: AiReviewItemDto[] = []
  for (const r of await ctx.repos.aiReview.listByMeeting(meetingId)) {
    const candidate = r.candidateActionItemId ? await ctx.repos.actionItems.findById(r.candidateActionItemId) : null
    out.push(toAiReviewItemDto(r, lk, candidate))
  }
  return out
}

export async function getGoogleStatus(ctx: AppContext, principal: Principal): Promise<GoogleStatusDto> {
  if (!hasPermission(principal, Permission.INTEGRATION_MANAGE)) throw DomainError.forbidden('No tienes permiso para ver integraciones')
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const [subs, cursors, events, usage, users] = await Promise.all([
    ctx.repos.googleSubscriptions.list(),
    ctx.repos.calendarCursors.list(),
    ctx.repos.inboundEvents.listRecent(20),
    ctx.repos.processingRuns.usageSummary(new Date(now.getTime() - 30 * 86_400_000), now),
    ctx.repos.users.list(),
  ])
  const emailOf = (id: string): string => users.find((u) => u.id === id)?.email ?? id
  return {
    mode: googleMode(ctx.env),
    flags: settings.featureFlags,
    subscriptions: subs.map((s) => ({ userEmail: s.monitoredUserEmail, subscriptionName: s.googleSubscriptionName, state: s.state, expiresAt: s.expiresAt.toISOString(), lastRenewedAt: s.lastRenewedAt?.toISOString() ?? null, lastErrorCode: s.lastErrorCode })),
    calendarCursors: cursors.map((c) => ({ userEmail: emailOf(c.userId), calendarId: c.calendarId, lastIncrementalSyncAt: c.lastIncrementalSyncAt?.toISOString() ?? null, lastFullSyncAt: c.lastFullSyncAt?.toISOString() ?? null, lastError: c.lastError })),
    recentEvents: events.map((e) => ({ cloudEventId: e.cloudEventId, type: e.type, receivedAt: e.receivedAt.toISOString(), processingStatus: e.processingStatus, attempts: e.attempts, lastErrorCode: e.lastErrorCode })),
    aiUsage: usage,
  }
}

export interface AuditQuery {
  entity?: string
  entityId?: string
  actorUserId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export async function listAuditEntries(ctx: AppContext, principal: Principal, q: AuditQuery = {}): Promise<Page<AuditEntryDto>> {
  if (!hasPermission(principal, Permission.AUDIT_READ)) throw DomainError.forbidden('No tienes permiso para ver auditoría')
  const settings = await ctx.getSettings()
  const tz = settings.companyTimezone
  const filter: Parameters<typeof ctx.repos.audit.list>[0] = {}
  if (q.entity) filter.entity = q.entity
  if (q.entityId) filter.entityId = q.entityId
  if (q.actorUserId) filter.actorUserId = q.actorUserId
  if (q.from) filter.from = parseLocalDate(q.from, tz) ?? undefined
  if (q.to) {
    const d = parseLocalDate(q.to, tz)
    if (d) filter.to = endOfDay(d, tz)
  }
  const page = await ctx.repos.audit.list(filter, { page: q.page ?? 1, pageSize: q.pageSize ?? 25 })
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now())
  return { ...page, items: page.items.map((e) => toAuditEntryDto(e, lk)) }
}

/** GET /meetings/:id/audit — AUDIT_READ o acceso a la reunión. */
export async function listMeetingAudit(ctx: AppContext, principal: Principal, meetingId: string): Promise<AuditEntryDto[]> {
  const meeting = requireMeeting(await ctx.repos.meetings.findById(meetingId), meetingId)
  if (!hasPermission(principal, Permission.AUDIT_READ)) {
    const participants = await ctx.repos.meetings.listParticipants(meetingId)
    if (!canAccessMeeting(principal, { ...meeting, participantUserIds: participants.map((p) => p.internalUserId).filter((x): x is string => x !== null) })) throw DomainError.forbidden('No tienes acceso a esta reunión')
  }
  const settings = await ctx.getSettings()
  const page = await ctx.repos.audit.list({ entity: 'Meeting', entityId: meetingId }, { page: 1, pageSize: 200 })
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now())
  return page.items.map((e) => toAuditEntryDto(e, lk))
}

export async function listUsers(ctx: AppContext): Promise<UserDto[]> {
  const settings = await ctx.getSettings()
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now())
  return (await ctx.repos.users.list()).map((u) => toUserDto(u, lk))
}

export async function listAreas(ctx: AppContext, activeOnly = false): Promise<AreaDto[]> {
  return (await ctx.repos.areas.list(activeOnly)).map(toAreaDto)
}

export async function listProjects(ctx: AppContext, activeOnly = false): Promise<ProjectDto[]> {
  const aliases = await ctx.repos.projects.listAliases()
  return (await ctx.repos.projects.list(activeOnly)).map((p) => toProjectDto(p, aliases))
}

/** GET /team/external-assignees — responsables externos (§16.4) para selectores. */
export async function listExternalAssignees(ctx: AppContext, activeOnly = true): Promise<ExternalAssigneeDto[]> {
  const all = await ctx.repos.externalAssignees.list()
  return all
    .filter((a) => !activeOnly || a.active)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
    .map((a) => ({ id: a.id, displayName: a.displayName, company: a.company, email: a.email, active: a.active }))
}

/** GET /session — usuario vigente + permisos efectivos del rol (RBAC server-side, §25). */
export async function getSession(ctx: AppContext, principal: Principal): Promise<SessionDto> {
  const user = await ctx.repos.users.findById(principal.id)
  if (!user) throw DomainError.notFound('User', principal.id)
  const settings = await ctx.getSettings()
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now())
  return { user: toUserDto(user, lk), permissions: [...permissionsFor(user.role)] }
}

/**
 * GET /notifications/counts — contadores baratos para badges: revisión IA
 * pendiente (sólo quien puede resolverla) y propuestas de cierre que el
 * principal puede aprobar.
 */
export async function getNotificationCounts(ctx: AppContext, principal: Principal): Promise<NotificationCountsDto> {
  const pendingAiReview = hasPermission(principal, Permission.AI_REVIEW_RESOLVE) ? await ctx.repos.aiReview.countPending() : 0
  let pendingCompletionProposals = 0
  if (hasPermission(principal, Permission.ACTION_ITEM_APPROVE_COMPLETION)) {
    const proposals = await ctx.repos.completionProposals.listPending({ limit: 500 })
    for (const p of proposals) {
      const item = await ctx.repos.actionItems.findById(p.actionItemId)
      if (item && canApproveCompletion(principal, item)) pendingCompletionProposals += 1
    }
  }
  return { pendingAiReview, pendingCompletionProposals }
}
