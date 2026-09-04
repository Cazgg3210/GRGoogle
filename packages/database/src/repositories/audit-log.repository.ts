import type { AuditLogEntry, AuditLogRepository, Id, Page, PageRequest } from '@smlxl/domain'
import type { Prisma } from '../generated/client/index.js'
import { auditEntryToDb, toAuditEntry } from '../mappers/system.js'
import { BaseRepository, pageSkip } from './base.js'

export class PrismaAuditLogRepository extends BaseRepository implements AuditLogRepository {
  /**
   * `before`/`after` se copian a JSON de forma segura (fechas → ISO, ciclos →
   * marcador). Un problema de serialización nunca impide registrar la entrada.
   */
  async append(entry: AuditLogEntry): Promise<void> {
    const data = auditEntryToDb(entry)
    await this.db.auditLog.create({ data })
  }

  async list(
    filter: { entity?: string; entityId?: Id; actorUserId?: Id; from?: Date; to?: Date },
    page: PageRequest,
  ): Promise<Page<AuditLogEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
      ...(filter.from || filter.to
        ? {
            timestamp: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    }
    const { skip, take } = pageSkip(page)
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, skip, take }),
      this.db.auditLog.count({ where }),
    ])
    return { items: rows.map(toAuditEntry), total, page: Math.max(1, page.page), pageSize: take }
  }
}
