import {
  MeetingProcessingStatus,
  type Id,
  type Meeting,
  type MeetingFilter,
  type MeetingParticipant,
  type MeetingRepository,
  type Page,
  type PageRequest,
} from '@smlxl/domain'
import type { Prisma } from '../generated/client/index.js'
import { meetingToDb, participantToDb, toMeeting, toParticipant } from '../mappers/meetings.js'
import { BaseRepository, pageSkip } from './base.js'

/** Estados que cuentan como "procesada" para el filtro `processed` (§20.6). */
const PROCESSED_STATUSES: MeetingProcessingStatus[] = [
  MeetingProcessingStatus.ANALYZED,
  MeetingProcessingStatus.REVIEW_REQUIRED,
  MeetingProcessingStatus.COMPLETED,
]

export class PrismaMeetingRepository extends BaseRepository implements MeetingRepository {
  async findById(id: Id): Promise<Meeting | null> {
    const row = await this.db.meeting.findUnique({ where: { id } })
    return row ? toMeeting(row) : null
  }

  async findByConferenceRecordId(name: string): Promise<Meeting | null> {
    const row = await this.db.meeting.findUnique({ where: { googleConferenceRecordId: name } })
    return row ? toMeeting(row) : null
  }

  async findByMeetingCode(meetingCode: string): Promise<Meeting[]> {
    const rows = await this.db.meeting.findMany({
      where: { googleMeetingCode: meetingCode },
      orderBy: { startAt: 'desc' },
    })
    return rows.map(toMeeting)
  }

  async findByCalendarEventId(calendarEventId: string): Promise<Meeting | null> {
    const row = await this.db.meeting.findUnique({ where: { googleCalendarEventId: calendarEventId } })
    return row ? toMeeting(row) : null
  }

  /**
   * `visibleToUserId`: organizador o participante con `internalUserId`. El
   * alcance por área/equipo de MANAGER lo resuelve la capa de aplicación con
   * `canAccessMeeting`; aquí sólo se aplica el filtro de participación directa.
   */
  private buildWhere(filter: MeetingFilter): Prisma.MeetingWhereInput {
    const and: Prisma.MeetingWhereInput[] = []
    if (filter.from) and.push({ startAt: { gte: filter.from } })
    if (filter.to) and.push({ startAt: { lte: filter.to } })
    if (filter.organizerUserId) and.push({ organizerUserId: filter.organizerUserId })
    if (filter.areaId) and.push({ areaId: filter.areaId })
    if (filter.participantUserId)
      and.push({ participants: { some: { internalUserId: filter.participantUserId } } })
    if (filter.processed !== undefined)
      and.push(
        filter.processed
          ? { processingStatus: { in: PROCESSED_STATUSES } }
          : { processingStatus: { notIn: PROCESSED_STATUSES } },
      )
    if (filter.withActionItems !== undefined) {
      const hasItems: Prisma.MeetingWhereInput = {
        OR: [{ actionItemLinks: { some: {} } }, { createdItems: { some: {} } }],
      }
      and.push(filter.withActionItems ? hasItems : { NOT: hasItems })
    }
    if (filter.confidentialityLevel) and.push({ confidentialityLevel: filter.confidentialityLevel })
    if (filter.processingStatus) and.push({ processingStatus: filter.processingStatus })
    if (filter.search && filter.search.trim() !== '')
      and.push({ title: { contains: filter.search.trim(), mode: 'insensitive' } })
    if (filter.visibleToUserId)
      and.push({
        OR: [
          { organizerUserId: filter.visibleToUserId },
          { participants: { some: { internalUserId: filter.visibleToUserId } } },
        ],
      })
    return and.length ? { AND: and } : {}
  }

  async list(filter: MeetingFilter, page: PageRequest): Promise<Page<Meeting>> {
    const where = this.buildWhere(filter)
    const { skip, take } = pageSkip(page)
    const [rows, total] = await Promise.all([
      this.db.meeting.findMany({ where, orderBy: { startAt: 'desc' }, skip, take }),
      this.db.meeting.count({ where }),
    ])
    return { items: rows.map(toMeeting), total, page: Math.max(1, page.page), pageSize: take }
  }

  async listRecent(limit: number): Promise<Meeting[]> {
    const rows = await this.db.meeting.findMany({ orderBy: { startAt: 'desc' }, take: limit })
    return rows.map(toMeeting)
  }

  async listByStatus(status: MeetingProcessingStatus, limit: number): Promise<Meeting[]> {
    const rows = await this.db.meeting.findMany({
      where: { processingStatus: status },
      orderBy: { startAt: 'asc' },
      take: limit,
    })
    return rows.map(toMeeting)
  }

  async save(meeting: Meeting): Promise<Meeting> {
    const { id, ...rest } = meetingToDb(meeting)
    const row = await this.db.meeting.upsert({
      where: { id: meeting.id },
      create: { id, ...rest },
      update: rest,
    })
    return toMeeting(row)
  }

  async updateProcessing(
    id: Id,
    patch: Partial<
      Pick<
        Meeting,
        | 'processingStatus'
        | 'transcriptStatus'
        | 'smartNotesStatus'
        | 'aiAnalysisStatus'
        | 'lastErrorCode'
        | 'lastErrorAt'
        | 'detectedLanguageCode'
        | 'mixedLanguageDetected'
        | 'status'
        | 'endAt'
        | 'durationSeconds'
        | 'googleConferenceRecordId'
      >
    >,
  ): Promise<Meeting> {
    const data: Prisma.MeetingUncheckedUpdateInput = {}
    if (patch.processingStatus !== undefined) data.processingStatus = patch.processingStatus
    if (patch.transcriptStatus !== undefined) data.transcriptStatus = patch.transcriptStatus
    if (patch.smartNotesStatus !== undefined) data.smartNotesStatus = patch.smartNotesStatus
    if (patch.aiAnalysisStatus !== undefined) data.aiAnalysisStatus = patch.aiAnalysisStatus
    if (patch.lastErrorCode !== undefined) data.lastErrorCode = patch.lastErrorCode
    if (patch.lastErrorAt !== undefined) data.lastErrorAt = patch.lastErrorAt
    if (patch.detectedLanguageCode !== undefined) data.detectedLanguageCode = patch.detectedLanguageCode
    if (patch.mixedLanguageDetected !== undefined) data.mixedLanguageDetected = patch.mixedLanguageDetected
    if (patch.status !== undefined) data.status = patch.status
    if (patch.endAt !== undefined) data.endAt = patch.endAt
    if (patch.durationSeconds !== undefined) data.durationSeconds = patch.durationSeconds
    if (patch.googleConferenceRecordId !== undefined)
      data.googleConferenceRecordId = patch.googleConferenceRecordId
    const row = await this.db.meeting.update({ where: { id }, data })
    return toMeeting(row)
  }

  async listParticipants(meetingId: Id): Promise<MeetingParticipant[]> {
    const rows = await this.db.meetingParticipant.findMany({
      where: { meetingId },
      orderBy: [{ isInternal: 'desc' }, { displayName: 'asc' }],
    })
    return rows.map(toParticipant)
  }

  async replaceParticipants(meetingId: Id, participants: MeetingParticipant[]): Promise<void> {
    await this.db.meetingParticipant.deleteMany({ where: { meetingId } })
    if (participants.length === 0) return
    await this.db.meetingParticipant.createMany({
      data: participants.map((p) => participantToDb({ ...p, meetingId })),
    })
  }

  /** Tareas creadas en la reunión o vinculadas a ella (sin duplicar). */
  async countActionItems(meetingId: Id): Promise<number> {
    return this.db.actionItem.count({
      where: {
        OR: [{ createdFromMeetingId: meetingId }, { meetingLinks: { some: { meetingId } } }],
      },
    })
  }
}
