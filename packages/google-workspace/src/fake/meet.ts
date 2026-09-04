import type {
  MeetConferenceRecord,
  MeetParticipant,
  MeetSmartNoteMeta,
  MeetSpace,
  MeetTranscriptEntry,
  MeetTranscriptMeta,
  MeetingCapturePort,
} from '@smlxl/domain'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import {
  loadDefaultFixtures,
  recordEndTime,
  recordStartTime,
  type FakeGoogleFixtures,
  type FixtureConferenceRecord,
  type NowFn,
} from './fixtures.js'

export interface FakeMeetOptions {
  fixtures?: FakeGoogleFixtures
  now?: NowFn
  /** Dominio interno: los usuarios de otros dominios no pueden impersonarse. */
  companyDomain?: string
}

/**
 * Fake de Google Meet REST API sobre fixtures en memoria. Simula:
 * - spaces por meetingCode (con bloqueo de política configurable);
 * - conference records accesibles según `accessibleTo`;
 * - participantes, transcripts/entries y smart notes.
 */
export class FakeMeetAdapter implements MeetingCapturePort {
  readonly fixtures: FakeGoogleFixtures
  readonly now: NowFn
  readonly patchCalls: Array<{
    spaceName: string
    asUser: string
    config: { autoTranscription: boolean; autoSmartNotes: boolean }
  }> = []
  private readonly companyDomain: string

  constructor(options: FakeMeetOptions = {}) {
    this.fixtures = options.fixtures ?? loadDefaultFixtures()
    this.now = options.now ?? (() => new Date())
    this.companyDomain = options.companyDomain ?? 'smlxl.mx'
  }

  private assertInternal(asUser: string): void {
    if (!asUser.toLowerCase().endsWith(`@${this.companyDomain}`)) {
      throw new DomainError(
        DomainErrorCode.GOOGLE_PERMISSION_DENIED,
        'Fake Meet: sólo se puede impersonar usuarios internos',
        {
          details: { asUser },
        },
      )
    }
  }

  private canAccess(r: FixtureConferenceRecord, asUser: string): boolean {
    if (r.accessibleTo === null) return true
    return r.accessibleTo.map((e) => e.toLowerCase()).includes(asUser.toLowerCase())
  }

  private findRecord(name: string, asUser: string): FixtureConferenceRecord | null {
    const r = this.fixtures.conferenceRecords.find((c) => c.name === name)
    if (!r || !this.canAccess(r, asUser)) return null
    return r
  }

  private mapRecord(r: FixtureConferenceRecord): MeetConferenceRecord {
    const start = recordStartTime(r, this.now)
    const end = recordEndTime(r, this.now)
    return {
      name: r.name,
      spaceName: r.spaceName,
      startTime: start,
      endTime: end,
      expireTime: new Date(end.getTime() + 30 * 86_400_000),
    }
  }

  async getSpaceByMeetingCode(meetingCode: string, asUser: string): Promise<MeetSpace | null> {
    this.assertInternal(asUser)
    const s = this.fixtures.spaces.find(
      (x) => x.meetingCode === meetingCode.toLowerCase() || x.name === meetingCode,
    )
    if (!s) return null
    return {
      name: s.name,
      meetingCode: s.meetingCode,
      meetingUri: `https://meet.google.com/${s.meetingCode}`,
      autoTranscriptionGeneration: s.autoTranscription,
      autoSmartNotesGeneration: s.autoSmartNotes,
    }
  }

  async patchArtifactConfig(
    spaceName: string,
    config: { autoTranscription: boolean; autoSmartNotes: boolean },
    asUser: string,
  ): Promise<{ applied: boolean; blockedReason?: string }> {
    this.assertInternal(asUser)
    this.patchCalls.push({ spaceName, asUser, config })
    const s = this.fixtures.spaces.find((x) => x.name === spaceName)
    if (!s) throw new DomainError(DomainErrorCode.GOOGLE_NOT_FOUND, `Space ${spaceName} no existe`)
    if (s.patchBlockedReason) return { applied: false, blockedReason: s.patchBlockedReason }
    if (s.ownerEmail.toLowerCase() !== asUser.toLowerCase()) {
      return {
        applied: false,
        blockedReason:
          'GOOGLE_PERMISSION_DENIED: sólo el propietario del space puede modificar artifactConfig',
      }
    }
    s.autoTranscription = config.autoTranscription ? 'ON' : 'OFF'
    s.autoSmartNotes = config.autoSmartNotes ? 'ON' : 'OFF'
    return { applied: true }
  }

  async getConferenceRecord(name: string, asUser: string): Promise<MeetConferenceRecord | null> {
    this.assertInternal(asUser)
    const r = this.findRecord(name, asUser)
    return r ? this.mapRecord(r) : null
  }

  async listConferenceRecordsByMeetingCode(
    meetingCode: string,
    asUser: string,
  ): Promise<MeetConferenceRecord[]> {
    this.assertInternal(asUser)
    return this.fixtures.conferenceRecords
      .filter((r) => r.meetingCode === meetingCode.toLowerCase() && this.canAccess(r, asUser))
      .map((r) => this.mapRecord(r))
  }

  async listParticipants(conferenceRecordName: string, asUser: string): Promise<MeetParticipant[]> {
    this.assertInternal(asUser)
    const r = this.findRecord(conferenceRecordName, asUser)
    if (!r) return []
    const start = recordStartTime(r, this.now)
    const end = recordEndTime(r, this.now)
    return r.participants.map((p) => ({
      name: `${r.name}/participants/${p.id}`,
      displayName: p.displayName,
      email: p.email,
      type: p.type,
      earliestStartTime: start,
      latestEndTime: end,
    }))
  }

  async listTranscripts(
    conferenceRecordName: string,
    asUser: string,
  ): Promise<MeetTranscriptMeta[]> {
    this.assertInternal(asUser)
    const r = this.findRecord(conferenceRecordName, asUser)
    if (!r) return []
    const start = recordStartTime(r, this.now)
    const end = recordEndTime(r, this.now)
    return r.transcripts.map((t) => ({
      name: `${r.name}/transcripts/${t.id}`,
      state: t.state,
      docsDocumentId: t.docsDocumentId,
      startTime: start,
      endTime: end,
    }))
  }

  async listTranscriptEntries(
    transcriptName: string,
    asUser: string,
  ): Promise<MeetTranscriptEntry[]> {
    this.assertInternal(asUser)
    const [recordName, transcriptId] = transcriptName.split('/transcripts/')
    const r = recordName ? this.findRecord(recordName, asUser) : null
    const t = r?.transcripts.find((x) => x.id === transcriptId)
    if (!r || !t) return []
    const start = recordStartTime(r, this.now)
    return t.entries.map((e, i) => ({
      name: `${transcriptName}/entries/e${String(i + 1).padStart(4, '0')}`,
      participantName: `${r.name}/participants/${e.participant}`,
      text: e.text,
      languageCode: t.languageCode,
      startTime: new Date(start.getTime() + e.offsetSeconds * 1000),
      endTime: new Date(start.getTime() + (e.offsetSeconds + e.durationSeconds) * 1000),
    }))
  }

  async listSmartNotes(conferenceRecordName: string, asUser: string): Promise<MeetSmartNoteMeta[]> {
    this.assertInternal(asUser)
    const r = this.findRecord(conferenceRecordName, asUser)
    if (!r) return []
    const start = recordStartTime(r, this.now)
    const end = recordEndTime(r, this.now)
    return r.smartNotes.map((n) => ({
      name: `${r.name}/smartNotes/${n.id}`,
      state: n.state,
      docsDocumentId: n.docsDocumentId,
      startTime: start,
      endTime: end,
    }))
  }
}
