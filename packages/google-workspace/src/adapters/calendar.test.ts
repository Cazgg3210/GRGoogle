import { describe, expect, it } from 'vitest'
import type { calendar_v3 } from 'googleapis'
import { ImpersonatedAuthFactory } from '../auth/dwd.js'
import {
  GoogleCalendarAdapter,
  extractMeetingCode,
  mapCalendarEvent,
  type CalendarApiClient,
} from './calendar.js'

const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n'
const auth = new ImpersonatedAuthFactory({
  credentials: { client_email: 'sa@proj.iam.gserviceaccount.com', private_key: FAKE_KEY },
  allowedDomain: 'smlxl.mx',
})

function gone(): Error {
  const err = new Error('Sync token is no longer valid') as Error & { response: { status: number } }
  err.response = { status: 410 }
  return err
}

describe('extractMeetingCode / mapCalendarEvent', () => {
  it('extrae el meetingCode del hangoutLink', () => {
    expect(extractMeetingCode('https://meet.google.com/abc-defg-hij?authuser=0')).toBe(
      'abc-defg-hij',
    )
    expect(extractMeetingCode('https://zoom.us/j/123')).toBeNull()
  })

  it('mapea un evento con conferenceData', () => {
    const e: calendar_v3.Schema$Event = {
      id: 'evt1',
      summary: 'Reunión',
      status: 'confirmed',
      organizer: { email: 'Andres@SMLXL.mx' },
      attendees: [
        { email: 'lucia@smlxl.mx', responseStatus: 'accepted' },
        { email: 'ext@cliente.example', organizer: false },
      ],
      start: { dateTime: '2026-09-03T15:00:00-06:00', timeZone: 'America/Mexico_City' },
      end: { dateTime: '2026-09-03T16:00:00-06:00' },
      conferenceData: {
        entryPoints: [
          {
            entryPointType: 'video',
            uri: 'https://meet.google.com/xyz-abcd-efg',
            meetingCode: 'XYZ-ABCD-EFG',
          },
        ],
      },
      updated: '2026-09-01T00:00:00Z',
    }
    const m = mapCalendarEvent(e)
    expect(m?.meetingCode).toBe('xyz-abcd-efg')
    expect(m?.organizerEmail).toBe('andres@smlxl.mx')
    expect(m?.attendees).toHaveLength(2)
    expect(m?.startAt.toISOString()).toBe('2026-09-03T21:00:00.000Z')
    expect(m?.status).toBe('confirmed')
  })

  it('mapea cancelados sin start', () => {
    const m = mapCalendarEvent({ id: 'x', status: 'cancelled' })
    expect(m?.status).toBe('cancelled')
    expect(m?.meetingCode).toBeNull()
  })
})

describe('GoogleCalendarAdapter.syncEvents', () => {
  it('pagina y devuelve nextSyncToken', async () => {
    const calls: calendar_v3.Params$Resource$Events$List[] = []
    const client: CalendarApiClient = {
      events: {
        list: async (params) => {
          calls.push(params)
          if (!params.pageToken)
            return {
              data: {
                items: [
                  {
                    id: 'a',
                    hangoutLink: 'https://meet.google.com/abc-defg-hij',
                    start: { dateTime: '2026-09-03T10:00:00Z' },
                  },
                ],
                nextPageToken: 'p2',
              },
            }
          return { data: { items: [{ id: 'b', status: 'cancelled' }], nextSyncToken: 'tok-1' } }
        },
      },
    }
    const adapter = new GoogleCalendarAdapter({ auth, clientFactory: () => client })
    const res = await adapter.syncEvents({
      userEmail: 'andres@smlxl.mx',
      calendarId: 'primary',
      syncToken: null,
      timeMin: new Date('2026-08-01T00:00:00Z'),
    })
    expect(res.fullSyncRequired).toBe(false)
    expect(res.nextSyncToken).toBe('tok-1')
    expect(res.events.map((e) => e.calendarEventId)).toEqual(['a', 'b'])
    expect(res.events[0]?.meetingCode).toBe('abc-defg-hij')
    expect(calls[0]?.timeMin).toBe('2026-08-01T00:00:00.000Z')
    expect(calls[0]?.singleEvents).toBe(true)
  })

  it('devuelve fullSyncRequired en 410', async () => {
    const client: CalendarApiClient = {
      events: {
        list: async () => {
          throw gone()
        },
      },
    }
    const adapter = new GoogleCalendarAdapter({
      auth,
      clientFactory: () => client,
      retry: { retries: 0 },
    })
    const res = await adapter.syncEvents({
      userEmail: 'andres@smlxl.mx',
      calendarId: 'primary',
      syncToken: 'old',
    })
    expect(res.fullSyncRequired).toBe(true)
    expect(res.events).toEqual([])
  })

  it('usa syncToken sin timeMin/timeMax', async () => {
    let params: calendar_v3.Params$Resource$Events$List | null = null
    const client: CalendarApiClient = {
      events: {
        list: async (p) => {
          params = p
          return { data: { items: [], nextSyncToken: 'tok-2' } }
        },
      },
    }
    const adapter = new GoogleCalendarAdapter({ auth, clientFactory: () => client })
    await adapter.syncEvents({
      userEmail: 'andres@smlxl.mx',
      calendarId: 'primary',
      syncToken: 'tok-1',
      timeMin: new Date(),
    })
    expect(params).not.toBeNull()
    expect((params as unknown as calendar_v3.Params$Resource$Events$List).syncToken).toBe('tok-1')
    expect((params as unknown as calendar_v3.Params$Resource$Events$List).timeMin).toBeUndefined()
  })

  it('rechaza impersonar fuera del dominio', async () => {
    const adapter = new GoogleCalendarAdapter({
      auth,
      clientFactory: () => ({ events: { list: async () => ({ data: {} }) } }),
    })
    await expect(
      adapter.syncEvents({ userEmail: 'x@otro.com', calendarId: 'primary', syncToken: null }),
    ).rejects.toThrow(/dominio/)
  })
})
