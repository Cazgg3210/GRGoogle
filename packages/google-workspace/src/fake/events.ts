import { randomUUID } from 'node:crypto'
import { GoogleMeetEventType } from '@smlxl/domain'
import type { WorkspaceCloudEvent } from '@smlxl/contracts'
import { loadDefaultFixtures, type FakeGoogleFixtures } from './fixtures.js'

export interface FakeCloudEventOptions {
  /** Email del usuario suscrito (subject de la suscripción). */
  subscribedUserEmail?: string
  occurredAt?: Date
  id?: string
  fixtures?: FakeGoogleFixtures
}

function resolveRecordName(codeOrName: string, fixtures: FakeGoogleFixtures): string {
  if (codeOrName.startsWith('conferenceRecords/')) return codeOrName
  const r = fixtures.conferenceRecords.find((c) => c.meetingCode === codeOrName.toLowerCase())
  return r?.name ?? `conferenceRecords/fake-${codeOrName}`
}

/**
 * Crea un CloudEvent `conference.v2.ended` tal como lo entregaría Pub/Sub
 * (sin resource data, §13.2) para `SimulateMeetingEnded` y tests.
 */
export function createFakeConferenceEndedEvent(
  meetingCodeOrConferenceRecordName: string,
  options: FakeCloudEventOptions = {},
): WorkspaceCloudEvent {
  const fixtures = options.fixtures ?? loadDefaultFixtures()
  const name = resolveRecordName(meetingCodeOrConferenceRecordName, fixtures)
  const record = fixtures.conferenceRecords.find((c) => c.name === name)
  const subject = options.subscribedUserEmail ?? record?.participants.find((p) => p.email?.endsWith('@smlxl.mx'))?.email ?? 'unknown@smlxl.mx'
  return {
    id: options.id ?? randomUUID(),
    type: GoogleMeetEventType.CONFERENCE_ENDED,
    source: `//meet.googleapis.com/users/${subject}`,
    subject: `//meet.googleapis.com/${name}`,
    time: (options.occurredAt ?? new Date()).toISOString(),
    specversion: '1.0',
    datacontenttype: 'application/json',
    data: { conferenceRecord: { name } },
  }
}

export function createFakeTranscriptGeneratedEvent(
  conferenceRecordName: string,
  transcriptName: string,
  options: FakeCloudEventOptions = {},
): WorkspaceCloudEvent {
  return {
    id: options.id ?? randomUUID(),
    type: GoogleMeetEventType.TRANSCRIPT_FILE_GENERATED,
    source: `//meet.googleapis.com/users/${options.subscribedUserEmail ?? 'unknown@smlxl.mx'}`,
    subject: `//meet.googleapis.com/${conferenceRecordName}`,
    time: (options.occurredAt ?? new Date()).toISOString(),
    specversion: '1.0',
    datacontenttype: 'application/json',
    data: { transcript: { name: transcriptName } },
  }
}
