import { google, type meet_v2 } from 'googleapis'
import type {
  MeetConferenceRecord,
  MeetParticipant,
  MeetSmartNoteMeta,
  MeetSpace,
  MeetTranscriptEntry,
  MeetTranscriptMeta,
  MeetingCapturePort,
} from '@smlxl/domain'
import { DomainErrorCode, isDomainError } from '@smlxl/domain'
import { GOOGLE_SCOPES } from '../scopes.js'
import { withGoogleRetry, httpStatusOf } from '../http/retry.js'
import {
  collectPages,
  toDate,
  type AuthClient,
  type GoogleAdapterDeps,
  type RawGoogleRequester,
} from './shared.js'

/**
 * Adapter de Google Meet REST API v2 (§12). Toda llamada impersona al usuario
 * indicado (`asUser`) vía DWD. Persistimos siempre los resource names canónicos.
 *
 * NOTA sobre typings: googleapis@144 `meet_v2` no expone `config.artifactConfig`
 * ni `conferenceRecords.smartNotes`. Ambas operaciones se hacen con una petición
 * tipada "raw" contra `https://meet.googleapis.com/v2/...` usando el mismo
 * cliente JWT (misma autenticación, mismo retry/timeout). Validar en el spike.
 */
export interface MeetApiClient {
  spaces: {
    get(
      params: meet_v2.Params$Resource$Spaces$Get,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: meet_v2.Schema$Space }>
  }
  conferenceRecords: {
    get(
      params: meet_v2.Params$Resource$Conferencerecords$Get,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: meet_v2.Schema$ConferenceRecord }>
    list(
      params: meet_v2.Params$Resource$Conferencerecords$List,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: meet_v2.Schema$ListConferenceRecordsResponse }>
    participants: {
      list(
        params: meet_v2.Params$Resource$Conferencerecords$Participants$List,
        options?: { signal?: AbortSignal },
      ): Promise<{ data: meet_v2.Schema$ListParticipantsResponse }>
    }
    transcripts: {
      list(
        params: meet_v2.Params$Resource$Conferencerecords$Transcripts$List,
        options?: { signal?: AbortSignal },
      ): Promise<{ data: meet_v2.Schema$ListTranscriptsResponse }>
      entries: {
        list(
          params: meet_v2.Params$Resource$Conferencerecords$Transcripts$Entries$List,
          options?: { signal?: AbortSignal },
        ): Promise<{ data: meet_v2.Schema$ListTranscriptEntriesResponse }>
      }
    }
  }
}

/** Forma del space con artifactConfig (no presente en typings v2 instalados). */
interface SpaceWithArtifactConfig extends meet_v2.Schema$Space {
  config?: meet_v2.Schema$SpaceConfig & {
    artifactConfig?: {
      transcriptionConfig?: { autoTranscriptionGeneration?: 'ON' | 'OFF' | string | null }
      smartNotesConfig?: { autoSmartNotesGeneration?: 'ON' | 'OFF' | string | null }
    }
  }
}

interface RawSmartNote {
  name?: string | null
  state?: string | null
  docsDestination?: { document?: string | null; exportUri?: string | null } | null
  startTime?: string | null
  endTime?: string | null
}

interface RawListSmartNotesResponse {
  smartNotes?: RawSmartNote[]
  nextPageToken?: string | null
}

const MEET_BASE_URL = 'https://meet.googleapis.com/v2'
const READ_SCOPES = [GOOGLE_SCOPES.meet.SPACE_READONLY]
const SETTINGS_SCOPES = [GOOGLE_SCOPES.meet.SPACE_SETTINGS, GOOGLE_SCOPES.meet.SPACE_READONLY]

export interface GoogleMeetAdapterDeps extends GoogleAdapterDeps {
  clientFactory?: (auth: AuthClient) => MeetApiClient
  rawFactory?: (auth: AuthClient) => RawGoogleRequester
  /** Resuelve el email de `users/{id}` (Directory). Opcional: sin él, email = null. */
  resolveUserEmail?: (googleUserId: string) => Promise<string | null>
}

function artifactFlag(value: string | null | undefined): 'ON' | 'OFF' | 'UNKNOWN' {
  if (value === 'ON') return 'ON'
  if (value === 'OFF') return 'OFF'
  return 'UNKNOWN'
}

function artifactState(
  value: string | null | undefined,
): 'STARTED' | 'ENDED' | 'FILE_GENERATED' | 'UNKNOWN' {
  if (value === 'STARTED' || value === 'ENDED' || value === 'FILE_GENERATED') return value
  return 'UNKNOWN'
}

export function mapSpace(space: SpaceWithArtifactConfig): MeetSpace {
  return {
    name: space.name ?? '',
    meetingCode: space.meetingCode ?? '',
    meetingUri: space.meetingUri ?? '',
    autoTranscriptionGeneration: artifactFlag(
      space.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration,
    ),
    autoSmartNotesGeneration: artifactFlag(
      space.config?.artifactConfig?.smartNotesConfig?.autoSmartNotesGeneration,
    ),
  }
}

export function mapConferenceRecord(r: meet_v2.Schema$ConferenceRecord): MeetConferenceRecord {
  return {
    name: r.name ?? '',
    spaceName: r.space ?? '',
    startTime: toDate(r.startTime) ?? new Date(0),
    endTime: toDate(r.endTime),
    expireTime: toDate(r.expireTime),
  }
}

export class GoogleMeetAdapter implements MeetingCapturePort {
  private readonly clientFactory: (auth: AuthClient) => MeetApiClient
  private readonly rawFactory: (auth: AuthClient) => RawGoogleRequester
  private readonly emailCache = new Map<string, string | null>()

  constructor(private readonly deps: GoogleMeetAdapterDeps) {
    this.clientFactory =
      deps.clientFactory ??
      ((auth) => google.meet({ version: 'v2', auth }) as unknown as MeetApiClient)
    this.rawFactory = deps.rawFactory ?? ((auth) => auth as unknown as RawGoogleRequester)
  }

  private client(asUser: string, scopes: readonly string[] = READ_SCOPES): MeetApiClient {
    return this.clientFactory(this.deps.auth.for(asUser, scopes))
  }

  private raw(asUser: string, scopes: readonly string[] = READ_SCOPES): RawGoogleRequester {
    return this.rawFactory(this.deps.auth.for(asUser, scopes))
  }

  private retryOpts(operation: string) {
    return { ...this.deps.retry, operation }
  }

  async getSpaceByMeetingCode(meetingCode: string, asUser: string): Promise<MeetSpace | null> {
    try {
      const res = await withGoogleRetry(
        (signal) =>
          this.client(asUser).spaces.get(
            { name: meetingCode.startsWith('spaces/') ? meetingCode : `spaces/${meetingCode}` },
            { signal },
          ),
        this.retryOpts('meet.spaces.get'),
      )
      return mapSpace(res.data as SpaceWithArtifactConfig)
    } catch (err) {
      if (isDomainError(err) && err.code === DomainErrorCode.GOOGLE_NOT_FOUND) return null
      throw err
    }
  }

  async patchArtifactConfig(
    spaceName: string,
    config: { autoTranscription: boolean; autoSmartNotes: boolean },
    asUser: string,
  ): Promise<{ applied: boolean; blockedReason?: string }> {
    const body: SpaceWithArtifactConfig = {
      config: {
        artifactConfig: {
          transcriptionConfig: {
            autoTranscriptionGeneration: config.autoTranscription ? 'ON' : 'OFF',
          },
          smartNotesConfig: { autoSmartNotesGeneration: config.autoSmartNotes ? 'ON' : 'OFF' },
        },
      },
    }
    try {
      await withGoogleRetry(
        (signal) =>
          this.raw(asUser, SETTINGS_SCOPES).request<SpaceWithArtifactConfig>({
            url: `${MEET_BASE_URL}/${spaceName}`,
            method: 'PATCH',
            params: {
              updateMask:
                'config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration,config.artifactConfig.smartNotesConfig.autoSmartNotesGeneration',
            },
            data: body,
            signal,
          }),
        this.retryOpts('meet.spaces.patch'),
      )
      return { applied: true }
    } catch (err) {
      // 403/400: política o privilegios insuficientes → CAPABILITY_BLOCKED, nunca romper la reunión (§12.3).
      const status = isDomainError(err)
        ? (err.details?.status as number | null | undefined)
        : httpStatusOf(err)
      if (
        isDomainError(err) &&
        (err.code === DomainErrorCode.GOOGLE_PERMISSION_DENIED ||
          err.code === DomainErrorCode.VALIDATION_ERROR ||
          status === 400 ||
          status === 403)
      ) {
        return { applied: false, blockedReason: `${err.code}: ${err.message}` }
      }
      throw err
    }
  }

  async getConferenceRecord(name: string, asUser: string): Promise<MeetConferenceRecord | null> {
    try {
      const res = await withGoogleRetry(
        (signal) => this.client(asUser).conferenceRecords.get({ name }, { signal }),
        this.retryOpts('meet.conferenceRecords.get'),
      )
      return mapConferenceRecord(res.data)
    } catch (err) {
      if (isDomainError(err) && err.code === DomainErrorCode.GOOGLE_NOT_FOUND) return null
      throw err
    }
  }

  async listConferenceRecordsByMeetingCode(
    meetingCode: string,
    asUser: string,
  ): Promise<MeetConferenceRecord[]> {
    const items = await collectPages((pageToken) =>
      withGoogleRetry(async (signal) => {
        const res = await this.client(asUser).conferenceRecords.list(
          { filter: `space.meeting_code = "${meetingCode}"`, pageSize: 50, pageToken },
          { signal },
        )
        return { items: res.data.conferenceRecords ?? [], nextPageToken: res.data.nextPageToken }
      }, this.retryOpts('meet.conferenceRecords.list')),
    )
    return items.map(mapConferenceRecord)
  }

  async listParticipants(conferenceRecordName: string, asUser: string): Promise<MeetParticipant[]> {
    const items = await collectPages((pageToken) =>
      withGoogleRetry(async (signal) => {
        const res = await this.client(asUser).conferenceRecords.participants.list(
          { parent: conferenceRecordName, pageSize: 100, pageToken },
          { signal },
        )
        return { items: res.data.participants ?? [], nextPageToken: res.data.nextPageToken }
      }, this.retryOpts('meet.participants.list')),
    )
    const out: MeetParticipant[] = []
    for (const p of items) {
      let type: MeetParticipant['type'] = 'UNKNOWN'
      let displayName = ''
      let email: string | null = null
      if (p.signedinUser) {
        type = 'SIGNED_IN_USER'
        displayName = p.signedinUser.displayName ?? ''
        const userId = p.signedinUser.user?.replace(/^users\//, '') ?? null
        if (userId) email = await this.resolveEmail(userId)
      } else if (p.anonymousUser) {
        type = 'ANONYMOUS_USER'
        displayName = p.anonymousUser.displayName ?? 'Invitado'
      } else if (p.phoneUser) {
        type = 'PHONE_USER'
        displayName = p.phoneUser.displayName ?? 'Teléfono'
      }
      out.push({
        name: p.name ?? '',
        displayName: displayName || 'Participante',
        email,
        type,
        earliestStartTime: toDate(p.earliestStartTime),
        latestEndTime: toDate(p.latestEndTime),
      })
    }
    return out
  }

  private async resolveEmail(googleUserId: string): Promise<string | null> {
    if (!this.deps.resolveUserEmail) return null
    if (this.emailCache.has(googleUserId)) return this.emailCache.get(googleUserId) ?? null
    let email: string | null = null
    try {
      email = await this.deps.resolveUserEmail(googleUserId)
    } catch {
      email = null
    }
    this.emailCache.set(googleUserId, email)
    return email
  }

  async listTranscripts(
    conferenceRecordName: string,
    asUser: string,
  ): Promise<MeetTranscriptMeta[]> {
    const items = await collectPages((pageToken) =>
      withGoogleRetry(async (signal) => {
        const res = await this.client(asUser).conferenceRecords.transcripts.list(
          { parent: conferenceRecordName, pageSize: 50, pageToken },
          { signal },
        )
        return { items: res.data.transcripts ?? [], nextPageToken: res.data.nextPageToken }
      }, this.retryOpts('meet.transcripts.list')),
    )
    return items.map((t) => ({
      name: t.name ?? '',
      state: artifactState(t.state),
      docsDocumentId: t.docsDestination?.document ?? null,
      startTime: toDate(t.startTime),
      endTime: toDate(t.endTime),
    }))
  }

  async listTranscriptEntries(
    transcriptName: string,
    asUser: string,
  ): Promise<MeetTranscriptEntry[]> {
    const items = await collectPages(
      (pageToken) =>
        withGoogleRetry(async (signal) => {
          const res = await this.client(asUser).conferenceRecords.transcripts.entries.list(
            { parent: transcriptName, pageSize: 100, pageToken },
            { signal },
          )
          return { items: res.data.transcriptEntries ?? [], nextPageToken: res.data.nextPageToken }
        }, this.retryOpts('meet.transcripts.entries.list')),
      500,
    )
    return items.map((e) => ({
      name: e.name ?? '',
      participantName: e.participant ?? null,
      text: e.text ?? '',
      languageCode: e.languageCode ?? null,
      startTime: toDate(e.startTime),
      endTime: toDate(e.endTime),
    }))
  }

  async listSmartNotes(conferenceRecordName: string, asUser: string): Promise<MeetSmartNoteMeta[]> {
    // Sin typings en googleapis@144: petición raw a conferenceRecords.smartNotes.list.
    const items = await collectPages((pageToken) =>
      withGoogleRetry(async (signal) => {
        const res = await this.raw(asUser).request<RawListSmartNotesResponse>({
          url: `${MEET_BASE_URL}/${conferenceRecordName}/smartNotes`,
          method: 'GET',
          params: { pageSize: 50, pageToken },
          signal,
        })
        return { items: res.data.smartNotes ?? [], nextPageToken: res.data.nextPageToken }
      }, this.retryOpts('meet.smartNotes.list')),
    )
    return items.map((n) => ({
      name: n.name ?? '',
      state: artifactState(n.state),
      docsDocumentId: n.docsDestination?.document ?? null,
      startTime: toDate(n.startTime),
      endTime: toDate(n.endTime),
    }))
  }
}
