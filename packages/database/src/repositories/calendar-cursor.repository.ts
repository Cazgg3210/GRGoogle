import type { CalendarSyncCursor, CalendarSyncCursorRepository, Id } from '@smlxl/domain'
import { cursorToDb, toCursor } from '../mappers/system.js'
import { BaseRepository } from './base.js'

export class PrismaCalendarSyncCursorRepository
  extends BaseRepository
  implements CalendarSyncCursorRepository
{
  async find(userId: Id, calendarId: string): Promise<CalendarSyncCursor | null> {
    const row = await this.db.calendarSyncCursor.findUnique({
      where: { userId_calendarId: { userId, calendarId } },
    })
    return row ? toCursor(row) : null
  }

  /** Un cursor por (usuario, calendario): upsert por la clave compuesta. */
  async save(cursor: CalendarSyncCursor): Promise<CalendarSyncCursor> {
    const { id, ...rest } = cursorToDb(cursor)
    const row = await this.db.calendarSyncCursor.upsert({
      where: { userId_calendarId: { userId: cursor.userId, calendarId: cursor.calendarId } },
      create: { id, ...rest },
      update: rest,
    })
    return toCursor(row)
  }

  async list(): Promise<CalendarSyncCursor[]> {
    const rows = await this.db.calendarSyncCursor.findMany({
      orderBy: [{ userId: 'asc' }, { calendarId: 'asc' }],
    })
    return rows.map(toCursor)
  }
}
