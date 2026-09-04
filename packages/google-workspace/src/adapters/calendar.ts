import { google, type calendar_v3 } from 'googleapis'
import type { CalendarEventSummary, CalendarPort } from '@smlxl/domain'
import { GOOGLE_SCOPES } from '../scopes.js'
import { httpStatusOf, mapGoogleError, withGoogleRetry } from '../http/retry.js'
import { toDate, type AuthClient, type GoogleAdapterDeps } from './shared.js'

/**
 * Google Calendar v3 (§14): sync incremental por usuario con `syncToken`.
 * 410 (token expirado) → `fullSyncRequired=true`; el caso de uso reinicia con ventana.
 */
export interface CalendarApiClient {
  events: {
    list(
      params: calendar_v3.Params$Resource$Events$List,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: calendar_v3.Schema$Events }>
  }
}

const SCOPES = [GOOGLE_SCOPES.calendar.EVENTS_READONLY]
const MEETING_CODE_RE = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i

/** Extrae el meetingCode `xxx-xxxx-xxx` de un Meet URI. */
export function extractMeetingCode(uri: string | null | undefined): string | null {
  if (!uri) return null
  const m = MEETING_CODE_RE.exec(uri)
  return m?.[1]?.toLowerCase() ?? null
}

export function mapCalendarEvent(e: calendar_v3.Schema$Event): CalendarEventSummary | null {
  if (!e.id) return null
  const videoEntry = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')
  const meetUri = videoEntry?.uri ?? e.hangoutLink ?? null
  const meetingCode = videoEntry?.meetingCode?.toLowerCase() ?? extractMeetingCode(meetUri)
  const startAt =
    toDate(e.start?.dateTime) ?? (e.start?.date ? new Date(`${e.start.date}T00:00:00Z`) : null)
  const endAt =
    toDate(e.end?.dateTime) ?? (e.end?.date ? new Date(`${e.end.date}T00:00:00Z`) : null)
  const status: CalendarEventSummary['status'] =
    e.status === 'cancelled' ? 'cancelled' : e.status === 'tentative' ? 'tentative' : 'confirmed'
  const attendees = (e.attendees ?? [])
    .filter((a) => typeof a.email === 'string' && a.email.length > 0)
    .map((a) => ({
      email: (a.email as string).toLowerCase(),
      responseStatus: a.responseStatus ?? null,
      isOrganizer: a.organizer === true,
    }))
  return {
    calendarEventId: e.id,
    iCalUid: e.iCalUID ?? null,
    title: e.summary ?? '(sin título)',
    description: e.description ?? null,
    organizerEmail: e.organizer?.email?.toLowerCase() ?? null,
    creatorEmail: e.creator?.email?.toLowerCase() ?? null,
    attendees,
    // Eventos cancelados vienen sin start; usamos época 0 como marcador.
    startAt: startAt ?? new Date(0),
    endAt,
    timezone: e.start?.timeZone ?? null,
    recurringEventId: e.recurringEventId ?? null,
    meetUri: meetUri ? (meetingCode ? `https://meet.google.com/${meetingCode}` : meetUri) : null,
    meetingCode,
    status,
    updatedAt: toDate(e.updated) ?? new Date(0),
  }
}

export interface CalendarAdapterDeps extends GoogleAdapterDeps {
  clientFactory?: (auth: AuthClient) => CalendarApiClient
}

export class GoogleCalendarAdapter implements CalendarPort {
  private readonly clientFactory: (auth: AuthClient) => CalendarApiClient

  constructor(private readonly deps: CalendarAdapterDeps) {
    this.clientFactory =
      deps.clientFactory ??
      ((auth) => google.calendar({ version: 'v3', auth }) as unknown as CalendarApiClient)
  }

  async syncEvents(input: {
    userEmail: string
    calendarId: string
    syncToken: string | null
    timeMin?: Date
    timeMax?: Date
  }): Promise<{
    events: CalendarEventSummary[]
    nextSyncToken: string | null
    fullSyncRequired: boolean
  }> {
    const client = this.clientFactory(this.deps.auth.for(input.userEmail, SCOPES))
    const events: CalendarEventSummary[] = []
    let pageToken: string | undefined
    let nextSyncToken: string | null = null
    for (let page = 0; page < 100; page++) {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: input.calendarId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
      }
      if (input.syncToken) params.syncToken = input.syncToken
      else {
        if (input.timeMin) params.timeMin = input.timeMin.toISOString()
        if (input.timeMax) params.timeMax = input.timeMax.toISOString()
      }
      let data: calendar_v3.Schema$Events
      try {
        const res = await withGoogleRetry((signal) => client.events.list(params, { signal }), {
          ...this.deps.retry,
          operation: 'calendar.events.list',
        })
        data = res.data
      } catch (err) {
        const status =
          (err as { details?: { status?: number | null } }).details?.status ?? httpStatusOf(err)
        if (status === 410) return { events: [], nextSyncToken: null, fullSyncRequired: true }
        throw mapGoogleError(err, 'calendar.events.list')
      }
      for (const raw of data.items ?? []) {
        const mapped = mapCalendarEvent(raw)
        if (mapped) events.push(mapped)
      }
      if (data.nextPageToken) {
        pageToken = data.nextPageToken
        continue
      }
      nextSyncToken = data.nextSyncToken ?? null
      break
    }
    return { events, nextSyncToken, fullSyncRequired: false }
  }
}
