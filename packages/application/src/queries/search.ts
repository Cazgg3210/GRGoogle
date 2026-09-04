import type { SearchResultDto } from '@smlxl/contracts'
import {
  UserRole,
  canAccessActionItem,
  canAccessMeeting,
  normalizeText,
  type Principal,
} from '@smlxl/domain'
import type { AppContext } from '../context.js'
import { loadLookups } from './mappers.js'

function snippet(text: string, q: string, width = 160): string {
  const n = normalizeText(text)
  const idx = n.indexOf(normalizeText(q).split(' ')[0] ?? '')
  if (idx < 0) return text.slice(0, width)
  const start = Math.max(0, idx - Math.floor(width / 3))
  return `${start > 0 ? '…' : ''}${text.slice(start, start + width)}${start + width < text.length ? '…' : ''}`
}

/**
 * Búsqueda corporativa fase 1 (§24): full-text sobre action items + ILIKE en
 * reuniones y decisiones. Siempre devuelve las reuniones fuente.
 */
export async function searchKnowledge(
  ctx: AppContext,
  principal: Principal,
  q: string,
  limit = 20,
): Promise<SearchResultDto> {
  const settings = await ctx.getSettings()
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now())
  const global = principal.role === UserRole.ADMIN || principal.role === UserRole.DIRECTOR
  const sourceMeetingIds = new Set<string>()

  const items = (await ctx.repos.actionItems.searchFullText(q, { openOnly: false, limit })).filter(
    (i) => canAccessActionItem(principal, i),
  )
  const actionItems = items.map((i) => {
    if (i.createdFromMeetingId) sourceMeetingIds.add(i.createdFromMeetingId)
    if (i.latestMeetingId) sourceMeetingIds.add(i.latestMeetingId)
    return {
      id: i.id,
      externalKey: i.externalKey,
      title: i.title,
      status: i.status,
      ownerName: i.ownerUserId
        ? (lk.users.get(i.ownerUserId)?.displayName ?? null)
        : i.ownerTextOriginal,
      snippet: snippet(`${i.title}. ${i.description ?? ''}`, q),
    }
  })

  const meetingsPage = await ctx.repos.meetings.list({ search: q }, { page: 1, pageSize: limit })
  const meetings = []
  for (const m of meetingsPage.items) {
    const participants = await ctx.repos.meetings.listParticipants(m.id)
    if (
      !global &&
      !canAccessMeeting(principal, {
        ...m,
        participantUserIds: participants
          .map((p) => p.internalUserId)
          .filter((x): x is string => x !== null),
      })
    )
      continue
    const summary = await ctx.repos.summaries.findLatestByMeeting(m.id)
    sourceMeetingIds.add(m.id)
    meetings.push({
      id: m.id,
      title: m.title,
      startAt: m.startAt.toISOString(),
      snippet: snippet(summary?.executiveSummary.join(' ') ?? m.title, q),
    })
  }

  const decisions = []
  const nq = normalizeText(q)
  const tokens = nq.split(' ').filter((t) => t.length > 2)
  const candidates = [...meetingsPage.items, ...(await ctx.repos.meetings.listRecent(100))]
  const seen = new Set<string>()
  for (const m of candidates) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const participants = await ctx.repos.meetings.listParticipants(m.id)
    if (
      !global &&
      !canAccessMeeting(principal, {
        ...m,
        participantUserIds: participants
          .map((p) => p.internalUserId)
          .filter((x): x is string => x !== null),
      })
    )
      continue
    for (const d of await ctx.repos.decisions.listByMeeting(m.id)) {
      const nd = normalizeText(d.description)
      if (tokens.length > 0 && tokens.some((t) => nd.includes(t))) {
        sourceMeetingIds.add(m.id)
        decisions.push({
          id: d.id,
          meetingId: m.id,
          meetingTitle: m.title,
          description: d.description,
        })
        if (decisions.length >= limit) break
      }
    }
    if (decisions.length >= limit) break
  }
  return { query: q, meetings, actionItems, decisions, sourceMeetingIds: [...sourceMeetingIds] }
}
