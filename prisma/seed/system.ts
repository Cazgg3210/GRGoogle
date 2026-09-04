import {
  ALL_GOOGLE_MEET_EVENT_TYPES,
  ActionItemStatus,
  DigestAudience,
  GoogleMeetEventType,
  InboundEventProcessingStatus,
  MeetingProcessingStatus,
  OPEN_ACTION_ITEM_STATUSES,
  SubscriptionState,
  daysBetween,
  type FeatureFlags,
} from '@smlxl/domain'
import { jsonSafe, type PrismaClient } from '../../packages/database/src/index.js'
import { ITEMS, itemId, type ActionItemsResult } from './action-items.js'
import { MONITORED_EMAILS, USERS, type Catalogs } from './catalogs.js'
import {
  NOW,
  TZ,
  addMinutes,
  daysAgo,
  hoursFromNow,
  lastIsoWeek,
  stableId,
  ymd,
} from './helpers.js'
import type { MeetingKey, MeetingsResult } from './meetings.js'

const DEFAULT_FLAGS: FeatureFlags = {
  GOOGLE_INTEGRATION_ENABLED: false,
  GOOGLE_MEET_EVENTS_ENABLED: false,
  AI_PROCESSING_ENABLED: false,
  AI_COMPLETION_PROPOSALS_ENABLED: true,
  GMAIL_NOTIFICATIONS_ENABLED: false,
  SHEETS_SYNC_ENABLED: false,
  WEEKLY_DIGEST_ENABLED: true,
}

export async function seedSystem(
  db: PrismaClient,
  cat: Catalogs,
  m: MeetingsResult,
  items: ActionItemsResult,
): Promise<Record<string, number>> {
  const counts = {
    platformSettings: 0,
    digestConfigs: 0,
    digests: 0,
    subscriptions: 0,
    calendarCursors: 0,
    inboundEvents: 0,
    auditLogs: 0,
    legacyBatches: 0,
    legacyReferences: 0,
  }

  // --- Configuración de plataforma ----------------------------------------
  const settingsData = {
    featureFlags: jsonSafe(DEFAULT_FLAGS),
    confidenceThresholds: { autoAccept: 0.9, proposal: 0.7 },
    companyTimezone: TZ,
    companyDomain: 'smlxl.mx',
    rawTranscriptRetentionDays: null,
    autoCaptureEnabled: true,
    monitoredUserEmails: MONITORED_EMAILS,
    updatedByUserId: cat.users.gestora,
  }
  await db.platformSetting.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...settingsData },
    update: settingsData,
  })
  counts.platformSettings++

  // --- Digest semanal: configuración + digest de la semana pasada ----------
  const digestConfigId = stableId('digest-config:default')
  const digestConfigData = {
    enabled: true,
    timezone: TZ,
    dayOfWeek: 5,
    localTime: '18:00',
    recipientUserIds: [cat.users.direccion, cat.users.gestora],
    includeAreaIds: [] as string[],
    includeAllAreas: true,
    includeExternalTasks: true,
    attachSpreadsheet: false,
    sendEmail: true,
    createdByUserId: cat.users.gestora,
    updatedByUserId: cat.users.gestora,
  }
  await db.weeklyDigestConfig.upsert({
    where: { id: digestConfigId },
    create: { id: digestConfigId, ...digestConfigData },
    update: digestConfigData,
  })
  counts.digestConfigs++

  const week = lastIsoWeek()
  const weekMeetings = await db.meeting.findMany({
    where: { startAt: { gte: week.weekStart, lte: week.weekEnd } },
    select: {
      id: true,
      title: true,
      processingStatus: true,
      transcriptStatus: true,
      smartNotesStatus: true,
      isExternalHost: true,
    },
  })
  const processedStatuses: MeetingProcessingStatus[] = [
    MeetingProcessingStatus.ANALYZED,
    MeetingProcessingStatus.REVIEW_REQUIRED,
    MeetingProcessingStatus.COMPLETED,
  ]
  const usableArtifacts = new Set(['AVAILABLE', 'INGESTED'])
  const allItems = await db.actionItem.findMany({
    include: {
      owner: { select: { displayName: true } },
      area: { select: { name: true } },
      project: { select: { canonicalName: true } },
    },
    orderBy: { sequence: 'asc' },
  })
  const openStatuses = new Set<string>(OPEN_ACTION_ITEM_STATUSES)
  const today = ymd(NOW)
  const inWeek = (d: Date | null): boolean => !!d && d >= week.weekStart && d <= week.weekEnd
  const newItems = allItems.filter((i) => inWeek(i.createdAt))
  const overdue = allItems.filter(
    (i) => i.dueDate && openStatuses.has(i.status) && ymd(i.dueDate) < today,
  )
  const noDate = allItems.filter((i) => !i.dueDate && openStatuses.has(i.status))
  const noOwner = allItems.filter(
    (i) => !i.ownerUserId && !i.externalAssigneeId && openStatuses.has(i.status),
  )
  const blocked = allItems.filter((i) => i.status === ActionItemStatus.BLOCKED)
  const proposals = allItems.filter((i) => i.status === ActionItemStatus.COMPLETION_PROPOSED)
  const completedInWeek = allItems.filter(
    (i) => i.status === ActionItemStatus.COMPLETED && inWeek(i.completedAt),
  )
  const backlog = allItems.filter((i) => openStatuses.has(i.status) && i.createdAt < week.weekStart)
  const mentionCounts = await db.actionItemMeetingLink.groupBy({
    by: ['actionItemId'],
    where: { relationType: 'MENTIONED' },
    _count: { _all: true },
  })
  const repeated = mentionCounts.filter((c) => c._count._all >= 2).map((c) => c.actionItemId)
  const brief = (i: (typeof allItems)[number]): Record<string, unknown> => ({
    key: i.externalKey,
    title: i.title,
    owner: i.owner?.displayName ?? i.ownerTextOriginal ?? null,
    area: i.area?.name ?? null,
    project: i.project?.canonicalName ?? null,
    priority: i.priority,
    status: i.status,
    dueDate: i.dueDate ? ymd(i.dueDate) : null,
  })
  const digestPayload = {
    weekLabel: week.label,
    weekStart: ymd(week.weekStart),
    weekEnd: ymd(week.weekEnd),
    sections: {
      A_resumenEjecutivo: {
        reunionesDetectadas: weekMeetings.length,
        reunionesProcesadas: weekMeetings.filter((x) =>
          processedStatuses.includes(x.processingStatus),
        ).length,
        reunionesSinArtefactos: weekMeetings.filter(
          (x) =>
            !usableArtifacts.has(x.transcriptStatus) && !usableArtifacts.has(x.smartNotesStatus),
        ).length,
        reunionesConError: weekMeetings.filter(
          (x) => x.processingStatus === MeetingProcessingStatus.FAILED,
        ).length,
        tareasNuevas: newItems.length,
        propuestasDeCierrePendientes: proposals.length,
        tareasCompletadas: completedInWeek.length,
        tareasVencidas: overdue.length,
        tareasSinFecha: noDate.length,
        tareasBloqueadas: blocked.length,
      },
      B_nuevosCompromisos: newItems.map(brief),
      C_backlogAcumulado: backlog.map((i) => ({
        ...brief(i),
        diasAbierta: daysBetween(i.createdAt, NOW),
        ultimaMencion: i.lastMentionedAt ? ymd(i.lastMentionedAt) : null,
      })),
      D_riesgos: {
        vencidas: overdue.map(brief),
        sinResponsable: noOwner.map(brief),
        sinFecha: noDate.map(brief),
        bloqueadas: blocked.map((i) => ({ ...brief(i), blocker: i.blocker })),
        repetidasVariasReuniones: allItems.filter((i) => repeated.includes(i.id)).map(brief),
        reunionesNoCapturadas: weekMeetings
          .filter((x) => x.isExternalHost || x.processingStatus === MeetingProcessingStatus.FAILED)
          .map((x) => ({
            title: x.title,
            motivo: x.isExternalHost ? 'Organizador externo' : 'Artefactos no disponibles',
          })),
      },
      E_cambiosDetectados: [
        {
          key: 'ACT-000001',
          tipo: 'FECHA_PROPUESTA',
          detalle: 'Nueva fecha sugerida por IA: próximo martes',
        },
        {
          key: 'ACT-000002',
          tipo: 'POSIBLE_FINALIZACION',
          detalle: 'Propuesta de cierre generada desde "Seguimiento contrato Cliente Alfa"',
        },
        {
          key: 'ACT-000006',
          tipo: 'POSIBLE_DUPLICADO',
          detalle: 'Coincidencia con compromiso extraído del comité',
        },
      ],
      F_bandejaAprobacion: proposals.map((i) => ({ ...brief(i), url: `/action-items/${i.id}` })),
      G_proximaSemana: {
        vencimientosProximos: allItems
          .filter(
            (i) =>
              i.dueDate &&
              openStatuses.has(i.status) &&
              ymd(i.dueDate) >= today &&
              daysBetween(NOW, i.dueDate) <= 7,
          )
          .map(brief),
        altaPrioridad: allItems
          .filter(
            (i) => openStatuses.has(i.status) && (i.priority === 'HIGH' || i.priority === 'URGENT'),
          )
          .map(brief),
        recurrentes: allItems.filter((i) => i.type === 'RECURRING').map(brief),
      },
    },
  }
  const digestId = stableId('digest:executive:last-week')
  const digestData = {
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    generatedAt: new Date(week.weekEnd.getTime() - 30 * 3600_000),
    audience: DigestAudience.EXECUTIVE,
    payload: jsonSafe(digestPayload),
    sentAt: new Date(week.weekEnd.getTime() - 30 * 3600_000 + 60_000),
    version: 1,
    recipientEmails: [cat.userEmails.direccion, cat.userEmails.gestora],
  }
  await db.weeklyDigest.upsert({
    where: { id: digestId },
    create: { id: digestId, ...digestData },
    update: digestData,
  })
  counts.digests++

  // --- Estado de integración Google (fake) ---------------------------------
  for (const u of USERS) {
    const subId = stableId(`subscription:${u.key}`)
    const subData = {
      monitoredUserId: cat.users[u.key],
      monitoredUserEmail: u.email,
      googleSubscriptionName: `subscriptions/fake-${u.key}`,
      targetResource: `//cloudidentity.googleapis.com/users/fake-google-${u.key}`,
      eventTypes: [...ALL_GOOGLE_MEET_EVENT_TYPES],
      expiresAt: daysAgo(-5),
      state: SubscriptionState.ACTIVE,
      lastRenewedAt: daysAgo(2),
      lastErrorCode: null,
      lastErrorAt: null,
    }
    await db.googleWorkspaceSubscription.upsert({
      where: { monitoredUserId: cat.users[u.key] },
      create: { id: subId, ...subData },
      update: subData,
    })
    counts.subscriptions++

    const cursorData = {
      userId: cat.users[u.key],
      calendarId: 'primary',
      syncToken: `fake-sync-token-${u.key}`,
      lastFullSyncAt: daysAgo(7),
      lastIncrementalSyncAt: hoursFromNow(-1),
      lastError: null,
    }
    await db.calendarSyncCursor.upsert({
      where: { userId_calendarId: { userId: cat.users[u.key], calendarId: 'primary' } },
      create: { id: stableId(`cursor:${u.key}`), ...cursorData },
      update: cursorData,
    })
    counts.calendarCursors++
  }

  const inboundEvents: Array<{ meeting: MeetingKey; type: string; minutesAfterStart: number }> = [
    { meeting: 'alfa', type: GoogleMeetEventType.CONFERENCE_STARTED, minutesAfterStart: 0 },
    { meeting: 'alfa', type: GoogleMeetEventType.TRANSCRIPT_STARTED, minutesAfterStart: 1 },
    { meeting: 'alfa', type: GoogleMeetEventType.CONFERENCE_ENDED, minutesAfterStart: 42 },
    { meeting: 'alfa', type: GoogleMeetEventType.TRANSCRIPT_FILE_GENERATED, minutesAfterStart: 47 },
    { meeting: 'alfa', type: GoogleMeetEventType.SMART_NOTE_FILE_GENERATED, minutesAfterStart: 48 },
    { meeting: 'comite', type: GoogleMeetEventType.CONFERENCE_ENDED, minutesAfterStart: 55 },
    {
      meeting: 'comite',
      type: GoogleMeetEventType.TRANSCRIPT_FILE_GENERATED,
      minutesAfterStart: 61,
    },
    {
      meeting: 'kickoffBeta',
      type: GoogleMeetEventType.TRANSCRIPT_FILE_GENERATED,
      minutesAfterStart: 66,
    },
    { meeting: 'syncOps', type: GoogleMeetEventType.CONFERENCE_STARTED, minutesAfterStart: 0 },
    { meeting: 'syncOps', type: GoogleMeetEventType.CONFERENCE_ENDED, minutesAfterStart: 30 },
  ]
  for (const [i, e] of inboundEvents.entries()) {
    const resourceName = `conferenceRecords/fake-${e.meeting}`
    const occurredAt = addMinutes(m.starts[e.meeting], e.minutesAfterStart)
    const cloudEventId = `fake-evt-${e.meeting}-${i}`
    const eventData = {
      type: e.type,
      source: '//meet.googleapis.com',
      subject: resourceName,
      occurredAt,
      resourceName,
      rawPayloadRedacted: {
        conferenceRecord: { name: resourceName },
        redacted: true,
        meetingId: m.ids[e.meeting],
      },
      receivedAt: addMinutes(occurredAt, 1),
      processedAt: addMinutes(occurredAt, 2),
      processingStatus: InboundEventProcessingStatus.PROCESSED,
      attempts: 1,
      lastErrorCode: null,
    }
    await db.inboundGoogleEvent.upsert({
      where: { cloudEventId },
      create: { id: stableId(`inbound:${cloudEventId}`), cloudEventId, ...eventData },
      update: eventData,
    })
    counts.inboundEvents++
  }

  // --- Auditoría -------------------------------------------------------------
  type AuditDef = {
    key: string
    actor: keyof Catalogs['users'] | null
    actorType: 'USER' | 'SYSTEM' | 'AI' | 'IMPORT'
    action: string
    entity: string
    entityId: string
    before: unknown
    after: unknown
    source: string
    ago: number
  }
  const audits: AuditDef[] = []
  const approvals: Array<{ seq: number; by: keyof Catalogs['users']; ago: number }> = [
    { seq: 5, by: 'direccion', ago: 1 },
    { seq: 8, by: 'direccion', ago: 3 },
    { seq: 15, by: 'gestora', ago: 5 },
    { seq: 16, by: 'gestora', ago: 4 },
    { seq: 18, by: 'direccion', ago: 25 },
    { seq: 26, by: 'direccion', ago: 18 },
    { seq: 27, by: 'direccion', ago: 12 },
    { seq: 43, by: 'direccion', ago: 8 },
    { seq: 45, by: 'gestora', ago: 2 },
  ]
  for (const a of approvals) {
    audits.push({
      key: `approve:${a.seq}`,
      actor: a.by,
      actorType: 'USER',
      action: 'COMPLETION_PROPOSAL_APPROVED',
      entity: 'ActionItem',
      entityId: itemId(a.seq),
      before: { status: ActionItemStatus.COMPLETION_PROPOSED },
      after: { status: ActionItemStatus.COMPLETED },
      source: 'web',
      ago: a.ago,
    })
  }
  const statusChanges: Array<{
    seq: number
    by: keyof Catalogs['users']
    from: ActionItemStatus
    to: ActionItemStatus
    ago: number
  }> = [
    {
      seq: 6,
      by: 'direccion',
      from: ActionItemStatus.PENDING,
      to: ActionItemStatus.IN_PROGRESS,
      ago: 1,
    },
    {
      seq: 9,
      by: 'operaciones',
      from: ActionItemStatus.IN_PROGRESS,
      to: ActionItemStatus.BLOCKED,
      ago: 6,
    },
    {
      seq: 25,
      by: 'finanzas',
      from: ActionItemStatus.PENDING,
      to: ActionItemStatus.BLOCKED,
      ago: 12,
    },
    { seq: 46, by: 'andres', from: ActionItemStatus.PENDING, to: ActionItemStatus.BLOCKED, ago: 9 },
    {
      seq: 41,
      by: 'finanzas',
      from: ActionItemStatus.PENDING,
      to: ActionItemStatus.CANCELLED,
      ago: 4,
    },
  ]
  for (const s of statusChanges) {
    audits.push({
      key: `status:${s.seq}`,
      actor: s.by,
      actorType: 'USER',
      action: 'ACTION_ITEM_STATUS_CHANGED',
      entity: 'ActionItem',
      entityId: itemId(s.seq),
      before: { status: s.from },
      after: { status: s.to },
      source: 'web',
      ago: s.ago,
    })
  }
  audits.push(
    {
      key: 'settings',
      actor: 'gestora',
      actorType: 'USER',
      action: 'PLATFORM_SETTINGS_UPDATED',
      entity: 'PlatformSetting',
      entityId: 'default',
      before: { autoCaptureEnabled: false },
      after: { autoCaptureEnabled: true, monitoredUserEmails: MONITORED_EMAILS.length },
      source: 'web',
      ago: 14,
    },
    {
      key: 'exclude-meeting',
      actor: 'direccion',
      actorType: 'USER',
      action: 'MEETING_EXCLUDED_FROM_AI',
      entity: 'Meeting',
      entityId: m.ids.entrevista,
      before: { excludedFromAi: false, processingStatus: 'DISCOVERED' },
      after: { excludedFromAi: true, processingStatus: 'EXCLUDED' },
      source: 'web',
      ago: 4,
    },
    {
      key: 'ai-review-created',
      actor: null,
      actorType: 'AI',
      action: 'AI_REVIEW_ITEM_CREATED',
      entity: 'AiReviewItem',
      entityId: stableId('review:alfa-carta'),
      before: null,
      after: { reconcileDecision: 'LINK_EXISTING', candidateActionItemId: itemId(1) },
      source: 'worker',
      ago: 3,
    },
    {
      key: 'ai-proposal-created',
      actor: null,
      actorType: 'AI',
      action: 'COMPLETION_PROPOSAL_CREATED',
      entity: 'CompletionProposal',
      entityId: stableId('proposal:ai:licencias'),
      before: null,
      after: { actionItemId: itemId(2), confidence: 0.86 },
      source: 'worker',
      ago: 3,
    },
    {
      key: 'digest-sent',
      actor: null,
      actorType: 'SYSTEM',
      action: 'WEEKLY_DIGEST_SENT',
      entity: 'WeeklyDigest',
      entityId: digestId,
      before: null,
      after: { recipients: 2, week: week.label },
      source: 'worker',
      ago: daysBetween(week.weekEnd, NOW) + 1,
    },
    {
      key: 'legacy-import',
      actor: 'gestora',
      actorType: 'IMPORT',
      action: 'LEGACY_IMPORT_COMMITTED',
      entity: 'LegacyImportBatch',
      entityId: stableId('legacy-batch:seed'),
      before: null,
      after: { imported: ITEMS.filter((i) => i.legacyId).length },
      source: 'cli',
      ago: 30,
    },
    {
      key: 'meeting-failed',
      actor: null,
      actorType: 'SYSTEM',
      action: 'MEETING_PROCESSING_FAILED',
      entity: 'Meeting',
      entityId: m.ids.syncOps,
      before: { processingStatus: 'WAITING_FOR_ARTIFACTS' },
      after: { processingStatus: 'FAILED', lastErrorCode: 'GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE' },
      source: 'worker',
      ago: 1,
    },
  )
  for (const [i, a] of audits.entries()) {
    const auditId = stableId(`audit:${a.key}`)
    const auditData = {
      actorUserId: a.actor ? cat.users[a.actor] : null,
      actorType: a.actorType,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      before: a.before === null ? undefined : jsonSafe(a.before),
      after: a.after === null ? undefined : jsonSafe(a.after),
      source: a.source,
      correlationId: `corr-seed-${String(i + 1).padStart(3, '0')}`,
      timestamp: daysAgo(a.ago),
    }
    await db.auditLog.upsert({
      where: { id: auditId },
      create: { id: auditId, ...auditData },
      update: auditData,
    })
    counts.auditLogs++
  }

  // --- Lote de migración legado (traza de los items con legacyId) ----------
  const legacyItems = ITEMS.filter((i) => i.legacyId)
  const batchId = stableId('legacy-batch:seed')
  const batchReport = {
    mode: 'commit',
    imported: legacyItems.length,
    skipped: 0,
    note: 'Lote demostrativo del seed',
  }
  const batchData = {
    sourceFile: 'seed-demo-legado.xlsx',
    mode: 'commit',
    startedAt: daysAgo(30),
    finishedAt: addMinutes(daysAgo(30), 2),
    report: jsonSafe(batchReport),
  }
  await db.legacyImportBatch.upsert({
    where: { id: batchId },
    create: { id: batchId, ...batchData },
    update: batchData,
  })
  counts.legacyBatches++
  for (const [i, it] of legacyItems.entries()) {
    const refId = stableId(`legacy-ref:${it.seq}`)
    const sheet = it.area ? cat.areaNames[it.area] : 'Dirección General'
    const refData = {
      entityType: 'ActionItem',
      entityId: items.ids[it.seq] ?? itemId(it.seq),
      sourceFile: 'seed-demo-legado.xlsx',
      sourceSheet: sheet,
      sourceRow: i + 2,
      legacyId: it.legacyId ?? null,
      rawPayload: {
        ID: it.legacyId,
        Pendiente: it.title,
        Responsable: it.ownerText ?? (it.owner ? cat.userNames[it.owner] : ''),
        Departamento: sheet,
        Status: it.status,
      },
      importBatchId: batchId,
      importedAt: addMinutes(daysAgo(30), 1),
    }
    await db.legacyImportReference.upsert({
      where: { id: refId },
      create: { id: refId, ...refData },
      update: refData,
    })
    counts.legacyReferences++
  }

  return counts
}
