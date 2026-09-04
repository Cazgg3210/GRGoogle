import type { ExternalAssignee, ExternalAssigneeRepository, Id } from '@smlxl/domain'
import { externalAssigneeToDb, toExternalAssignee } from '../mappers/catalogs.js'
import { BaseRepository } from './base.js'

export class PrismaExternalAssigneeRepository
  extends BaseRepository
  implements ExternalAssigneeRepository
{
  async findById(id: Id): Promise<ExternalAssignee | null> {
    const row = await this.db.externalAssignee.findUnique({ where: { id } })
    return row ? toExternalAssignee(row) : null
  }

  async findByNormalizedName(nameNormalized: string): Promise<ExternalAssignee | null> {
    const row = await this.db.externalAssignee.findUnique({ where: { nameNormalized } })
    return row ? toExternalAssignee(row) : null
  }

  async list(): Promise<ExternalAssignee[]> {
    const rows = await this.db.externalAssignee.findMany({ orderBy: { displayName: 'asc' } })
    return rows.map(toExternalAssignee)
  }

  async save(assignee: ExternalAssignee): Promise<ExternalAssignee> {
    const { id, ...rest } = externalAssigneeToDb(assignee)
    const row = await this.db.externalAssignee.upsert({
      where: { id: assignee.id },
      create: { id, ...rest },
      update: rest,
    })
    return toExternalAssignee(row)
  }
}
