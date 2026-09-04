import type { Id, User, UserAlias, UserRepository } from '@smlxl/domain'
import { toUser, toUserAlias, userToDb } from '../mappers/catalogs.js'
import { BaseRepository } from './base.js'

export class PrismaUserRepository extends BaseRepository implements UserRepository {
  async findById(id: Id): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } })
    return row ? toUser(row) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    return row ? toUser(row) : null
  }

  async findByGoogleUserId(googleUserId: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { googleUserId } })
    return row ? toUser(row) : null
  }

  async list(filter: { active?: boolean; monitored?: boolean; areaId?: Id } = {}): Promise<User[]> {
    const rows = await this.db.user.findMany({
      where: {
        ...(filter.active !== undefined ? { active: filter.active } : {}),
        ...(filter.monitored !== undefined ? { monitored: filter.monitored } : {}),
        ...(filter.areaId ? { areaId: filter.areaId } : {}),
      },
      orderBy: [{ displayName: 'asc' }],
    })
    return rows.map(toUser)
  }

  async save(user: User): Promise<User> {
    const data = userToDb(user)
    const { id, ...rest } = data
    const row = await this.db.user.upsert({
      where: { id: user.id },
      create: { id, ...rest },
      update: rest,
    })
    return toUser(row)
  }

  async listAliases(): Promise<UserAlias[]> {
    const rows = await this.db.userAlias.findMany({ orderBy: { aliasNormalized: 'asc' } })
    return rows.map(toUserAlias)
  }

  async addAlias(alias: Omit<UserAlias, 'id'>): Promise<UserAlias> {
    const row = await this.db.userAlias.upsert({
      where: { aliasNormalized: alias.aliasNormalized },
      create: {
        userId: alias.userId,
        aliasNormalized: alias.aliasNormalized,
        source: alias.source,
      },
      update: { userId: alias.userId, source: alias.source },
    })
    return toUserAlias(row)
  }

  async listTeamUserIds(managerId: Id): Promise<Id[]> {
    const rows = await this.db.user.findMany({
      where: { managerId, active: true },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }
}
