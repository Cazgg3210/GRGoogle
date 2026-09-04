import type { DashboardDto } from '@smlxl/contracts'
import {
  ActionItemStatus,
  MeetingProcessingStatus,
  OPEN_ACTION_ITEM_STATUSES,
  UserRole,
  canAccessActionItem,
  canAccessMeeting,
  captureQualityBuckets,
  endOfDay,
  isOverdue,
  parseLocalDate,
  previousWeeks,
  toLocalDateString,
  type ActionItem,
  type Meeting,
  type Principal,
} from '@smlxl/domain'
import type { AppContext } from '../context.js'
import { loadLookups, toActionItemDto, toMeetingListItemDto } from './mappers.js'

export interface DashboardQuery {
  from?: string
  to?: string
  areaId?: string
  projectId?: string
}

type KpiRow = DashboardDto['byArea'][number]

function kpiRow(key: string, label: string, open: ActionItem[], completed: ActionItem[], now: Date, tz: string): KpiRow {
  const total = open.length + completed.length
  const completedN = completed.length
  return {
    key,
    label,
    total,
    completed: completedN,
    inProgress: open.filter((i) => i.status === ActionItemStatus.IN_PROGRESS).length,
    pending: open.filter((i) => i.status === ActionItemStatus.PENDING || i.status === ActionItemStatus.PROPOSED).length,
    completionProposed: open.filter((i) => i.status === ActionItemStatus.COMPLETION_PROPOSED).length,
    overdue: open.filter((i) => isOverdue({ dueDate: i.dueDate, status: i.status }, now, tz)).length,
    progressPct: total > 0 ? Math.round((completedN / total) * 1000) / 10 : 0,
  }
}

/** Dashboard (§20): KPIs, por área/persona, tendencia semanal, atención, calidad de captura. */
export async function getDashboard(ctx: AppContext, principal: Principal, q: DashboardQuery = {}): Promise<DashboardDto> {
  const settings = await ctx.getSettings()
  const tz = settings.companyTimezone
  const now = ctx.clock.now()
  const from = (q.from ? parseLocalDate(q.from, tz) : null) ?? new Date(now.getTime() - 30 * 86_400_000)
  const to = q.to ? endOfDay(parseLocalDate(q.to, tz) ?? now, tz) : endOfDay(now, tz)
  const global = principal.role === UserRole.ADMIN || principal.role === UserRole.DIRECTOR || principal.role === UserRole.AUDITOR

  const scopeFilter = (i: ActionItem): boolean => (global || canAccessActionItem(principal, i)) && (!q.areaId || i.areaId === q.areaId) && (!q.projectId || i.projectId === q.projectId)
  const open = (await ctx.repos.actionItems.listAll({ status: [...OPEN_ACTION_ITEM_STATUSES] })).filter(scopeFilter)
  const completedInPeriod = (await ctx.repos.actionItems.listAll({ status: [ActionItemStatus.COMPLETED], completedFrom: from, completedTo: to })).filter(scopeFilter)
  const overall = kpiRow('all', 'Total', open, completedInPeriod, now, tz)

  const meetingsPage = await ctx.repos.meetings.list({ from, to }, { page: 1, pageSize: 1000 })
  const meetingsInPeriod: Meeting[] = []
  for (const m of meetingsPage.items) {
    if (global) {
      meetingsInPeriod.push(m)
      continue
    }
    const participants = await ctx.repos.meetings.listParticipants(m.id)
    if (canAccessMeeting(principal, { ...m, participantUserIds: participants.map((p) => p.internalUserId).filter((x): x is string => x !== null) })) meetingsInPeriod.push(m)
  }
  const processedStatuses: string[] = [MeetingProcessingStatus.COMPLETED, MeetingProcessingStatus.REVIEW_REQUIRED, MeetingProcessingStatus.ANALYZED]
  const lk = await loadLookups(ctx.repos, settings, now)

  const areas = [...lk.areas.values()].filter((a) => a.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const byArea = areas
    .map((a) => kpiRow(a.id, a.name, open.filter((i) => i.areaId === a.id), completedInPeriod.filter((i) => i.areaId === a.id), now, tz))
    .filter((r) => r.total > 0)
  const noArea = kpiRow('none', 'Sin área', open.filter((i) => !i.areaId), completedInPeriod.filter((i) => !i.areaId), now, tz)
  if (noArea.total > 0) byArea.push(noArea)

  const ownerIds = new Set([...open, ...completedInPeriod].map((i) => i.ownerUserId).filter((x): x is string => x !== null))
  const byPerson = [...ownerIds]
    .map((id) => kpiRow(id, lk.users.get(id)?.displayName ?? id, open.filter((i) => i.ownerUserId === id), completedInPeriod.filter((i) => i.ownerUserId === id), now, tz))
    .sort((a, b) => b.total - a.total)

  // Tendencia semanal: últimas 8 semanas ISO sobre todos los items del alcance.
  const allItems = (await ctx.repos.actionItems.listAll({})).filter(scopeFilter)
  const weeklyTrend = previousWeeks(now, 8, tz).map((w) => {
    const created = allItems.filter((i) => i.createdAt >= w.weekStart && i.createdAt <= w.weekEnd).length
    const completed = allItems.filter((i) => i.completedAt && i.completedAt >= w.weekStart && i.completedAt <= w.weekEnd).length
    const openAtEnd = allItems.filter((i) => i.createdAt <= w.weekEnd && (!i.completedAt || i.completedAt > w.weekEnd) && (!i.cancelledAt || i.cancelledAt > w.weekEnd))
    const overdueAtEnd = openAtEnd.filter((i) => i.dueDate && endOfDay(i.dueDate, tz).getTime() < w.weekEnd.getTime()).length
    return {
      week: w.label,
      weekStart: toLocalDateString(w.weekStart, tz),
      created,
      completed,
      openAtEnd: openAtEnd.length,
      overdueAtEnd,
      closeRate: Math.round((completed / Math.max(1, completed + openAtEnd.length)) * 100) / 100,
    }
  })

  const pending = await ctx.repos.completionProposals.listPending({ actionItemIds: open.map((i) => i.id) })
  const pendingByItem = new Map(pending.map((p) => [p.actionItemId, p.id]))
  const scored = []
  for (const i of open) {
    const mentions = await ctx.repos.actionItems.countMentionsWithoutProgress(i.id)
    scored.push(toActionItemDto(i, lk, { pendingProposalId: pendingByItem.get(i.id) ?? null, mentionsWithoutProgress: mentions }))
  }
  const needsAttention = scored.filter((d) => d.attentionScore > 0).sort((a, b) => b.attentionScore - a.attentionScore).slice(0, 10)

  const buckets = meetingsInPeriod.map((m) => captureQualityBuckets(m))
  const count = (b: string): number => buckets.filter((bs) => (bs as string[]).includes(b)).length
  const recent = (await ctx.repos.meetings.listRecent(30)).slice(0, 30)
  const recentMeetings = []
  for (const m of recent) {
    const participants = await ctx.repos.meetings.listParticipants(m.id)
    if (!global && !canAccessMeeting(principal, { ...m, participantUserIds: participants.map((p) => p.internalUserId).filter((x): x is string => x !== null) })) continue
    const [actionItemCount, reviews] = await Promise.all([ctx.repos.meetings.countActionItems(m.id), ctx.repos.aiReview.listPending({ meetingId: m.id })])
    recentMeetings.push(toMeetingListItemDto(m, lk, { participants, actionItemCount, pendingReviewCount: reviews.length }))
    if (recentMeetings.length >= 15) break
  }

  return {
    period: { from: toLocalDateString(from, tz), to: toLocalDateString(to, tz) },
    kpis: {
      totalOpen: open.length,
      completedInPeriod: completedInPeriod.length,
      inProgress: overall.inProgress,
      pending: overall.pending,
      completionProposed: overall.completionProposed,
      progressPct: overall.progressPct,
      overdue: overall.overdue,
      noDueDate: open.filter((i) => !i.dueDate).length,
      meetingsProcessed: meetingsInPeriod.filter((m) => processedStatuses.includes(m.processingStatus)).length,
      meetingsDetected: meetingsInPeriod.length,
    },
    byArea,
    byPerson,
    weeklyTrend,
    needsAttention,
    captureQuality: {
      detected: meetingsInPeriod.length,
      withTranscript: count('WITH_TRANSCRIPT'),
      withSmartNotes: count('WITH_SMART_NOTES'),
      transcriptOnly: count('TRANSCRIPT_ONLY'),
      noArtifact: count('NO_ARTIFACT'),
      externalHostUnavailable: count('EXTERNAL_HOST_UNAVAILABLE'),
      apiErrors: count('API_ERROR'),
    },
    recentMeetings,
  }
}
