import type { CalendarEventSummary, CalendarPort } from '@smlxl/domain'
import { loadDefaultFixtures, type FakeGoogleFixtures, type FixtureCalendarEvent, type NowFn } from './fixtures.js'

export interface FakeCalendarOptions {
  fixtures?: FakeGoogleFixtures
  now?: NowFn
}

/**
 * Fake de Calendar: primera sincronización devuelve todos los eventos del usuario;
 * las incrementales sólo los eventos agregados después (`addEvent`). Simula
 * `fullSyncRequired` cuando el token fue invalidado con `invalidateToken`.
 */
export class FakeCalendarAdapter implements CalendarPort {
  readonly fixtures: FakeGoogleFixtures
  readonly now: NowFn
  private tokenSeq = 0
  /** token → versión de eventos entregada */
  private readonly tokens = new Map<string, number>()
  private version = 0
  private readonly versionOf = new Map<string, number>()
  private readonly invalidTokens = new Set<string>()

  constructor(options: FakeCalendarOptions = {}) {
    this.fixtures = options.fixtures ?? loadDefaultFixtures()
    this.now = options.now ?? (() => new Date())
    for (const e of this.fixtures.calendarEvents) this.versionOf.set(e.calendarEventId, 0)
  }

  /** Agrega un evento nuevo que sólo aparecerá en sync incrementales posteriores. */
  addEvent(event: FixtureCalendarEvent): void {
    this.version += 1
    this.fixtures.calendarEvents.push(event)
    this.versionOf.set(event.calendarEventId, this.version)
  }

  invalidateToken(token: string): void {
    this.invalidTokens.add(token)
  }

  mapEvent(e: FixtureCalendarEvent): CalendarEventSummary {
    const startAt = new Date(this.now().getTime() + e.startOffsetMinutes * 60_000)
    return {
      calendarEventId: e.calendarEventId,
      iCalUid: `${e.calendarEventId}@fake.google.com`,
      title: e.title,
      description: null,
      organizerEmail: e.organizerEmail.toLowerCase(),
      creatorEmail: e.organizerEmail.toLowerCase(),
      attendees: e.attendees.map((a) => ({ email: a.toLowerCase(), responseStatus: 'accepted', isOrganizer: a.toLowerCase() === e.organizerEmail.toLowerCase() })),
      startAt,
      endAt: new Date(startAt.getTime() + e.durationMinutes * 60_000),
      timezone: 'America/Mexico_City',
      recurringEventId: e.recurringEventId,
      meetUri: e.meetingCode ? `https://meet.google.com/${e.meetingCode}` : null,
      meetingCode: e.meetingCode,
      status: e.status,
      updatedAt: this.now(),
    }
  }

  async syncEvents(input: {
    userEmail: string
    calendarId: string
    syncToken: string | null
    timeMin?: Date
    timeMax?: Date
  }): Promise<{ events: CalendarEventSummary[]; nextSyncToken: string | null; fullSyncRequired: boolean }> {
    if (input.syncToken && this.invalidTokens.has(input.syncToken)) {
      return { events: [], nextSyncToken: null, fullSyncRequired: true }
    }
    const sinceVersion = input.syncToken ? (this.tokens.get(input.syncToken) ?? -1) : -1
    const events = this.fixtures.calendarEvents
      .filter((e) => e.userEmail.toLowerCase() === input.userEmail.toLowerCase())
      .filter((e) => (this.versionOf.get(e.calendarEventId) ?? 0) > sinceVersion)
      .map((e) => this.mapEvent(e))
      .filter((e) => {
        if (input.syncToken) return true
        if (input.timeMin && e.startAt.getTime() < input.timeMin.getTime()) return false
        if (input.timeMax && e.startAt.getTime() > input.timeMax.getTime()) return false
        return true
      })
    this.tokenSeq += 1
    const nextSyncToken = `fake-sync-${input.userEmail}-${this.tokenSeq}`
    this.tokens.set(nextSyncToken, this.version)
    return { events, nextSyncToken, fullSyncRequired: false }
  }
}
