import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Fixtures de los adapters fake (§45.17). Se cargan desde
 * `tests/fixtures/google/conference-records.json`; los tests pueden inyectar
 * fixtures propias. Los tiempos son relativos al reloj del fake (`now`).
 */
export interface FixtureSpace {
  name: string
  meetingCode: string
  ownerEmail: string
  autoTranscription: 'ON' | 'OFF'
  autoSmartNotes: 'ON' | 'OFF'
  patchBlockedReason: string | null
}

export interface FixtureParticipant {
  id: string
  displayName: string
  email: string | null
  type: 'SIGNED_IN_USER' | 'ANONYMOUS_USER' | 'PHONE_USER' | 'UNKNOWN'
}

export interface FixtureTranscriptEntry {
  participant: string
  offsetSeconds: number
  durationSeconds: number
  text: string
}

export interface FixtureTranscript {
  id: string
  state: 'STARTED' | 'ENDED' | 'FILE_GENERATED'
  docsDocumentId: string | null
  languageCode: string | null
  entries: FixtureTranscriptEntry[]
}

export interface FixtureSmartNote {
  id: string
  state: 'STARTED' | 'ENDED' | 'FILE_GENERATED'
  docsDocumentId: string | null
}

export interface FixtureConferenceRecord {
  name: string
  spaceName: string
  meetingCode: string
  title: string
  startOffsetMinutes: number
  durationMinutes: number
  /** null = accesible a cualquiera; [] = inaccesible (host externo); lista = emails con acceso. */
  accessibleTo: string[] | null
  participants: FixtureParticipant[]
  transcripts: FixtureTranscript[]
  smartNotes: FixtureSmartNote[]
}

export interface FixtureCalendarEvent {
  userEmail: string
  calendarEventId: string
  title: string
  organizerEmail: string
  attendees: string[]
  startOffsetMinutes: number
  durationMinutes: number
  meetingCode: string | null
  status: 'confirmed' | 'tentative' | 'cancelled'
  recurringEventId: string | null
}

export interface FakeGoogleFixtures {
  spaces: FixtureSpace[]
  conferenceRecords: FixtureConferenceRecord[]
  documents: Record<string, string>
  calendarEvents: FixtureCalendarEvent[]
}

export const DEFAULT_FIXTURES_PATH = fileURLToPath(
  new URL('../../../../tests/fixtures/google/conference-records.json', import.meta.url),
)

let cached: FakeGoogleFixtures | null = null

export function loadDefaultFixtures(): FakeGoogleFixtures {
  if (!cached)
    cached = JSON.parse(readFileSync(DEFAULT_FIXTURES_PATH, 'utf8')) as FakeGoogleFixtures
  // Copia defensiva: los fakes pueden mutar (p. ej. patchArtifactConfig).
  return structuredClone(cached)
}

export function emptyFixtures(): FakeGoogleFixtures {
  return { spaces: [], conferenceRecords: [], documents: {}, calendarEvents: [] }
}

/** Instante base para tiempos relativos (por defecto reloj real). */
export type NowFn = () => Date

export function recordStartTime(r: FixtureConferenceRecord, now: NowFn): Date {
  return new Date(now().getTime() + r.startOffsetMinutes * 60_000)
}

export function recordEndTime(r: FixtureConferenceRecord, now: NowFn): Date {
  return new Date(recordStartTime(r, now).getTime() + r.durationMinutes * 60_000)
}
