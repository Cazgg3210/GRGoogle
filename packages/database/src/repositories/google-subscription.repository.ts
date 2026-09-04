import type { GoogleSubscriptionRepository, GoogleWorkspaceSubscription, Id } from '@smlxl/domain'
import { subscriptionToDb, toSubscription } from '../mappers/system.js'
import { BaseRepository } from './base.js'

export class PrismaGoogleSubscriptionRepository extends BaseRepository implements GoogleSubscriptionRepository {
  async findByUser(userId: Id): Promise<GoogleWorkspaceSubscription | null> {
    const row = await this.db.googleWorkspaceSubscription.findUnique({ where: { monitoredUserId: userId } })
    return row ? toSubscription(row) : null
  }

  async list(): Promise<GoogleWorkspaceSubscription[]> {
    const rows = await this.db.googleWorkspaceSubscription.findMany({ orderBy: { monitoredUserEmail: 'asc' } })
    return rows.map(toSubscription)
  }

  async listExpiringBefore(date: Date): Promise<GoogleWorkspaceSubscription[]> {
    const rows = await this.db.googleWorkspaceSubscription.findMany({
      where: { expiresAt: { lt: date }, state: { in: ['ACTIVE', 'SUSPENDED', 'ERROR'] } },
      orderBy: { expiresAt: 'asc' },
    })
    return rows.map(toSubscription)
  }

  /** Una suscripción por usuario monitoreado: upsert por `monitoredUserId`. */
  async save(sub: GoogleWorkspaceSubscription): Promise<GoogleWorkspaceSubscription> {
    const { id, ...rest } = subscriptionToDb(sub)
    const row = await this.db.googleWorkspaceSubscription.upsert({
      where: { monitoredUserId: sub.monitoredUserId },
      create: { id, ...rest },
      update: rest,
    })
    return toSubscription(row)
  }
}
