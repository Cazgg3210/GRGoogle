import type { Decision, DecisionRepository, Id } from '@smlxl/domain'
import { decisionToDb, toDecision } from '../mappers/meetings.js'
import { BaseRepository } from './base.js'

export class PrismaDecisionRepository extends BaseRepository implements DecisionRepository {
  async listByMeeting(meetingId: Id): Promise<Decision[]> {
    const rows = await this.db.decision.findMany({ where: { meetingId }, orderBy: { createdAt: 'asc' } })
    return rows.map((r) => toDecision(r, this.ctx))
  }

  async saveMany(decisions: Decision[]): Promise<void> {
    for (const d of decisions) await this.save(d)
  }

  async save(decision: Decision): Promise<Decision> {
    const { id, ...rest } = decisionToDb(decision, this.ctx)
    const row = await this.db.decision.upsert({
      where: { id: decision.id },
      create: { id, ...rest },
      update: rest,
    })
    return toDecision(row, this.ctx)
  }

  async findById(id: Id): Promise<Decision | null> {
    const row = await this.db.decision.findUnique({ where: { id } })
    return row ? toDecision(row, this.ctx) : null
  }
}
