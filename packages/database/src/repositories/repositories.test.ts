import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  AiAnalysisStatus,
  ArtifactStatus,
  ConfidentialityLevel,
  DEFAULT_NOTIFICATION_PREFERENCES,
  InboundEventProcessingStatus,
  MeetingProcessingStatus,
  MeetingSource,
  MeetingStatus,
  MigrationTrust,
  ParticipantType,
  UserRole,
  zonedDateTime,
  zonedParts,
  type ActionItem,
  type InboundGoogleEvent,
  type Meeting,
  type User,
} from '@smlxl/domain'
import {
  createPrismaClient,
  createRepositories,
  PrismaUnitOfWork,
  type PrismaClient,
  type RepositoryDefaults,
} from '../index.js'

const DATABASE_URL = process.env.DATABASE_URL
const TAG = `it-${randomUUID().slice(0, 8)}`
const TZ = 'America/Mexico_City'

const defaults: RepositoryDefaults = {
  featureFlags: {
    GOOGLE_INTEGRATION_ENABLED: false,
    GOOGLE_MEET_EVENTS_ENABLED: false,
    AI_PROCESSING_ENABLED: false,
    AI_COMPLETION_PROPOSALS_ENABLED: true,
    GMAIL_NOTIFICATIONS_ENABLED: false,
    SHEETS_SYNC_ENABLED: false,
    WEEKLY_DIGEST_ENABLED: true,
  },
  companyTimezone: TZ,
  companyDomain: 'smlxl.mx',
}

function makeUser(suffix: string): User {
  const now = new Date()
  return {
    id: randomUUID(),
    googleUserId: null,
    email: `${TAG}-${suffix}@smlxl.mx`,
    displayName: `Usuario ${TAG} ${suffix}`,
    role: UserRole.MEMBER,
    areaId: null,
    managerId: null,
    active: true,
    monitored: false,
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    createdAt: now,
    updatedAt: now,
  }
}

function makeMeeting(partial: Partial<Meeting> & { title: string; startAt: Date }): Meeting {
  const now = new Date()
  return {
    id: randomUUID(),
    googleConferenceRecordId: null,
    googleMeetingSpaceId: null,
    googleMeetingCode: null,
    googleCalendarEventId: null,
    organizerUserId: null,
    organizerEmail: null,
    isExternalHost: false,
    endAt: null,
    durationSeconds: null,
    status: MeetingStatus.ENDED,
    source: MeetingSource.WORKSPACE_EVENT,
    processingStatus: MeetingProcessingStatus.COMPLETED,
    transcriptStatus: ArtifactStatus.INGESTED,
    smartNotesStatus: ArtifactStatus.UNAVAILABLE,
    aiAnalysisStatus: AiAnalysisStatus.SUCCEEDED,
    confidentialityLevel: ConfidentialityLevel.NORMAL,
    excludedFromAi: false,
    reportedLanguageCode: 'es-MX',
    detectedLanguageCode: null,
    mixedLanguageDetected: false,
    lastErrorCode: null,
    lastErrorAt: null,
    areaId: null,
    projectId: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

function makeItem(partial: Partial<ActionItem> & { title: string }): ActionItem {
  const now = new Date()
  return {
    id: randomUUID(),
    externalKey: '',
    description: null,
    type: ActionItemType.ONE_OFF,
    ownerUserId: null,
    externalAssigneeId: null,
    ownerTextOriginal: null,
    collaboratorUserIds: [],
    areaId: null,
    projectId: null,
    createdFromMeetingId: null,
    latestMeetingId: null,
    status: ActionItemStatus.PENDING,
    priority: ActionItemPriority.MEDIUM,
    dueDate: null,
    dueDateTextOriginal: null,
    dateConfidence: null,
    startDate: null,
    completedAt: null,
    cancelledAt: null,
    confidence: null,
    requiresReview: false,
    sourceEvidence: [],
    recurrence: null,
    parentActionItemId: null,
    blocker: null,
    tags: [TAG],
    migrationTrust: MigrationTrust.PLATFORM,
    legacyId: null,
    lastMentionedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

describe.skipIf(!DATABASE_URL)('Repositorios Prisma (integración)', () => {
  let client: PrismaClient
  let repos: ReturnType<typeof createRepositories>
  let owner: User
  let collaborator: User

  beforeAll(async () => {
    client = createPrismaClient(DATABASE_URL)
    repos = createRepositories(client, defaults)
    owner = await repos.users.save(makeUser('owner'))
    collaborator = await repos.users.save(makeUser('collab'))
  })

  afterAll(async () => {
    await client.actionItem.deleteMany({ where: { tags: { has: TAG } } })
    await client.meeting.deleteMany({ where: { title: { startsWith: TAG } } })
    await client.inboundGoogleEvent.deleteMany({ where: { cloudEventId: { startsWith: TAG } } })
    await client.user.deleteMany({ where: { email: { startsWith: TAG } } })
    await client.$disconnect()
  })

  it('crea action items con externalKey secuencial único y colaboradores', async () => {
    const a = await repos.actionItems.save(
      makeItem({ title: `${TAG} tarea A`, ownerUserId: owner.id }),
    )
    const b = await repos.actionItems.save(
      makeItem({ title: `${TAG} tarea B`, collaboratorUserIds: [collaborator.id] }),
    )
    expect(a.externalKey).toMatch(/^ACT-\d{6}$/)
    expect(b.externalKey).toMatch(/^ACT-\d{6}$/)
    expect(a.externalKey).not.toBe(b.externalKey)
    expect(b.collaboratorUserIds).toEqual([collaborator.id])

    const byKey = await repos.actionItems.findByExternalKey(a.externalKey)
    expect(byKey?.id).toBe(a.id)

    // Actualización: la clave se conserva y los colaboradores se sincronizan.
    const updated = await repos.actionItems.save({
      ...b,
      collaboratorUserIds: [],
      title: `${TAG} tarea B2`,
    })
    expect(updated.externalKey).toBe(b.externalKey)
    expect(updated.collaboratorUserIds).toEqual([])
  })

  it('persiste dueDate como fecha calendario en la zona de la empresa', async () => {
    const p = zonedParts(new Date(), TZ)
    const localMidnight = zonedDateTime(p.year, p.month, p.day, 0, 0, 0, TZ)
    const item = await repos.actionItems.save(
      makeItem({ title: `${TAG} tarea con fecha`, dueDate: localMidnight }),
    )
    expect(item.dueDate?.getTime()).toBe(localMidnight.getTime())
  })

  it('full-text en español encuentra por raíz y respeta openOnly', async () => {
    const open = await repos.actionItems.save(
      makeItem({
        title: `${TAG} Revisar anexo de penalizaciones del contrato`,
        status: ActionItemStatus.PENDING,
      }),
    )
    const closed = await repos.actionItems.save(
      makeItem({
        title: `${TAG} Penalizaciones del contrato ya revisadas`,
        status: ActionItemStatus.COMPLETED,
        completedAt: new Date(),
      }),
    )
    const all = await repos.actionItems.searchFullText('penalizaciones contrato', {
      openOnly: false,
      limit: 20,
    })
    const allIds = all.map((i) => i.id)
    expect(allIds).toContain(open.id)
    expect(allIds).toContain(closed.id)

    const onlyOpen = await repos.actionItems.searchFullText('penalizaciones contrato', {
      openOnly: true,
      limit: 20,
    })
    const openIds = onlyOpen.map((i) => i.id)
    expect(openIds).toContain(open.id)
    expect(openIds).not.toContain(closed.id)
  })

  it('list aplica overdueOnly, noOwner, noDueDate y visibleToUserId', async () => {
    const p = zonedParts(new Date(), TZ)
    const yesterday = zonedDateTime(p.year, p.month, p.day - 1, 0, 0, 0, TZ)
    const tomorrow = zonedDateTime(p.year, p.month, p.day + 1, 0, 0, 0, TZ)
    const overdue = await repos.actionItems.save(
      makeItem({ title: `${TAG} vencida`, dueDate: yesterday, ownerUserId: owner.id }),
    )
    const future = await repos.actionItems.save(
      makeItem({ title: `${TAG} futura`, dueDate: tomorrow }),
    )
    const done = await repos.actionItems.save(
      makeItem({
        title: `${TAG} cerrada vencida`,
        dueDate: yesterday,
        status: ActionItemStatus.COMPLETED,
      }),
    )

    const overdueList = await repos.actionItems.list(
      { tags: [TAG], overdueOnly: true },
      { page: 1, pageSize: 50 },
    )
    const ids = overdueList.items.map((i) => i.id)
    expect(ids).toContain(overdue.id)
    expect(ids).not.toContain(future.id)
    expect(ids).not.toContain(done.id)

    const noOwner = await repos.actionItems.list(
      { tags: [TAG], noOwner: true },
      { page: 1, pageSize: 50 },
    )
    expect(
      noOwner.items.every((i) => i.ownerUserId === null && i.externalAssigneeId === null),
    ).toBe(true)
    expect(noOwner.items.map((i) => i.id)).toContain(future.id)

    const noDue = await repos.actionItems.list(
      { tags: [TAG], noDueDate: true },
      { page: 1, pageSize: 50 },
    )
    expect(noDue.items.every((i) => i.dueDate === null)).toBe(true)

    const visible = await repos.actionItems.list(
      { tags: [TAG], visibleToUserId: owner.id },
      { page: 1, pageSize: 50 },
    )
    expect(visible.items.map((i) => i.id)).toContain(overdue.id)
    expect(visible.items.map((i) => i.id)).not.toContain(future.id)
  })

  it('insertIfAbsent es idempotente por cloudEventId', async () => {
    const event: InboundGoogleEvent = {
      id: randomUUID(),
      cloudEventId: `${TAG}-evt-1`,
      type: 'google.workspace.meet.conference.v2.ended',
      source: '//meet.googleapis.com',
      subject: null,
      occurredAt: new Date(),
      resourceName: 'conferenceRecords/abc',
      rawPayloadRedacted: { ok: true },
      receivedAt: new Date(),
      processedAt: null,
      processingStatus: InboundEventProcessingStatus.RECEIVED,
      attempts: 0,
      lastErrorCode: null,
    }
    const first = await repos.inboundEvents.insertIfAbsent(event)
    const second = await repos.inboundEvents.insertIfAbsent({ ...event, id: randomUUID() })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.event.id).toBe(first.event.id)
  })

  it('filtra reuniones por participante, processed, withActionItems y search', async () => {
    const withItems = await repos.meetings.save(
      makeMeeting({
        title: `${TAG} Seguimiento contrato`,
        startAt: new Date(Date.now() - 3600_000),
      }),
    )
    const pending = await repos.meetings.save(
      makeMeeting({
        title: `${TAG} Pendiente de artefactos`,
        startAt: new Date(),
        processingStatus: MeetingProcessingStatus.WAITING_FOR_ARTIFACTS,
        status: MeetingStatus.SCHEDULED,
        transcriptStatus: ArtifactStatus.PENDING,
        aiAnalysisStatus: AiAnalysisStatus.NOT_STARTED,
      }),
    )
    await repos.meetings.replaceParticipants(withItems.id, [
      {
        id: randomUUID(),
        meetingId: withItems.id,
        internalUserId: owner.id,
        googleParticipantId: null,
        displayName: owner.displayName,
        email: owner.email,
        participantType: ParticipantType.SIGNED_IN_USER,
        isInternal: true,
        joinedAt: null,
        leftAt: null,
        speakingDurationSeconds: null,
      },
    ])
    await repos.actionItems.save(
      makeItem({ title: `${TAG} tarea de reunión`, createdFromMeetingId: withItems.id }),
    )

    const byParticipant = await repos.meetings.list(
      { participantUserId: owner.id, search: TAG },
      { page: 1, pageSize: 20 },
    )
    expect(byParticipant.items.map((m) => m.id)).toEqual([withItems.id])

    const processed = await repos.meetings.list(
      { processed: true, search: TAG },
      { page: 1, pageSize: 20 },
    )
    expect(processed.items.map((m) => m.id)).toContain(withItems.id)
    expect(processed.items.map((m) => m.id)).not.toContain(pending.id)

    const withActions = await repos.meetings.list(
      { withActionItems: true, search: TAG },
      { page: 1, pageSize: 20 },
    )
    expect(withActions.items.map((m) => m.id)).toEqual([withItems.id])
    expect(await repos.meetings.countActionItems(withItems.id)).toBe(1)

    const visible = await repos.meetings.list(
      { visibleToUserId: owner.id, search: TAG },
      { page: 1, pageSize: 20 },
    )
    expect(visible.items.map((m) => m.id)).toEqual([withItems.id])
  })

  it('la unidad de trabajo revierte todo si la función lanza', async () => {
    const uow = new PrismaUnitOfWork(client, defaults)
    const title = `${TAG} rollback`
    await expect(
      uow.run(async (tx) => {
        await tx.actionItems.save(makeItem({ title }))
        throw new Error('fallo simulado')
      }),
    ).rejects.toThrow('fallo simulado')
    const after = await repos.actionItems.list(
      { tags: [TAG], search: 'rollback' },
      { page: 1, pageSize: 10 },
    )
    expect(after.items.find((i) => i.title === title)).toBeUndefined()

    const created = await uow.run(async (tx) =>
      tx.actionItems.save(makeItem({ title: `${TAG} commit` })),
    )
    expect((await repos.actionItems.findById(created.id))?.title).toBe(`${TAG} commit`)
  })

  it('settings mezcla defaults del entorno con overrides de BD', async () => {
    const settings = await repos.settings.get()
    expect(settings.companyTimezone).toBeTruthy()
    expect(typeof settings.featureFlags.WEEKLY_DIGEST_ENABLED).toBe('boolean')
    expect(settings.confidenceThresholds.autoAccept).toBeGreaterThan(
      settings.confidenceThresholds.proposal,
    )
  })
})
