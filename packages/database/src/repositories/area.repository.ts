import type { Area, AreaRepository, Id } from '@smlxl/domain'
import { areaToDb, toArea } from '../mappers/catalogs.js'
import { BaseRepository } from './base.js'

export class PrismaAreaRepository extends BaseRepository implements AreaRepository {
  async findById(id: Id): Promise<Area | null> {
    const row = await this.db.area.findUnique({ where: { id } })
    return row ? toArea(row) : null
  }

  async findByName(name: string): Promise<Area | null> {
    // Búsqueda exacta y, como respaldo, insensible a mayúsculas.
    const exact = await this.db.area.findUnique({ where: { name } })
    if (exact) return toArea(exact)
    const loose = await this.db.area.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    })
    return loose ? toArea(loose) : null
  }

  async list(activeOnly = false): Promise<Area[]> {
    const rows = await this.db.area.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return rows.map(toArea)
  }

  async save(area: Area): Promise<Area> {
    const { id, ...rest } = areaToDb(area)
    const row = await this.db.area.upsert({ where: { id: area.id }, create: { id, ...rest }, update: rest })
    return toArea(row)
  }
}
