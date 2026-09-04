import type { ActionItemDetailDto, ActionItemDto } from '@smlxl/contracts'
import {
  ActionItemStatus,
  DomainError,
  OPEN_ACTION_ITEM_STATUSES,
  UserRole,
  canAccessActionItem,
  isOverdue,
  isoWeekOf,
  type ActionItem,
  type ActionItemFilter,
  type ActionItemPriority,
  type Page,
  type Principal,
} from '@smlxl/domain'
import type { AppContext } from '../context.js'
import { paginate, requireActionItem } from '../shared.js'
import { loadLookups, toActionItemDetailDto, toActionItemDto, type Lookups } from './mappers.js'

/**
 * Consultas de action items (docs/api/endpoints.md, vistas `view=`).
 *
 * Nota MVP: el alcance por rol (MANAGER/MEMBER) y el orden `attention` se
 * resuelven en memoria sobre `listAll` + paginación local. Para ADMIN/DIRECTOR/
 * AUDITOR con orden por columna se usa la paginación del repositorio.
 */
export type ActionItemView = 'all' | 'mine' | 'team' | 'overdue' | 'thisWeek' | 'noDueDate' | 'noOwner' | 'blocked' | 'completed' | 'proposed'
export type ActionItemSort = 'attention' | 'dueDate' | 'createdAt' | 'updatedAt' | 'priority'

export interface ListActionItemsQuery {
  view?: ActionItemView
  status?: string
  ownerUserId?: string
  areaId?: string
  projectId?: string
  meetingId?: string
  priority?: ActionItemPriority
  search?: string
  sort?: ActionItemSort
  page?: number
  pageSize?: number
}

const PRIORITY_RANK: Record<ActionItemPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

function hasGlobalScope(principal: Principal): boolean {
  return principal.role === UserRole.ADMIN || principal.role === UserRole.DIRECTOR || principal.role === UserRole.AUDITOR
}

function isVisible(principal: Principal, item: ActionItem): boolean {
  return canAccessActionItem(principal, item)
}

export function buildFilter(principal: Principal, q: ListActionItemsQuery, now: Date, timezone: string): { filter: ActionItemFilter; post: (item: ActionItem) => boolean } {
  const view = q.view ?? 'all'
  const filter: ActionItemFilter = {}
  const posts: Array<(item: ActionItem) => boolean> = []
  const open = [...OPEN_ACTION_ITEM_STATUSES]
  switch (view) {
    case 'all':
      filter.status = open
      break
    case 'mine':
      filter.ownerUserId = principal.id
      filter.status = open
      break
    case 'team': {
      const team = new Set([principal.id, ...(principal.teamUserIds ?? [])])
      const areas = new Set(principal.managedAreaIds ?? (principal.areaId ? [principal.areaId] : []))
      filter.status = open
      posts.push((i) => (i.ownerUserId !== null && team.has(i.ownerUserId)) || (i.areaId !== null && areas.has(i.areaId)))
      break
    }
    case 'overdue':
      filter.status = open
      posts.push((i) => isOverdue({ dueDate: i.dueDate, status: i.status }, now, timezone))
      break
    case 'thisWeek': {
      const w = isoWeekOf(now, timezone)
      filter.status = open
      filter.dueFrom = w.weekStart
      filter.dueTo = w.weekEnd
      break
    }
    case 'noDueDate':
      filter.status = open
      filter.noDueDate = true
      break
    case 'noOwner':
      filter.status = open
      filter.noOwner = true
      break
    case 'blocked':
      filter.status = [ActionItemStatus.BLOCKED]
      break
    case 'completed':
      filter.status = [ActionItemStatus.COMPLETED]
      break
    case 'proposed':
      filter.status = [ActionItemStatus.PROPOSED, ActionItemStatus.COMPLETION_PROPOSED]
      break
  }
  if (q.status) {
    const statuses = q.status.split(',').map((s) => s.trim()).filter((s): s is ActionItemStatus => (Object.values(ActionItemStatus) as string[]).includes(s))
    if (statuses.length > 0) filter.status = statuses
  }
  if (q.ownerUserId) filter.ownerUserId = q.ownerUserId
  if (q.areaId) filter.areaId = q.areaId
  if (q.projectId) filter.projectId = q.projectId
  if (q.meetingId) filter.meetingId = q.meetingId
  if (q.search) filter.search = q.search
  if (q.priority) posts.push((i) => i.priority === q.priority)
  return { filter, post: (item) => posts.every((p) => p(item)) }
}

function sortItems(items: ActionItem[], sort: ActionItemSort, lk: Lookups): ActionItem[] {
  const score = new Map<string, number>()
  if (sort === 'attention') for (const i of items) score.set(i.id, toActionItemDto(i, lk).attentionScore)
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'attention':
        return (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
      case 'dueDate':
        return (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
      case 'createdAt':
        return b.createdAt.getTime() - a.createdAt.getTime()
      case 'updatedAt':
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
    }
  })
}

export async function listActionItems(ctx: AppContext, principal: Principal, q: ListActionItemsQuery = {}): Promise<Page<ActionItemDto>> {
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const sort = q.sort ?? 'attention'
  const { filter, post } = buildFilter(principal, q, now, settings.companyTimezone)
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 25
  const needsMemory = sort === 'attention' || !hasGlobalScope(principal) || (q.view ?? 'all') === 'overdue' || (q.view ?? 'all') === 'team' || q.priority !== undefined
  let items: ActionItem[]
  let total: number
  if (needsMemory) {
    const all = (await ctx.repos.actionItems.listAll(filter)).filter((i) => isVisible(principal, i) && post(i))
    const lk0 = await loadLookups(ctx.repos, settings, now)
    const sorted = sortItems(all, sort, lk0)
    const p = paginate(sorted, page, pageSize)
    items = p.items
    total = p.total
  } else {
    const p = await ctx.repos.actionItems.list(filter, { page, pageSize })
    items = sortItems(p.items, sort, await loadLookups(ctx.repos, settings, now))
    total = p.total
  }
  const lk = await loadLookups(ctx.repos, settings, now, items.map((i) => i.createdFromMeetingId).filter((x): x is string => x !== null))
  const pending = await ctx.repos.completionProposals.listPending({ actionItemIds: items.map((i) => i.id) })
  const pendingByItem = new Map(pending.map((p) => [p.actionItemId, p.id]))
  const dtos: ActionItemDto[] = []
  for (const item of items) {
    const mentions = await ctx.repos.actionItems.countMentionsWithoutProgress(item.id)
    dtos.push(toActionItemDto(item, lk, { pendingProposalId: pendingByItem.get(item.id) ?? null, mentionsWithoutProgress: mentions }))
  }
  return { items: dtos, total, page, pageSize }
}

export async function getActionItemDetail(ctx: AppContext, principal: Principal, id: string): Promise<ActionItemDetailDto> {
  const item = requireActionItem(await ctx.repos.actionItems.findById(id), id)
  if (!isVisible(principal, item)) throw DomainError.forbidden('No tienes acceso a esta tarea')
  const settings = await ctx.getSettings()
  const [comments, history, links, proposals, mentions] = await Promise.all([
    ctx.repos.actionItems.listComments(id),
    ctx.repos.actionItems.listStatusHistory(id),
    ctx.repos.actionItems.listLinks(id),
    ctx.repos.completionProposals.listPending({ actionItemIds: [id] }).then(async (pending) => {
      // Incluir también propuestas históricas si el repositorio las expone por id.
      const all = [...pending]
      return all
    }),
    ctx.repos.actionItems.countMentionsWithoutProgress(id),
  ])
  const meetingIds = [item.createdFromMeetingId, item.latestMeetingId, ...links.map((l) => l.meetingId), ...proposals.map((p) => p.proposedFromMeetingId)].filter((x): x is string => x !== null)
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now(), meetingIds)
  const external = item.externalAssigneeId ? await ctx.repos.externalAssignees.findById(item.externalAssigneeId) : null
  return toActionItemDetailDto(item, principal, lk, { comments, history, links, proposals, mentionsWithoutProgress: mentions, externalAssigneeName: external?.displayName ?? null })
}

export async function getActionItemDto(ctx: AppContext, principal: Principal, id: string): Promise<ActionItemDto> {
  const item = requireActionItem(await ctx.repos.actionItems.findById(id), id)
  if (!isVisible(principal, item)) throw DomainError.forbidden('No tienes acceso a esta tarea')
  const settings = await ctx.getSettings()
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now(), item.createdFromMeetingId ? [item.createdFromMeetingId] : [])
  const pending = await ctx.repos.completionProposals.findPendingByActionItem(id)
  const external = item.externalAssigneeId ? await ctx.repos.externalAssignees.findById(item.externalAssigneeId) : null
  return toActionItemDto(item, lk, { pendingProposalId: pending?.id ?? null, mentionsWithoutProgress: await ctx.repos.actionItems.countMentionsWithoutProgress(id), externalAssigneeName: external?.displayName ?? null })
}

/** GET /meetings/:id/action-items */
export async function listActionItemsByMeeting(ctx: AppContext, principal: Principal, meetingId: string): Promise<ActionItemDto[]> {
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const links = await ctx.repos.actionItems.listLinksByMeeting(meetingId)
  const ids = new Set(links.map((l) => l.actionItemId))
  for (const i of await ctx.repos.actionItems.listAll({ meetingId })) ids.add(i.id)
  const lk = await loadLookups(ctx.repos, settings, now, [meetingId])
  const out: ActionItemDto[] = []
  for (const id of ids) {
    const item = await ctx.repos.actionItems.findById(id)
    if (!item || !isVisible(principal, item)) continue
    const pending = await ctx.repos.completionProposals.findPendingByActionItem(id)
    out.push(toActionItemDto(item, lk, { pendingProposalId: pending?.id ?? null }))
  }
  return out.sort((a, b) => b.attentionScore - a.attentionScore)
}
