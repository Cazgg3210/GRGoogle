import type { AiReviewItem, AiReviewRepository, Id } from '@smlxl/domain'
import { reviewItemToDb, toReviewItem } from '../mappers/action-items.js'
import { BaseRepository } from './base.js'

export class PrismaAiReviewRepository extends BaseRepository implements AiReviewRepository {
  async findById(id: Id): Promise<AiReviewItem | null> {
    const row = await this.db.aiReviewItem.findUnique({ where: { id } })
    return row ? toReviewItem(row, this.ctx) : null
  }

  async listPending(filter: { meetingId?: Id; limit?: number } = {}): Promise<AiReviewItem[]> {
    const rows = await this.db.aiReviewItem.findMany({
      where: { status: 'PENDING', ...(filter.meetingId ? { meetingId: filter.meetingId } : {}) },
      orderBy: { createdAt: 'asc' },
      ...(filter.limit ? { take: filter.limit } : {}),
    })
    return rows.map((r) => toReviewItem(r, this.ctx))
  }

  async listByMeeting(meetingId: Id): Promise<AiReviewItem[]> {
    const rows = await this.db.aiReviewItem.findMany({ where: { meetingId }, orderBy: { createdAt: 'asc' } })
    return rows.map((r) => toReviewItem(r, this.ctx))
  }

  async save(item: AiReviewItem): Promise<AiReviewItem> {
    const { id, ...rest } = reviewItemToDb(item, this.ctx)
    const row = await this.db.aiReviewItem.upsert({
      where: { id: item.id },
      create: { id, ...rest },
      update: rest,
    })
    return toReviewItem(row, this.ctx)
  }

  async countPending(): Promise<number> {
    return this.db.aiReviewItem.count({ where: { status: 'PENDING' } })
  }
}
