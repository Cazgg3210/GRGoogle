import { WeeklyDigestResultSchema } from '@smlxl/contracts'
import {
  ActionItemStatus,
  ActionItemType,
  ArtifactStatus,
  DigestAudience,
  DomainError,
  MeetingProcessingStatus,
  OPEN_ACTION_ITEM_STATUSES,
  Permission,
  RelationType,
  daysOpen,
  endOfDay,
  hasPermission,
  isOverdue,
  isoWeekOf,
  parseLocalDate,
  toLocalDateString,
  type ActionItem,
  type Principal,
  type WeeklyDigest,
  type WeeklyDigestInput,
  type WeeklyDigestResult,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { audit } from '../../shared.js'
import { loadLookups, type Lookups } from '../../queries/mappers.js'
import type { DigestGroup, DigestItem, WeeklyDigestPayload } from './payload.js'

/**
 * GenerateWeeklyDigest (§18): calcula las secciones A–G para la semana ISO de
 * `weekOf` (por defecto la actual), enriquece opcionalmente con narrativa IA y
 * persiste el WeeklyDigest (versión incremental). Nunca muta action items.
 */
export interface GenerateDigestInput {
  weekOf?: string
  audience?: WeeklyDigest['audience']
  /** Si false, omite la narrativa IA. */
  withNarrative?: boolean
}

function toDigestItem(i: ActionItem, lk: Lookups, appUrl: string): DigestItem {
  return {
    id: i.id,
    key: i.externalKey,
    title: i.title,
    owner: i.ownerUserId ? (lk.users.get(i.ownerUserId)?.displayName ?? null) : i.ownerTextOriginal,
    area: i.areaId ? (lk.areas.get(i.areaId)?.name ?? null) : null,
    project: i.projectId ? (lk.projects.get(i.projectId)?.canonicalName ?? null) : null,
    priority: i.priority,
    status: i.status,
    dueDate: i.dueDate ? toLocalDateString(i.dueDate, lk.timezone) : null,
    url: `${appUrl}/pendientes/${i.id}`,
  }
}

function groupBy(items: DigestItem[], key: (i: DigestItem) => string): DigestGroup[] {
  const map = new Map<string, DigestItem[]>()
  for (const i of items) {
    const k = key(i)
    const arr = map.get(k) ?? []
    arr.push(i)
    map.set(k, arr)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length).map(([label, its]) => ({ label, items: its }))
}

export async function buildWeeklyDigestPayload(ctx: AppContext, weekOf: Date, options: { withNarrative?: boolean } = {}): Promise<WeeklyDigestPayload> {
  const settings = await ctx.getSettings()
  const tz = settings.companyTimezone
  const now = ctx.clock.now()
  const week = isoWeekOf(weekOf, tz)
  const { weekStart, weekEnd } = week
  const inWeek = (d: Date | null | undefined): boolean => d !== null && d !== undefined && d >= weekStart && d <= weekEnd
  const lk = await loadLookups(ctx.repos, settings, now)
  const appUrl = ctx.env.APP_URL
  const config = await ctx.repos.digests.getConfig()

  const all = (await ctx.repos.actionItems.listAll({})).filter((i) => {
    if (config.includeAreaIds && config.includeAreaIds.length > 0 && i.areaId && !config.includeAreaIds.includes(i.areaId)) return false
    if (!config.includeExternalTasks && i.externalAssigneeId && !i.ownerUserId) return false
    return true
  })
  const open = all.filter((i) => OPEN_ACTION_ITEM_STATUSES.includes(i.status) && i.status !== ActionItemStatus.PROPOSED)
  const newItems = all.filter((i) => inWeek(i.createdAt) && i.status !== ActionItemStatus.CANCELLED)
  const approved = all.filter((i) => i.status === ActionItemStatus.COMPLETED && inWeek(i.completedAt))
  const overdueItems = open.filter((i) => isOverdue({ dueDate: i.dueDate, status: i.status }, now, tz))
  const blocked = open.filter((i) => i.status === ActionItemStatus.BLOCKED)
  const noDue = open.filter((i) => !i.dueDate)
  const noOwner = open.filter((i) => !i.ownerUserId && !i.externalAssigneeId)
  const proposed = open.filter((i) => i.status === ActionItemStatus.COMPLETION_PROPOSED)

  const meetingsPage = await ctx.repos.meetings.list({ from: weekStart, to: weekEnd }, { page: 1, pageSize: 1000 })
  const meetings = meetingsPage.items.filter((m) => m.status !== 'CANCELLED')
  const processedStatuses: string[] = [MeetingProcessingStatus.COMPLETED, MeetingProcessingStatus.REVIEW_REQUIRED, MeetingProcessingStatus.ANALYZED]
  const withoutArtifacts = meetings.filter((m) => m.transcriptStatus === ArtifactStatus.UNAVAILABLE || m.transcriptStatus === ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST || m.transcriptStatus === ArtifactStatus.CAPABILITY_BLOCKED)
  const withError = meetings.filter((m) => m.processingStatus === MeetingProcessingStatus.FAILED)

  const newDigestItems = newItems.map((i) => toDigestItem(i, lk, appUrl))
  const backlog = []
  for (const i of open.filter((x) => x.createdAt < weekStart)) {
    const history = await ctx.repos.actionItems.listStatusHistory(i.id)
    const lastProgress = [...history].reverse().find((h) => h.toStatus === ActionItemStatus.IN_PROGRESS || h.toStatus === ActionItemStatus.COMPLETION_PROPOSED)
    backlog.push({ ...toDigestItem(i, lk, appUrl), daysOpen: daysOpen(i.createdAt, now, null), lastMentionedAt: i.lastMentionedAt ? toLocalDateString(i.lastMentionedAt, tz) : null, lastProgressAt: lastProgress ? toLocalDateString(lastProgress.changedAt, tz) : null })
  }
  backlog.sort((a, b) => b.daysOpen - a.daysOpen)

  const repeated = []
  for (const i of open) {
    const mentions = await ctx.repos.actionItems.countMentionsWithoutProgress(i.id)
    if (mentions >= 2) repeated.push({ ...toDigestItem(i, lk, appUrl), mentions })
  }

  // E. Cambios detectados: historial + auditoría + revisión IA de la semana.
  const changes: WeeklyDigestPayload['changes'] = []
  for (const i of all) {
    const history = await ctx.repos.actionItems.listStatusHistory(i.id)
    for (const h of history.filter((x) => inWeek(x.changedAt))) {
      if (h.toStatus === ActionItemStatus.COMPLETION_PROPOSED) changes.push({ actionItemId: i.id, key: i.externalKey, title: i.title, type: 'POSSIBLE_COMPLETION', detail: h.reason ?? 'Cierre propuesto', at: h.changedAt.toISOString(), url: `${appUrl}/pendientes/${i.id}` })
      if (h.fromStatus === ActionItemStatus.COMPLETED && h.toStatus === ActionItemStatus.IN_PROGRESS) changes.push({ actionItemId: i.id, key: i.externalKey, title: i.title, type: 'REOPENED', detail: h.reason ?? 'Tarea reabierta', at: h.changedAt.toISOString(), url: `${appUrl}/pendientes/${i.id}` })
    }
    const links = await ctx.repos.actionItems.listLinks(i.id)
    for (const l of links.filter((x) => inWeek(x.createdAt) && x.relationType === RelationType.UPDATED && x.detectedDueDate)) {
      changes.push({ actionItemId: i.id, key: i.externalKey, title: i.title, type: 'DUE_DATE', detail: `Fecha detectada en reunión: ${toLocalDateString(l.detectedDueDate as Date, tz)}`, at: l.createdAt.toISOString(), url: `${appUrl}/pendientes/${i.id}` })
    }
  }
  const auditPage = await ctx.repos.audit.list({ entity: 'ActionItem', from: weekStart, to: weekEnd }, { page: 1, pageSize: 500 })
  for (const e of auditPage.items) {
    if (e.action !== 'action_item.updated') continue
    const before = (e.before ?? {}) as Record<string, unknown>
    const after = (e.after ?? {}) as Record<string, unknown>
    const item = all.find((i) => i.id === e.entityId)
    if (!item) continue
    const base = { actionItemId: item.id, key: item.externalKey, title: item.title, at: e.timestamp.toISOString(), url: `${appUrl}/pendientes/${item.id}` }
    if (String(before['ownerUserId'] ?? '') !== String(after['ownerUserId'] ?? '')) changes.push({ ...base, type: 'OWNER', detail: `Responsable: ${lk.users.get(String(after['ownerUserId']))?.displayName ?? 'sin asignar'}` })
    if (String(before['dueDate'] ?? '') !== String(after['dueDate'] ?? '')) changes.push({ ...base, type: 'DUE_DATE', detail: `Fecha compromiso modificada` })
    if (String(before['priority'] ?? '') !== String(after['priority'] ?? '')) changes.push({ ...base, type: 'PRIORITY', detail: `Prioridad: ${String(after['priority'])}` })
  }
  for (const m of meetings) {
    for (const r of await ctx.repos.aiReview.listByMeeting(m.id)) {
      if (!inWeek(r.createdAt) || !r.reasons.includes('POSSIBLE_DUPLICATE')) continue
      const candidate = r.candidateActionItemId ? all.find((i) => i.id === r.candidateActionItemId) : undefined
      const extracted = (r.extracted ?? {}) as { title?: string }
      changes.push({ actionItemId: candidate?.id ?? r.id, key: candidate?.externalKey ?? 'IA', title: extracted.title ?? candidate?.title ?? 'Tarea detectada', type: 'POSSIBLE_DUPLICATE', detail: `Posible duplicado detectado en "${m.title}"`, at: r.createdAt.toISOString(), url: candidate ? `${appUrl}/pendientes/${candidate.id}` : `${appUrl}/revision-ia` })
    }
  }
  changes.sort((a, b) => b.at.localeCompare(a.at))

  const approvalInbox = []
  for (const i of proposed) {
    const proposal = await ctx.repos.completionProposals.findPendingByActionItem(i.id)
    approvalInbox.push({
      ...toDigestItem(i, lk, appUrl),
      proposalId: proposal?.id ?? '',
      proposedBy: proposal ? (proposal.proposedByType === 'AI' ? 'IA' : (lk.users.get(proposal.proposedByUserId ?? '')?.displayName ?? 'Usuario')) : 'Desconocido',
      reason: proposal?.reason ?? '',
    })
  }

  const nextWeekEnd = new Date(weekEnd.getTime() + 7 * 86_400_000)
  const dueSoon = open.filter((i) => i.dueDate && endOfDay(i.dueDate, tz) > weekEnd && i.dueDate <= nextWeekEnd)
  const highPriority = open.filter((i) => i.priority === 'HIGH' || i.priority === 'URGENT')
  const recurring = open.filter((i) => i.type === ActionItemType.RECURRING)

  const payload: WeeklyDigestPayload = {
    version: 1,
    weekLabel: week.label,
    weekStart: toLocalDateString(weekStart, tz),
    weekEnd: toLocalDateString(weekEnd, tz),
    generatedAt: now.toISOString(),
    timezone: tz,
    summary: {
      meetingsDetected: meetings.length,
      meetingsProcessed: meetings.filter((m) => processedStatuses.includes(m.processingStatus)).length,
      meetingsWithoutArtifacts: withoutArtifacts.length,
      meetingsWithError: withError.length,
      newActionItems: newItems.length,
      pendingProposals: proposed.length,
      approvedCompletions: approved.length,
      overdue: overdueItems.length,
      noDueDate: noDue.length,
      blocked: blocked.length,
    },
    newCommitments: {
      items: newDigestItems,
      byOwner: groupBy(newDigestItems, (i) => i.owner ?? 'Sin responsable'),
      byArea: groupBy(newDigestItems, (i) => i.area ?? 'Sin área'),
      byPriority: groupBy(newDigestItems, (i) => i.priority),
    },
    backlog,
    risks: {
      overdue: overdueItems.map((i) => ({ ...toDigestItem(i, lk, appUrl), daysOverdue: Math.max(0, Math.floor((now.getTime() - endOfDay(i.dueDate as Date, tz).getTime()) / 86_400_000) + 1) })),
      noOwner: noOwner.map((i) => toDigestItem(i, lk, appUrl)),
      noDueDate: noDue.map((i) => toDigestItem(i, lk, appUrl)),
      blocked: blocked.map((i) => toDigestItem(i, lk, appUrl)),
      repeatedWithoutProgress: repeated,
      captureIssues: [...withoutArtifacts, ...withError].map((m) => ({
        meetingId: m.id,
        title: m.title,
        startAt: m.startAt.toISOString(),
        issue: m.processingStatus === MeetingProcessingStatus.FAILED ? `Error de procesamiento (${m.lastErrorCode ?? 'desconocido'})` : m.transcriptStatus === ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST ? 'Organizador externo: artefactos no accesibles' : m.transcriptStatus === ArtifactStatus.CAPABILITY_BLOCKED ? 'Auto-captura bloqueada por política' : 'Sin transcripción ni notas',
        url: `${appUrl}/reuniones/${m.id}`,
      })),
    },
    changes,
    approvalInbox,
    nextWeek: { dueSoon: dueSoon.map((i) => toDigestItem(i, lk, appUrl)), recurring: recurring.map((i) => toDigestItem(i, lk, appUrl)), highPriority: highPriority.map((i) => toDigestItem(i, lk, appUrl)) },
    narrative: null,
  }

  if (options.withNarrative ?? true) {
    const input: WeeklyDigestInput = {
      weekLabel: payload.weekLabel,
      weekStart: payload.weekStart,
      weekEnd: payload.weekEnd,
      stats: { ...payload.summary },
      newItems: newDigestItems.map((i) => ({ key: i.key, title: i.title, owner: i.owner, area: i.area, priority: i.priority, dueDate: i.dueDate })),
      overdueItems: payload.risks.overdue.map((i) => ({ key: i.key, title: i.title, owner: i.owner, daysOverdue: i.daysOverdue })),
      proposals: approvalInbox.map((i) => ({ key: i.key, title: i.title, reason: i.reason })),
      captureIssues: payload.risks.captureIssues.map((c) => ({ meetingTitle: c.title, issue: c.issue })),
    }
    try {
      const res = await ctx.ai.generateWeeklyDigest(input)
      const validated = WeeklyDigestResultSchema.safeParse(res.result)
      if (validated.success) payload.narrative = validated.data as WeeklyDigestResult
      else ctx.logger.warn({ issues: validated.error.issues.length }, 'Narrativa del digest inválida; se omite')
    } catch (err) {
      ctx.logger.warn({ errorCode: err instanceof DomainError ? err.code : 'ERR' }, 'Narrativa IA del digest falló; se continúa sin narrativa')
    }
  }
  return payload
}

export async function generateWeeklyDigest(ctx: AppContext, principal: Principal | null, input: GenerateDigestInput = {}): Promise<WeeklyDigest> {
  if (principal && !hasPermission(principal, Permission.DIGEST_GENERATE)) throw DomainError.forbidden('No tienes permiso para generar el resumen semanal')
  const settings = await ctx.getSettings()
  const tz = settings.companyTimezone
  const weekOf = (input.weekOf ? parseLocalDate(input.weekOf, tz) : null) ?? ctx.clock.now()
  const audience = input.audience ?? DigestAudience.EXECUTIVE
  const payload = await buildWeeklyDigestPayload(ctx, weekOf, { withNarrative: input.withNarrative ?? true })
  const week = isoWeekOf(weekOf, tz)
  const now = ctx.clock.now()
  const digest = await ctx.uow.run(async (repos) => {
    const existing = await repos.digests.findByWeek(week.weekStart, audience)
    const saved = await repos.digests.save({
      id: ctx.ids.next(),
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      generatedAt: now,
      audience,
      payload,
      sentAt: null,
      version: (existing?.version ?? 0) + 1,
      recipientEmails: [],
    })
    await audit(repos, ctx, { actorType: principal ? 'USER' : 'SYSTEM', actorUserId: principal?.id ?? null, action: 'digest.generated', entity: 'WeeklyDigest', entityId: saved.id, after: { weekLabel: week.label, version: saved.version, summary: payload.summary } })
    return saved
  })
  metrics.increment(MetricNames.DIGEST_GENERATED)
  await ctx.events.publish({ type: 'WeeklyDigestGenerated', digestId: digest.id, weekLabel: week.label, occurredAt: now })
  return digest
}
