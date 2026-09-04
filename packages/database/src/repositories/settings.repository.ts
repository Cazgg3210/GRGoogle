import type { Id, PlatformSettings, SettingsRepository } from '@smlxl/domain'
import { platformSettingsToDb, toPlatformSettings } from '../mappers/system.js'
import { BaseRepository } from './base.js'

export const SETTINGS_ROW_ID = 'default'

/**
 * Configuración de plataforma: fila única `default`. Los defaults vienen del
 * entorno (flags §51, zona horaria, dominio) y la BD guarda overrides que se
 * mezclan encima campo a campo.
 */
export class PrismaSettingsRepository extends BaseRepository implements SettingsRepository {
  async get(): Promise<PlatformSettings> {
    const row = await this.db.platformSetting.findUnique({ where: { id: SETTINGS_ROW_ID } })
    return toPlatformSettings(row, this.defaults)
  }

  async save(settings: PlatformSettings, updatedByUserId: Id | null): Promise<PlatformSettings> {
    const data = platformSettingsToDb(settings, updatedByUserId)
    const row = await this.db.platformSetting.upsert({
      where: { id: SETTINGS_ROW_ID },
      create: { id: SETTINGS_ROW_ID, ...data },
      update: data,
    })
    return toPlatformSettings(row, this.defaults)
  }
}
