import type { Id, ProcessingRun, ProcessingRunRepository } from '@smlxl/domain'
import { processingRunToDb, toProcessingRun } from '../mappers/meetings.js'
import { BaseRepository } from './base.js'

export class PrismaProcessingRunRepository
  extends BaseRepository
  implements ProcessingRunRepository
{
  async findById(id: Id): Promise<ProcessingRun | null> {
    const row = await this.db.processingRun.findUnique({ where: { id } })
    return row ? toProcessingRun(row) : null
  }

  async listByMeeting(meetingId: Id): Promise<ProcessingRun[]> {
    const rows = await this.db.processingRun.findMany({
      where: { meetingId },
      orderBy: { startedAt: 'desc' },
    })
    return rows.map(toProcessingRun)
  }

  async save(run: ProcessingRun): Promise<ProcessingRun> {
    const { id, ...rest } = processingRunToDb(run)
    const row = await this.db.processingRun.upsert({
      where: { id: run.id },
      create: { id, ...rest },
      update: rest,
    })
    return toProcessingRun(row)
  }

  /** Consumo/costo IA en el periodo (§35). */
  async usageSummary(
    from: Date,
    to: Date,
  ): Promise<{
    runs: number
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    failures: number
  }> {
    const where = { startedAt: { gte: from, lte: to } }
    const [agg, failures] = await Promise.all([
      this.db.processingRun.aggregate({
        where,
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
      }),
      this.db.processingRun.count({ where: { ...where, success: false } }),
    ])
    return {
      runs: agg._count._all,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      estimatedCostUsd: agg._sum.estimatedCostUsd ?? 0,
      failures,
    }
  }
}
