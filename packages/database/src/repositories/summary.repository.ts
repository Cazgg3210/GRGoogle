import type { Id, MeetingSummary, SummaryRepository } from '@smlxl/domain'
import { summaryToDb, toSummary } from '../mappers/meetings.js'
import { BaseRepository } from './base.js'

export class PrismaSummaryRepository extends BaseRepository implements SummaryRepository {
  async findLatestByMeeting(meetingId: Id): Promise<MeetingSummary | null> {
    const row = await this.db.meetingSummary.findFirst({
      where: { meetingId },
      orderBy: { generatedAt: 'desc' },
    })
    return row ? toSummary(row) : null
  }

  async listByMeeting(meetingId: Id): Promise<MeetingSummary[]> {
    const rows = await this.db.meetingSummary.findMany({
      where: { meetingId },
      orderBy: { generatedAt: 'desc' },
    })
    return rows.map(toSummary)
  }

  async save(summary: MeetingSummary): Promise<MeetingSummary> {
    const { id, ...rest } = summaryToDb(summary)
    const row = await this.db.meetingSummary.upsert({
      where: { id: summary.id },
      create: { id, ...rest },
      update: rest,
    })
    return toSummary(row)
  }
}
