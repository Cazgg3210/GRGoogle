import { describe, expect, it } from 'vitest'
import { ImpersonatedAuthFactory } from '../auth/dwd.js'
import type { RawGoogleRequester } from './shared.js'
import { GoogleMeetAdapter, type MeetApiClient } from './meet.js'

const auth = new ImpersonatedAuthFactory({
  credentials: {
    client_email: 'sa@proj.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
  },
  allowedDomain: 'smlxl.mx',
})

function httpError(status: number): Error {
  const e = new Error(`HTTP ${status}`) as Error & { response: { status: number } }
  e.response = { status }
  return e
}

const baseClient: MeetApiClient = {
  spaces: {
    get: async (p) => ({
      data: {
        name: 'spaces/abc123',
        meetingCode: p.name?.replace('spaces/', '') ?? '',
        meetingUri: 'https://meet.google.com/abc-defg-hij',
      },
    }),
  },
  conferenceRecords: {
    get: async () => {
      throw httpError(404)
    },
    list: async () => ({
      data: {
        conferenceRecords: [
          {
            name: 'conferenceRecords/r1',
            space: 'spaces/abc123',
            startTime: '2026-09-01T10:00:00Z',
            endTime: '2026-09-01T11:00:00Z',
          },
        ],
      },
    }),
    participants: {
      list: async () => ({
        data: {
          participants: [
            {
              name: 'conferenceRecords/r1/participants/p1',
              signedinUser: { displayName: 'Ana', user: 'users/123' },
            },
            {
              name: 'conferenceRecords/r1/participants/p2',
              anonymousUser: { displayName: 'Invitado X' },
            },
          ],
        },
      }),
    },
    transcripts: {
      list: async () => ({
        data: {
          transcripts: [
            {
              name: 'conferenceRecords/r1/transcripts/t1',
              state: 'FILE_GENERATED',
              docsDestination: { document: 'doc1' },
            },
          ],
        },
      }),
      entries: {
        list: async (p) =>
          p.pageToken
            ? {
                data: {
                  transcriptEntries: [
                    {
                      name: 'e2',
                      text: 'dos',
                      participant: 'conferenceRecords/r1/participants/p1',
                    },
                  ],
                },
              }
            : {
                data: {
                  transcriptEntries: [
                    {
                      name: 'e1',
                      text: 'uno',
                      participant: 'conferenceRecords/r1/participants/p1',
                    },
                  ],
                  nextPageToken: 'n',
                },
              },
      },
    },
  },
}

describe('GoogleMeetAdapter', () => {
  it('lista y mapea recursos, paginando entries y resolviendo emails', async () => {
    const adapter = new GoogleMeetAdapter({
      auth,
      clientFactory: () => baseClient,
      resolveUserEmail: async (id) => (id === '123' ? 'ana@smlxl.mx' : null),
    })
    const records = await adapter.listConferenceRecordsByMeetingCode('abc-defg-hij', 'ana@smlxl.mx')
    expect(records[0]?.name).toBe('conferenceRecords/r1')
    expect(await adapter.getConferenceRecord('conferenceRecords/nope', 'ana@smlxl.mx')).toBeNull()
    const participants = await adapter.listParticipants('conferenceRecords/r1', 'ana@smlxl.mx')
    expect(participants).toMatchObject([
      { displayName: 'Ana', email: 'ana@smlxl.mx', type: 'SIGNED_IN_USER' },
      { displayName: 'Invitado X', email: null, type: 'ANONYMOUS_USER' },
    ])
    const entries = await adapter.listTranscriptEntries(
      'conferenceRecords/r1/transcripts/t1',
      'ana@smlxl.mx',
    )
    expect(entries.map((e) => e.text)).toEqual(['uno', 'dos'])
    const space = await adapter.getSpaceByMeetingCode('abc-defg-hij', 'ana@smlxl.mx')
    expect(space?.autoTranscriptionGeneration).toBe('UNKNOWN')
  })

  it('patchArtifactConfig devuelve blockedReason en 403 y usa updateMask completo', async () => {
    let captured: { url: string; params?: Record<string, unknown> } | null = null
    const raw403: RawGoogleRequester = {
      request: async () => {
        throw httpError(403)
      },
    }
    const blocked = new GoogleMeetAdapter({
      auth,
      clientFactory: () => baseClient,
      rawFactory: () => raw403,
      retry: { retries: 0 },
    })
    const res = await blocked.patchArtifactConfig(
      'spaces/abc123',
      { autoTranscription: true, autoSmartNotes: true },
      'ana@smlxl.mx',
    )
    expect(res.applied).toBe(false)
    expect(res.blockedReason).toMatch(/GOOGLE_PERMISSION_DENIED/)
    const rawOk: RawGoogleRequester = {
      request: async <T>(opts: { url: string; params?: Record<string, unknown> }) => {
        captured = opts
        return { data: {} as T }
      },
    }
    const ok = new GoogleMeetAdapter({
      auth,
      clientFactory: () => baseClient,
      rawFactory: () => rawOk,
    })
    expect(
      await ok.patchArtifactConfig(
        'spaces/abc123',
        { autoTranscription: true, autoSmartNotes: false },
        'ana@smlxl.mx',
      ),
    ).toEqual({ applied: true })
    expect(captured).not.toBeNull()
    const c = captured as unknown as { url: string; params?: Record<string, unknown> }
    expect(c.url).toBe('https://meet.googleapis.com/v2/spaces/abc123')
    expect(c.params?.['updateMask']).toBe(
      'config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration,config.artifactConfig.smartNotesConfig.autoSmartNotesGeneration',
    )
  })

  it('listSmartNotes usa la petición raw', async () => {
    const raw: RawGoogleRequester = {
      request: async <T>() => ({
        data: {
          smartNotes: [
            {
              name: 'conferenceRecords/r1/smartNotes/s1',
              state: 'FILE_GENERATED',
              docsDestination: { document: 'docS' },
            },
          ],
        } as T,
      }),
    }
    const adapter = new GoogleMeetAdapter({
      auth,
      clientFactory: () => baseClient,
      rawFactory: () => raw,
    })
    const notes = await adapter.listSmartNotes('conferenceRecords/r1', 'ana@smlxl.mx')
    expect(notes).toEqual([
      {
        name: 'conferenceRecords/r1/smartNotes/s1',
        state: 'FILE_GENERATED',
        docsDocumentId: 'docS',
        startTime: null,
        endTime: null,
      },
    ])
  })
})
