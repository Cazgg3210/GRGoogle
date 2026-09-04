import type {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  AiAnalysisStatus,
  AiReviewItemStatus,
  AiReviewReason,
  ArtifactStatus,
  CompletionProposalStatus,
  ConfidentialityLevel,
  DecisionStatus,
  DigestAudience,
  InboundEventProcessingStatus,
  MeetingProcessingStatus,
  MeetingSource,
  MeetingStatus,
  MigrationTrust,
  ParticipantType,
  ProposedByType,
  ReconcileDecision,
  RelationType,
  SubscriptionState,
  TranscriptSourceType,
  UserRole,
} from './enums.js'

/** Identificador UUID. */
export type Id = string

export interface Timestamps {
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export interface Area {
  id: Id
  name: string
  code: string | null
  /** `Externos` es categoría especial, no departamento interno (§20.2). */
  isExternalCategory: boolean
  active: boolean
  sortOrder: number
}

export interface Project {
  id: Id
  canonicalName: string
  code: string | null
  active: boolean
  areaId: Id | null
}

export interface ProjectAlias {
  id: Id
  projectId: Id
  aliasNormalized: string
  source: string
}

export interface NotificationPreferences {
  postMeetingSummary: boolean
  newAssignment: boolean
  dueSoon: boolean
  overdue: boolean
  weeklyDigestIndividual: boolean
  areaSummary: boolean
  /** Días antes del vencimiento para alertar. */
  dueSoonDays: number
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  postMeetingSummary: false,
  newAssignment: true,
  dueSoon: true,
  overdue: true,
  weeklyDigestIndividual: true,
  areaSummary: false,
  dueSoonDays: 2,
}

export interface User extends Timestamps {
  id: Id
  googleUserId: string | null
  email: string
  displayName: string
  role: UserRole
  areaId: Id | null
  managerId: Id | null
  active: boolean
  /** Si la plataforma debe monitorear sus reuniones (suscripción Workspace Events + Calendar sync). */
  monitored: boolean
  notificationPreferences: NotificationPreferences
}

export interface UserAlias {
  id: Id
  userId: Id
  aliasNormalized: string
  source: string
}

export interface ExternalAssignee {
  id: Id
  displayName: string
  company: string | null
  email: string | null
  phone: string | null
  source: string
  active: boolean
}

// ---------------------------------------------------------------------------
// Reunión y artefactos
// ---------------------------------------------------------------------------

export interface Meeting extends Timestamps {
  id: Id
  googleConferenceRecordId: string | null
  googleMeetingSpaceId: string | null
  googleMeetingCode: string | null
  googleCalendarEventId: string | null
  title: string
  organizerUserId: Id | null
  organizerEmail: string | null
  /** true si el organizador es externo al dominio (§12.4). */
  isExternalHost: boolean
  startAt: Date
  endAt: Date | null
  durationSeconds: number | null
  status: MeetingStatus
  source: MeetingSource
  processingStatus: MeetingProcessingStatus
  transcriptStatus: ArtifactStatus
  smartNotesStatus: ArtifactStatus
  aiAnalysisStatus: AiAnalysisStatus
  confidentialityLevel: ConfidentialityLevel
  /** Excluida del análisis IA propio aunque exista transcripción (§26). */
  excludedFromAi: boolean
  reportedLanguageCode: string | null
  detectedLanguageCode: string | null
  mixedLanguageDetected: boolean
  lastErrorCode: string | null
  lastErrorAt: Date | null
  areaId: Id | null
  projectId: Id | null
}

export interface MeetingParticipant {
  id: Id
  meetingId: Id
  internalUserId: Id | null
  googleParticipantId: string | null
  displayName: string
  email: string | null
  participantType: ParticipantType
  isInternal: boolean
  joinedAt: Date | null
  leftAt: Date | null
  speakingDurationSeconds: number | null
}

export interface Transcript {
  id: Id
  meetingId: Id
  sourceType: TranscriptSourceType
  googleTranscriptId: string | null
  languageCode: string | null
  startedAt: Date | null
  endedAt: Date | null
  rawText: string
  structuredPayload: unknown | null
  sourceUri: string | null
  retainedUntil: Date | null
  ingestionChecksum: string
  createdAt: Date
}

export interface TranscriptSegment {
  id: Id
  transcriptId: Id
  participantId: Id | null
  speakerLabel: string
  text: string
  startAt: Date | null
  endAt: Date | null
  sequence: number
}

export interface MeetingSummary {
  id: Id
  meetingId: Id
  processingRunId: Id
  executiveSummary: string[]
  detailedSummary: string
  topics: string[]
  risks: string[]
  openQuestions: string[]
  aiModel: string
  promptVersion: string
  generatedAt: Date
  approvedAt: Date | null
  approvedByUserId: Id | null
}

export interface EvidenceQuote {
  text: string
  speaker?: string
  startTime?: string
  endTime?: string
  segmentId?: Id
}

export interface Decision {
  id: Id
  meetingId: Id
  processingRunId: Id | null
  description: string
  decidedBy: string | null
  effectiveDate: Date | null
  confidence: number
  sourceSegmentIds: Id[]
  evidence: EvidenceQuote[]
  status: DecisionStatus
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  interval?: number
  /** 0=domingo … 6=sábado, sólo para WEEKLY. */
  weekdays?: number[]
  textOriginal?: string
}

export interface ActionItem extends Timestamps {
  id: Id
  /** Clave legible, p. ej. ACT-000291. */
  externalKey: string
  title: string
  description: string | null
  type: ActionItemType
  ownerUserId: Id | null
  externalAssigneeId: Id | null
  ownerTextOriginal: string | null
  collaboratorUserIds: Id[]
  areaId: Id | null
  projectId: Id | null
  createdFromMeetingId: Id | null
  latestMeetingId: Id | null
  status: ActionItemStatus
  priority: ActionItemPriority
  dueDate: Date | null
  dueDateTextOriginal: string | null
  dateConfidence: number | null
  startDate: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  confidence: number | null
  requiresReview: boolean
  sourceEvidence: EvidenceQuote[]
  recurrence: RecurrenceRule | null
  parentActionItemId: Id | null
  blocker: string | null
  tags: string[]
  migrationTrust: MigrationTrust
  legacyId: string | null
  /** Última reunión donde se mencionó (derivado de links). */
  lastMentionedAt: Date | null
}

export interface ActionItemMeetingLink {
  id: Id
  actionItemId: Id
  meetingId: Id
  relationType: RelationType
  evidence: EvidenceQuote[]
  previousStatus: ActionItemStatus | null
  detectedStatus: ActionItemStatus | null
  detectedDueDate: Date | null
  createdAt: Date
}

export interface ActionItemStatusHistory {
  id: Id
  actionItemId: Id
  fromStatus: ActionItemStatus | null
  toStatus: ActionItemStatus
  changedByUserId: Id | null
  changedBySystem: boolean
  reason: string | null
  meetingId: Id | null
  changedAt: Date
}

export interface ActionItemComment {
  id: Id
  actionItemId: Id
  authorUserId: Id | null
  body: string
  source: 'USER' | 'LEGACY_IMPORT' | 'SYSTEM'
  createdAt: Date
}

export interface CompletionProposal {
  id: Id
  actionItemId: Id
  proposedByType: ProposedByType
  proposedByUserId: Id | null
  proposedFromMeetingId: Id | null
  reason: string
  evidenceSegmentIds: Id[]
  evidence: EvidenceQuote[]
  confidence: number
  status: CompletionProposalStatus
  reviewedByUserId: Id | null
  reviewedAt: Date | null
  reviewComment: string | null
  createdAt: Date
}

/** Elemento de la bandeja de Revisión IA (§23). */
export interface AiReviewItem {
  id: Id
  meetingId: Id
  processingRunId: Id
  reasons: AiReviewReason[]
  reconcileDecision: ReconcileDecision
  /** Action item existente candidato (para LINK/UPDATE/MARK_DONE). */
  candidateActionItemId: Id | null
  candidateScore: number | null
  /** Action item creado en estado PROPOSED, si aplica. */
  proposedActionItemId: Id | null
  /** Payload tipado del ExtractedActionItem original. */
  extracted: unknown
  suggestedOwnerUserId: Id | null
  suggestedOwnerConfidence: number | null
  suggestedDueDate: Date | null
  suggestedDueDateConfidence: number | null
  status: AiReviewItemStatus
  resolvedByUserId: Id | null
  resolvedAt: Date | null
  resolutionNote: string | null
  createdAt: Date
}

// ---------------------------------------------------------------------------
// IA: corridas y costos (§10.4, §35)
// ---------------------------------------------------------------------------

export interface ProcessingRun {
  id: Id
  meetingId: Id
  kind: 'ANALYZE_MEETING' | 'RECONCILE' | 'WEEKLY_DIGEST' | 'REPROCESS'
  provider: string
  model: string
  promptVersion: string
  schemaVersion: string
  temperature: number | null
  inputTokens: number | null
  outputTokens: number | null
  cachedTokens: number | null
  estimatedCostUsd: number | null
  latencyMs: number | null
  success: boolean
  errorCode: string | null
  correlationId: string
  startedAt: Date
  finishedAt: Date | null
}

// ---------------------------------------------------------------------------
// Google integration state (§13)
// ---------------------------------------------------------------------------

export interface GoogleWorkspaceSubscription {
  id: Id
  monitoredUserId: Id
  monitoredUserEmail: string
  googleSubscriptionName: string
  targetResource: string
  eventTypes: string[]
  expiresAt: Date
  state: SubscriptionState
  lastRenewedAt: Date | null
  lastErrorCode: string | null
  lastErrorAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface InboundGoogleEvent {
  id: Id
  cloudEventId: string
  type: string
  source: string
  subject: string | null
  occurredAt: Date | null
  resourceName: string | null
  /** Payload redactado: nunca el transcript ni datos sensibles completos. */
  rawPayloadRedacted: unknown
  receivedAt: Date
  processedAt: Date | null
  processingStatus: InboundEventProcessingStatus
  attempts: number
  lastErrorCode: string | null
}

export interface CalendarSyncCursor {
  id: Id
  userId: Id
  calendarId: string
  syncToken: string | null
  lastFullSyncAt: Date | null
  lastIncrementalSyncAt: Date | null
  lastError: string | null
}

// ---------------------------------------------------------------------------
// Digest, auditoría, migración
// ---------------------------------------------------------------------------

export interface WeeklyDigestConfig {
  id: Id
  enabled: boolean
  timezone: string
  /** 0=domingo … 6=sábado. Inicial: 5 (viernes) o 6 (sábado). */
  dayOfWeek: number
  /** HH:mm en la zona horaria configurada. */
  localTime: string
  recipientUserIds: Id[]
  includeAreaIds: Id[] | null
  includeExternalTasks: boolean
  attachSpreadsheet: boolean
  sendEmail: boolean
  createdByUserId: Id | null
  updatedByUserId: Id | null
  updatedAt: Date
}

export interface WeeklyDigest {
  id: Id
  weekStart: Date
  weekEnd: Date
  generatedAt: Date
  audience: DigestAudience
  payload: unknown
  sentAt: Date | null
  version: number
  recipientEmails: string[]
}

export interface AuditLogEntry {
  id: Id
  actorUserId: Id | null
  actorType: 'USER' | 'SYSTEM' | 'AI' | 'IMPORT'
  action: string
  entity: string
  entityId: Id
  before: unknown | null
  after: unknown | null
  source: string
  correlationId: string | null
  timestamp: Date
}

export interface LegacyImportReference {
  id: Id
  entityType: string
  entityId: Id
  sourceFile: string
  sourceSheet: string
  sourceRow: number
  legacyId: string | null
  rawPayload: unknown
  importBatchId: Id
  importedAt: Date
}

export interface FeatureFlags {
  GOOGLE_INTEGRATION_ENABLED: boolean
  GOOGLE_MEET_EVENTS_ENABLED: boolean
  AI_PROCESSING_ENABLED: boolean
  AI_COMPLETION_PROPOSALS_ENABLED: boolean
  GMAIL_NOTIFICATIONS_ENABLED: boolean
  SHEETS_SYNC_ENABLED: boolean
  WEEKLY_DIGEST_ENABLED: boolean
}

export const FEATURE_FLAG_NAMES = [
  'GOOGLE_INTEGRATION_ENABLED',
  'GOOGLE_MEET_EVENTS_ENABLED',
  'AI_PROCESSING_ENABLED',
  'AI_COMPLETION_PROPOSALS_ENABLED',
  'GMAIL_NOTIFICATIONS_ENABLED',
  'SHEETS_SYNC_ENABLED',
  'WEEKLY_DIGEST_ENABLED',
] as const satisfies readonly (keyof FeatureFlags)[]
