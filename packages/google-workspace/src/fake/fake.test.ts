import { describe, expect, it } from 'vitest'
import { GoogleMeetEventType } from '@smlxl/domain'
import { createFakeGoogleAdapters } from '../factory.js'
import { createFakeConferenceEndedEvent } from './events.js'
import { loadDefaultFixtures } from './fixtures.js'

const now = () => new Date('2026-09-03T18:00:00Z')
const env = { GOOGLE_WORKSPACE_DOMAIN: 'smlxl.mx' }

describe('fake adapters', () => {
  it('carga las fixtures por defecto con la reunión de Cliente Alfa', () => {
    const f = loadDefaultFixtures()
    const alfa = f.conferenceRecords.find((r) => r.title === 'Seguimiento contrato Cliente Alfa')
    expect(alfa).toBeDefined()
    expect(alfa?.transcripts[0]?.entries.length).toBeGreaterThanOrEqual(20)
    expect(alfa?.participants.map((p) => p.displayName)).toEqual(['Andrés Escandón', 'Lucía Ferrer', 'Carlos Martínez', 'Mariana Solís'])
  })

  it('meet: expone records, participantes, entries y smart notes', async () => {
    const g = createFakeGoogleAdapters(env, { now, monitoredUserEmails: ['andres.escandon@smlxl.mx'] })
    const rec = await g.meet.getConferenceRecord('conferenceRecords/fake-alfa-001', 'andres.escandon@smlxl.mx')
    expect(rec?.spaceName).toBe('spaces/fakeAlfaSpace01')
    expect(rec?.endTime?.getTime()).toBeLessThan(now().getTime())
    const participants = await g.meet.listParticipants(rec?.name ?? '', 'andres.escandon@smlxl.mx')
    expect(participants.find((p) => p.displayName === 'Carlos Martínez')?.email).toBe('carlos.martinez@cliente-alfa.example')
    const transcripts = await g.meet.listTranscripts(rec?.name ?? '', 'andres.escandon@smlxl.mx')
    const entries = await g.meet.listTranscriptEntries(transcripts[0]?.name ?? '', 'andres.escandon@smlxl.mx')
    expect(entries.length).toBeGreaterThan(20)
    expect(entries[0]?.participantName).toBe('conferenceRecords/fake-alfa-001/participants/p-andres')
    const notes = await g.meet.listSmartNotes(rec?.name ?? '', 'andres.escandon@smlxl.mx')
    expect(notes[0]?.docsDocumentId).toBe('doc-alfa-smartnotes-001')
    expect(await g.drive.exportDocumentText('doc-alfa-smartnotes-001', 'andres.escandon@smlxl.mx')).toContain('carta de intención')
  })

  it('meet: host externo no es accesible y patch bloqueado por política', async () => {
    const g = createFakeGoogleAdapters(env, { now })
    expect(await g.meet.listConferenceRecordsByMeetingCode('qrs-tuvw-xyz', 'lucia.ferrer@smlxl.mx')).toEqual([])
    const space = await g.meet.getSpaceByMeetingCode('mno-pqrs-tuv', 'lucia.ferrer@smlxl.mx')
    const res = await g.meet.patchArtifactConfig(space?.name ?? '', { autoTranscription: true, autoSmartNotes: true }, 'lucia.ferrer@smlxl.mx')
    expect(res.applied).toBe(false)
    expect(res.blockedReason).toMatch(/política/)
    const ok = await g.meet.patchArtifactConfig('spaces/fakeAlfaSpace01', { autoTranscription: true, autoSmartNotes: true }, 'andres.escandon@smlxl.mx')
    expect(ok.applied).toBe(true)
    await expect(g.meet.getConferenceRecord('conferenceRecords/fake-alfa-001', 'x@otro.com')).rejects.toMatchObject({ code: 'GOOGLE_PERMISSION_DENIED' })
  })

  it('calendar: sync inicial + incremental + token inválido', async () => {
    const g = createFakeGoogleAdapters(env, { now })
    const first = await g.calendar.syncEvents({ userEmail: 'lucia.ferrer@smlxl.mx', calendarId: 'primary', syncToken: null })
    expect(first.events.map((e) => e.calendarEventId).sort()).toEqual(['cal-evt-beta-003', 'cal-evt-pipeline-002'])
    expect(first.events.find((e) => e.calendarEventId === 'cal-evt-beta-003')?.organizerEmail).toBe('ana.lopez@proveedor-beta.example')
    const second = await g.calendar.syncEvents({ userEmail: 'lucia.ferrer@smlxl.mx', calendarId: 'primary', syncToken: first.nextSyncToken })
    expect(second.events).toEqual([])
    g.calendar.addEvent({ userEmail: 'lucia.ferrer@smlxl.mx', calendarEventId: 'new-1', title: 'Nueva', organizerEmail: 'lucia.ferrer@smlxl.mx', attendees: [], startOffsetMinutes: 60, durationMinutes: 30, meetingCode: null, status: 'confirmed', recurringEventId: null })
    const third = await g.calendar.syncEvents({ userEmail: 'lucia.ferrer@smlxl.mx', calendarId: 'primary', syncToken: second.nextSyncToken })
    expect(third.events.map((e) => e.calendarEventId)).toEqual(['new-1'])
    g.calendar.invalidateToken(third.nextSyncToken ?? '')
    const fourth = await g.calendar.syncEvents({ userEmail: 'lucia.ferrer@smlxl.mx', calendarId: 'primary', syncToken: third.nextSyncToken })
    expect(fourth.fullSyncRequired).toBe(true)
  })

  it('workspace events, directory, mail y sheets', async () => {
    const g = createFakeGoogleAdapters(env, { now, monitoredUserEmails: ['andres.escandon@smlxl.mx', 'lucia.ferrer@smlxl.mx'] })
    const rn = await g.directory.resolveUserResourceName('andres.escandon@smlxl.mx')
    expect(rn).toMatch(/^\/\/cloudidentity\.googleapis\.com\/users\//)
    const sub = await g.workspaceEvents.createUserSubscription({ userEmail: 'andres.escandon@smlxl.mx', userResourceName: rn ?? '', eventTypes: [GoogleMeetEventType.CONFERENCE_ENDED], pubsubTopic: 'projects/p/topics/t' })
    expect(sub.expiresAt.getTime() - now().getTime()).toBe(7 * 86_400_000)
    expect((await g.workspaceEvents.getSubscription(sub.subscriptionName, 'andres.escandon@smlxl.mx'))?.state).toBe('ACTIVE')
    const m1 = await g.mail.send({ to: ['a@smlxl.mx'], subject: 'x', html: '<p>x</p>', text: 'x', idempotencyKey: 'k1' })
    const m2 = await g.mail.send({ to: ['a@smlxl.mx'], subject: 'x', html: '<p>x</p>', text: 'x', idempotencyKey: 'k1' })
    expect(m1.skipped).toBe(false)
    expect(m2).toEqual({ messageId: m1.messageId, skipped: true })
    expect(g.mail.sent).toHaveLength(1)
    await g.sheets.upsertRows({ spreadsheetId: 's', sheetName: 'Pendientes', keyColumn: 'UUID', columns: ['UUID', 'Estado'], rows: [{ key: 'a', values: { Estado: 'PENDING' } }] })
    await g.sheets.upsertRows({ spreadsheetId: 's', sheetName: 'Pendientes', keyColumn: 'UUID', columns: ['UUID', 'Estado'], rows: [{ key: 'a', values: { Estado: 'COMPLETED' } }, { key: 'b', values: { Estado: 'PENDING' } }] })
    const snap = g.sheets.snapshot()['s/Pendientes']
    expect(snap?.rows).toEqual([{ UUID: 'a', Estado: 'COMPLETED' }, { UUID: 'b', Estado: 'PENDING' }])
  })

  it('createFakeConferenceEndedEvent produce un CloudEvent por meetingCode', () => {
    const ev = createFakeConferenceEndedEvent('abc-defg-hij', { subscribedUserEmail: 'andres.escandon@smlxl.mx' })
    expect(ev.type).toBe(GoogleMeetEventType.CONFERENCE_ENDED)
    expect(ev.subject).toBe('//meet.googleapis.com/conferenceRecords/fake-alfa-001')
    expect(ev.data).toEqual({ conferenceRecord: { name: 'conferenceRecords/fake-alfa-001' } })
  })
})
