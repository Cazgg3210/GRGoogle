import type { CompletionProposal, CompletionProposalRepository, Id } from '@smlxl/domain'
import { proposalToDb, toProposal } from '../mappers/action-items.js'
import { BaseRepository } from './base.js'

export class PrismaCompletionProposalRepository extends BaseRepository implements CompletionProposalRepository {
  async findById(id: Id): Promise<CompletionProposal | null> {
    const row = await this.db.completionProposal.findUnique({ where: { id } })
    return row ? toProposal(row) : null
  }

  async findPendingByActionItem(actionItemId: Id): Promise<CompletionProposal | null> {
    const row = await this.db.completionProposal.findFirst({
      where: { actionItemId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })
    return row ? toProposal(row) : null
  }

  async listPending(filter: { actionItemIds?: Id[]; limit?: number } = {}): Promise<CompletionProposal[]> {
    const rows = await this.db.completionProposal.findMany({
      where: {
        status: 'PENDING',
        ...(filter.actionItemIds && filter.actionItemIds.length > 0
          ? { actionItemId: { in: filter.actionItemIds } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      ...(filter.limit ? { take: filter.limit } : {}),
    })
    return rows.map(toProposal)
  }

  async save(proposal: CompletionProposal): Promise<CompletionProposal> {
    const { id, ...rest } = proposalToDb(proposal)
    const row = await this.db.completionProposal.upsert({
      where: { id: proposal.id },
      create: { id, ...rest },
      update: rest,
    })
    return toProposal(row)
  }

  async expireOlderThan(date: Date): Promise<number> {
    const result = await this.db.completionProposal.updateMany({
      where: { status: 'PENDING', createdAt: { lt: date } },
      data: { status: 'EXPIRED', reviewedAt: new Date() },
    })
    return result.count
  }
}
