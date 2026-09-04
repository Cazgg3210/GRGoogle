import type { MeetingDetailDto, MeetingListItemDto, TranscriptSegmentDtoSchema } from '@smlxl/contracts'
import type { z } from 'zod'
import {
  DomainError,
  Permission,
  UserRole,
  canAccessMeeting,
  hasPermission,
  parseLocalDate,
  endOfDay,
  type Meeting,
  type MeetingFilter,
  type MeetingParticipant,
  type MeetingProcessingStatus,
  type Page,
  type Principal,
} from '@smlxl/domain'
import type { AppContext } from '../context.js'
import { paginate, requireMeeting } from '../shared.js'
import { loadLookups, toMeetingDetailDto, toMeetingListItemDto } from './mappers.js'

export interface ListMeetingsQuery {
  from?: string
  to?: string
  organizerUserId?: string
  areaId?: string
  participantUserId?: string
  processed?: boolean
  withActionItems?: boolean
  confidentiality?: Meeting['confidentialityLevel']
  processingStatus?: MeetingProcessingStatus
  search?: string
  page?: number
  pageSize?: number
}

function participantUserIds(participants: MeetingParticipant[]): string[] {
  return participants.map((p) => p.internalUserId).filter((x): x is string => x !== null)
}

export async function assertMeetingAccess(ctx: AppContext, principal: Principal, meeting: Meeting): Promise<MeetingParticipant[]> {
  const participants = await ctx.repos.meetings.listParticipants(meeting.id)
  if (!canAccessMeeting(principal, { ...meeting, participantUserIds: participantUserIds(participants) })) throw DomainError.forbidden('No tienes acceso a esta reunión')
  return participants
}

async function enrich(ctx: AppContext, meetings: Meeting[], principal: Principal | null): Promise<Array<{ meeting: Meeting; participants: MeetingParticipant[]; actionItemCount: number; pendingReviewCount: number; extractionConfidence: number | null } | null>> {
  const out = []
  for (const m of meetings) {
    const participants = await ctx.repos.meetings.listParticipants(m.id)
    if (principal && !canAccessMeeting(principal, { ...m, participantUserIds: participantUserIds(participants) })) {
      out.push(null)
      continue
    }
    const [actionItemCount, reviews] = await Promise.all([ctx.repos.meetings.countActionItems(m.id), ctx.repos.aiReview.listPending({ meetingId: m.id })])
    out.push({ meeting: m, participants, actionItemCount, pendingReviewCount: reviews.length, extractionConfidence: null })
  }
  return out
}

export async function listMeetings(ctx: AppContext, principal: Principal, q: ListMeetingsQuery = {}): Promise<Page<MeetingListItemDto>> {
  const settings = await ctx.getSettings()
  const tz = settings.companyTimezone
  const filter: MeetingFilter = {}
  if (q.from) filter.from = parseLocalDate(q.from, tz) ?? undefined
  if (q.to) {
    const d = parseLocalDate(q.to, tz)
    if (d) filter.to = endOfDay(d, tz)
  }
  if (q.organizerUserId) filter.organizerUserId = q.organizerUserId
  if (q.areaId) filter.areaId = q.areaId
  if (q.participantUserId) filter.participantUserId = q.participantUserId
  if (q.processed !== undefined) filter.processed = q.processed
  if (q.withActionItems !== undefined) filter.withActionItems = q.withActionItems
  if (q.confidentiality) filter.confidentialityLevel = q.confidentiality
  if (q.processingStatus) filter.processingStatus = q.processingStatus
  if (q.search) filter.search = q.search
  const global = principal.role === UserRole.ADMIN || principal.role === UserRole.DIRECTOR
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 25
  let meetings: Meeting[]
  let total: number
  if (global) {
    const p = await ctx.repos.meetings.list(filter, { page, pageSize })
    meetings = p.items
    total = p.total
  } else {
    // Alcance por participación/equipo: filtrado en memoria (MVP).
    const all = await ctx.repos.meetings.list(filter, { page: 1, pageSize: 1000 })
    const visible: Meeting[] = []
    for (const m of all.items) {
      const participants = await ctx.repos.meetings.listParticipants(m.id)
      if (canAccessMeeting(principal, { ...m, participantUserIds: participantUserIds(participants) })) visible.push(m)
    }
    const p = paginate(visible, page, pageSize)
    meetings = p.items
    total = p.total
  }
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now())
  const enriched = await enrich(ctx, meetings, global ? null : principal)
  const items = enriched.filter((e): e is NonNullable<typeof e> => e !== null).map((e) => toMeetingListItemDto(e.meeting, lk, e))
  return { items, total, page, pageSize }
}

export async function getMeetingDetail(ctx: AppContext, principal: Principal, id: string): Promise<MeetingDetailDto> {
  const meeting = requireMeeting(await ctx.repos.meetings.findById(id), id)
  const participants = await assertMeetingAccess(ctx, principal, meeting)
  const settings = await ctx.getSettings()
  const [summary, decisions, runs, actionItemCount, reviews] = await Promise.all([
    ctx.repos.summaries.findLatestByMeeting(id),
    ctx.repos.decisions.listByMeeting(id),
    ctx.repos.processingRuns.listByMeeting(id),
    ctx.repos.meetings.countActionItems(id),
    ctx.repos.aiReview.listPending({ meetingId: id }),
  ])
  const lk = await loadLookups(ctx.repos, settings, ctx.clock.now())
  return toMeetingDetailDto(meeting, lk, { participants, actionItemCount, pendingReviewCount: reviews.length, summary, decisions, runs, extractionConfidence: null })
}

export type TranscriptSegmentDto = z.infer<typeof TranscriptSegmentDtoSchema>

export async function getMeetingTranscript(ctx: AppContext, principal: Principal, id: string): Promise<{ transcripts: Array<{ id: string; sourceType: string; languageCode: string | null; segments: TranscriptSegmentDto[]; rawText?: string }> }> {
  if (!hasPermission(principal, Permission.MEETING_READ_TRANSCRIPT)) throw DomainError.forbidden('No tienes permiso para leer transcripciones')
  const meeting = requireMeeting(await ctx.repos.meetings.findById(id), id)
  await assertMeetingAccess(ctx, principal, meeting)
  const transcripts = await ctx.repos.transcripts.findByMeeting(id)
  const out = []
  for (const t of transcripts) {
    const segments = await ctx.repos.transcripts.listSegments(t.id)
    out.push({
      id: t.id,
      sourceType: t.sourceType,
      languageCode: t.languageCode,
      segments: segments.map((s) => ({ id: s.id, sequence: s.sequence, speakerLabel: s.speakerLabel, text: s.text, startAt: s.startAt?.toISOString() ?? null, endAt: s.endAt?.toISOString() ?? null, participantId: s.participantId })),
      ...(segments.length === 0 ? { rawText: t.rawText } : {}),
    })
  }
  return { transcripts: out }
}
