import {
  DEFAULT_COMPANY_TIMEZONE,
  type Id,
  type WeeklyDigest,
  type WeeklyDigestConfig,
  type WeeklyDigestRepository,
} from '@smlxl/domain'
import { digestConfigToDb, digestToDb, toDigest, toDigestConfig } from '../mappers/system.js'
import { BaseRepository } from './base.js'

export class PrismaWeeklyDigestRepository extends BaseRepository implements WeeklyDigestRepository {
  /** Si no hay configuración, crea la inicial (§18.2: viernes 18:00, todas las áreas). */
  async getConfig(): Promise<WeeklyDigestConfig> {
    const existing = await this.db.weeklyDigestConfig.findFirst({ orderBy: { updatedAt: 'desc' } })
    if (existing) return toDigestConfig(existing)
    const created = await this.db.weeklyDigestConfig.create({
      data: {
        enabled: true,
        timezone: this.defaults.companyTimezone || DEFAULT_COMPANY_TIMEZONE,
        dayOfWeek: 5,
        localTime: '18:00',
        recipientUserIds: [],
        includeAreaIds: [],
        includeAllAreas: true,
        includeExternalTasks: true,
        attachSpreadsheet: false,
        sendEmail: true,
      },
    })
    return toDigestConfig(created)
  }

  async saveConfig(config: WeeklyDigestConfig): Promise<WeeklyDigestConfig> {
    const { id, ...rest } = digestConfigToDb(config)
    const row = await this.db.weeklyDigestConfig.upsert({
      where: { id: config.id },
      create: { id, ...rest },
      update: rest,
    })
    return toDigestConfig(row)
  }

  async findById(id: Id): Promise<WeeklyDigest | null> {
    const row = await this.db.weeklyDigest.findUnique({ where: { id } })
    return row ? toDigest(row) : null
  }

  async findByWeek(
    weekStart: Date,
    audience: WeeklyDigest['audience'],
  ): Promise<WeeklyDigest | null> {
    const row = await this.db.weeklyDigest.findFirst({
      where: { weekStart, audience },
      orderBy: { version: 'desc' },
    })
    return row ? toDigest(row) : null
  }

  async list(limit: number): Promise<WeeklyDigest[]> {
    const rows = await this.db.weeklyDigest.findMany({
      orderBy: [{ weekStart: 'desc' }, { version: 'desc' }],
      take: limit,
    })
    return rows.map(toDigest)
  }

  async save(digest: WeeklyDigest): Promise<WeeklyDigest> {
    const { id, ...rest } = digestToDb(digest)
    const row = await this.db.weeklyDigest.upsert({
      where: { id: digest.id },
      create: { id, ...rest },
      update: rest,
    })
    return toDigest(row)
  }
}
