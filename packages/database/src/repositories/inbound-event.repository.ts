import type { InboundEventRepository, InboundGoogleEvent } from '@smlxl/domain'
import { Prisma } from '../generated/client/index.js'
import { inboundEventToDb, toInboundEvent } from '../mappers/system.js'
import { BaseRepository } from './base.js'

export class PrismaInboundEventRepository extends BaseRepository implements InboundEventRepository {
  async findByCloudEventId(cloudEventId: string): Promise<InboundGoogleEvent | null> {
    const row = await this.db.inboundGoogleEvent.findUnique({ where: { cloudEventId } })
    return row ? toInboundEvent(row) : null
  }

  /**
   * Idempotencia de webhooks (§13.5): intenta insertar; si el `cloudEventId`
   * ya existe (P2002) devuelve el registro existente con `created=false`.
   */
  async insertIfAbsent(event: InboundGoogleEvent): Promise<{ created: boolean; event: InboundGoogleEvent }> {
    // Camino rápido sin generar errores en el log; el catch cubre la carrera entre dos entregas simultáneas.
    const already = await this.db.inboundGoogleEvent.findUnique({ where: { cloudEventId: event.cloudEventId } })
    if (already) return { created: false, event: toInboundEvent(already) }
    try {
      const row = await this.db.inboundGoogleEvent.create({ data: inboundEventToDb(event) })
      return { created: true, event: toInboundEvent(row) }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.db.inboundGoogleEvent.findUnique({
          where: { cloudEventId: event.cloudEventId },
        })
        if (existing) return { created: false, event: toInboundEvent(existing) }
      }
      throw err
    }
  }

  async save(event: InboundGoogleEvent): Promise<InboundGoogleEvent> {
    const { id, ...rest } = inboundEventToDb(event)
    const row = await this.db.inboundGoogleEvent.upsert({
      where: { cloudEventId: event.cloudEventId },
      create: { id, ...rest },
      update: rest,
    })
    return toInboundEvent(row)
  }

  async listRecent(limit: number): Promise<InboundGoogleEvent[]> {
    const rows = await this.db.inboundGoogleEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: limit })
    return rows.map(toInboundEvent)
  }

  async listFailed(limit: number): Promise<InboundGoogleEvent[]> {
    const rows = await this.db.inboundGoogleEvent.findMany({
      where: { processingStatus: 'FAILED' },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    })
    return rows.map(toInboundEvent)
  }
}
