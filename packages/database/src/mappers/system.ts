import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  FEATURE_FLAG_NAMES,
  type AuditLogEntry,
  type CalendarSyncCursor,
  type FeatureFlags,
  type GoogleWorkspaceSubscription,
  type InboundGoogleEvent,
  type LegacyImportReference,
  type PlatformSettings,
  type WeeklyDigest,
  type WeeklyDigestConfig,
} from '@smlxl/domain'
import type {
  AuditLog as AuditRow,
  CalendarSyncCursor as CursorRow,
  GoogleWorkspaceSubscription as SubscriptionRow,
  InboundGoogleEvent as InboundRow,
  LegacyImportReference as LegacyRefRow,
  PlatformSetting as SettingRow,
  Prisma,
  WeeklyDigest as DigestRow,
  WeeklyDigestConfig as DigestConfigRow,
} from '../generated/client/index.js'
import { asRecord, jsonSafe, toJson, toNullableJson } from './common.js'

// Google ---------------------------------------------------------------------

export function toSubscription(row: SubscriptionRow): GoogleWorkspaceSubscription {
  return {
    id: row.id,
    monitoredUserId: row.monitoredUserId,
    monitoredUserEmail: row.monitoredUserEmail,
    googleSubscriptionName: row.googleSubscriptionName,
    targetResource: row.targetResource,
    eventTypes: row.eventTypes,
    expiresAt: row.expiresAt,
    state: row.state,
    lastRenewedAt: row.lastRenewedAt,
    lastErrorCode: row.lastErrorCode,
    lastErrorAt: row.lastErrorAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function subscriptionToDb(
  s: GoogleWorkspaceSubscription,
): Prisma.GoogleWorkspaceSubscriptionUncheckedCreateInput {
  return {
    id: s.id,
    monitoredUserId: s.monitoredUserId,
    monitoredUserEmail: s.monitoredUserEmail,
    googleSubscriptionName: s.googleSubscriptionName,
    targetResource: s.targetResource,
    eventTypes: s.eventTypes,
    expiresAt: s.expiresAt,
    state: s.state,
    lastRenewedAt: s.lastRenewedAt,
    lastErrorCode: s.lastErrorCode,
    lastErrorAt: s.lastErrorAt,
  }
}

export function toInboundEvent(row: InboundRow): InboundGoogleEvent {
  return {
    id: row.id,
    cloudEventId: row.cloudEventId,
    type: row.type,
    source: row.source,
    subject: row.subject,
    occurredAt: row.occurredAt,
    resourceName: row.resourceName,
    rawPayloadRedacted: row.rawPayloadRedacted,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    processingStatus: row.processingStatus,
    attempts: row.attempts,
    lastErrorCode: row.lastErrorCode,
  }
}

export function inboundEventToDb(
  e: InboundGoogleEvent,
): Prisma.InboundGoogleEventUncheckedCreateInput {
  return {
    id: e.id,
    cloudEventId: e.cloudEventId,
    type: e.type,
    source: e.source,
    subject: e.subject,
    occurredAt: e.occurredAt,
    resourceName: e.resourceName,
    rawPayloadRedacted: toJson(e.rawPayloadRedacted),
    receivedAt: e.receivedAt,
    processedAt: e.processedAt,
    processingStatus: e.processingStatus,
    attempts: e.attempts,
    lastErrorCode: e.lastErrorCode,
  }
}

export function toCursor(row: CursorRow): CalendarSyncCursor {
  return {
    id: row.id,
    userId: row.userId,
    calendarId: row.calendarId,
    syncToken: row.syncToken,
    lastFullSyncAt: row.lastFullSyncAt,
    lastIncrementalSyncAt: row.lastIncrementalSyncAt,
    lastError: row.lastError,
  }
}

export function cursorToDb(c: CalendarSyncCursor): Prisma.CalendarSyncCursorUncheckedCreateInput {
  return {
    id: c.id,
    userId: c.userId,
    calendarId: c.calendarId,
    syncToken: c.syncToken,
    lastFullSyncAt: c.lastFullSyncAt,
    lastIncrementalSyncAt: c.lastIncrementalSyncAt,
    lastError: c.lastError,
  }
}

// Digest ---------------------------------------------------------------------

export function toDigestConfig(row: DigestConfigRow): WeeklyDigestConfig {
  return {
    id: row.id,
    enabled: row.enabled,
    timezone: row.timezone,
    dayOfWeek: row.dayOfWeek,
    localTime: row.localTime,
    recipientUserIds: row.recipientUserIds,
    includeAreaIds: row.includeAllAreas ? null : row.includeAreaIds,
    includeExternalTasks: row.includeExternalTasks,
    attachSpreadsheet: row.attachSpreadsheet,
    sendEmail: row.sendEmail,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt,
  }
}

export function digestConfigToDb(
  c: WeeklyDigestConfig,
): Prisma.WeeklyDigestConfigUncheckedCreateInput {
  return {
    id: c.id,
    enabled: c.enabled,
    timezone: c.timezone,
    dayOfWeek: c.dayOfWeek,
    localTime: c.localTime,
    recipientUserIds: c.recipientUserIds,
    includeAreaIds: c.includeAreaIds ?? [],
    includeAllAreas: c.includeAreaIds === null,
    includeExternalTasks: c.includeExternalTasks,
    attachSpreadsheet: c.attachSpreadsheet,
    sendEmail: c.sendEmail,
    createdByUserId: c.createdByUserId,
    updatedByUserId: c.updatedByUserId,
  }
}

export function toDigest(row: DigestRow): WeeklyDigest {
  return {
    id: row.id,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    generatedAt: row.generatedAt,
    audience: row.audience,
    payload: row.payload,
    sentAt: row.sentAt,
    version: row.version,
    recipientEmails: row.recipientEmails,
  }
}

export function digestToDb(d: WeeklyDigest): Prisma.WeeklyDigestUncheckedCreateInput {
  return {
    id: d.id,
    weekStart: d.weekStart,
    weekEnd: d.weekEnd,
    generatedAt: d.generatedAt,
    audience: d.audience,
    payload: toJson(d.payload),
    sentAt: d.sentAt,
    version: d.version,
    recipientEmails: d.recipientEmails,
  }
}

// Auditoría ------------------------------------------------------------------

export function toAuditEntry(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorType: row.actorType,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    before: row.before ?? null,
    after: row.after ?? null,
    source: row.source,
    correlationId: row.correlationId,
    timestamp: row.timestamp,
  }
}

export function auditEntryToDb(e: AuditLogEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    id: e.id,
    actorUserId: e.actorUserId,
    actorType: e.actorType,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    before: toNullableJson(e.before),
    after: toNullableJson(e.after),
    source: e.source,
    correlationId: e.correlationId,
    timestamp: e.timestamp,
  }
}

// Migración legado -----------------------------------------------------------

export function toLegacyRef(row: LegacyRefRow): LegacyImportReference {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    sourceFile: row.sourceFile,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    legacyId: row.legacyId,
    rawPayload: row.rawPayload,
    importBatchId: row.importBatchId,
    importedAt: row.importedAt,
  }
}

export function legacyRefToDb(
  r: LegacyImportReference,
): Prisma.LegacyImportReferenceUncheckedCreateInput {
  return {
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    sourceFile: r.sourceFile,
    sourceSheet: r.sourceSheet,
    sourceRow: r.sourceRow,
    legacyId: r.legacyId,
    rawPayload: toJson(r.rawPayload),
    importBatchId: r.importBatchId,
    importedAt: r.importedAt,
  }
}

// Configuración --------------------------------------------------------------

export interface SettingsDefaults {
  featureFlags: FeatureFlags
  companyTimezone: string
  companyDomain: string
}

/** Defaults del entorno + overrides persistidos en BD (la BD gana campo a campo). */
export function toPlatformSettings(
  row: SettingRow | null,
  defaults: SettingsDefaults,
): PlatformSettings {
  const flags: FeatureFlags = { ...defaults.featureFlags }
  const thresholds = { ...DEFAULT_CONFIDENCE_THRESHOLDS }
  if (row) {
    const flagOverrides = asRecord(row.featureFlags)
    for (const name of FEATURE_FLAG_NAMES) {
      const v = flagOverrides[name]
      if (typeof v === 'boolean') flags[name] = v
    }
    const t = asRecord(row.confidenceThresholds)
    if (typeof t.autoAccept === 'number') thresholds.autoAccept = t.autoAccept
    if (typeof t.proposal === 'number') thresholds.proposal = t.proposal
  }
  return {
    featureFlags: flags,
    confidenceThresholds: thresholds,
    companyTimezone: row?.companyTimezone ?? defaults.companyTimezone,
    companyDomain: row?.companyDomain ?? defaults.companyDomain,
    rawTranscriptRetentionDays: row?.rawTranscriptRetentionDays ?? null,
    autoCaptureEnabled: row?.autoCaptureEnabled ?? true,
    monitoredUserEmails: row?.monitoredUserEmails ?? [],
  }
}

export function platformSettingsToDb(
  s: PlatformSettings,
  updatedByUserId: string | null,
): Omit<Prisma.PlatformSettingUncheckedCreateInput, 'id'> {
  return {
    featureFlags: jsonSafe(s.featureFlags),
    confidenceThresholds: jsonSafe(s.confidenceThresholds),
    companyTimezone: s.companyTimezone,
    companyDomain: s.companyDomain,
    rawTranscriptRetentionDays: s.rawTranscriptRetentionDays,
    autoCaptureEnabled: s.autoCaptureEnabled,
    monitoredUserEmails: s.monitoredUserEmails,
    updatedByUserId,
  }
}
