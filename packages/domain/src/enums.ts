/**
 * Enumeraciones canónicas del dominio SMLXL Meeting Intelligence.
 *
 * El dominio NO conoce Google APIs, Prisma, Gemini, HTTP ni infraestructura.
 * Los enums aquí definidos son la fuente de verdad; Prisma y los contratos Zod
 * deben mapearse a estos valores (ver ADR-010 para la unificación de estados).
 */

/** Estados de ActionItem (unificación de §9.7 y §16.5, ver ADR-010). */
export const ActionItemStatus = {
  /** Creada por IA con confianza media/baja; pendiente de aceptación humana. */
  PROPOSED: 'PROPOSED',
  /** Abierta y aceptada (equivale a "Pendiente"/OPEN del legado). */
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  /** Esperando a un tercero o dependencia externa. */
  WAITING: 'WAITING',
  /** Cierre propuesto (por IA o usuario); requiere aprobación humana. */
  COMPLETION_PROPOSED: 'COMPLETION_PROPOSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type ActionItemStatus = (typeof ActionItemStatus)[keyof typeof ActionItemStatus]

export const OPEN_ACTION_ITEM_STATUSES: readonly ActionItemStatus[] = [
  ActionItemStatus.PROPOSED,
  ActionItemStatus.PENDING,
  ActionItemStatus.IN_PROGRESS,
  ActionItemStatus.BLOCKED,
  ActionItemStatus.WAITING,
  ActionItemStatus.COMPLETION_PROPOSED,
]

export const CLOSED_ACTION_ITEM_STATUSES: readonly ActionItemStatus[] = [
  ActionItemStatus.COMPLETED,
  ActionItemStatus.CANCELLED,
]

export const ActionItemPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const
export type ActionItemPriority = (typeof ActionItemPriority)[keyof typeof ActionItemPriority]

export const ActionItemType = {
  ONE_OFF: 'ONE_OFF',
  RECURRING: 'RECURRING',
} as const
export type ActionItemType = (typeof ActionItemType)[keyof typeof ActionItemType]

/** Confianza en el origen del dato (migración legado vs flujo de la plataforma). */
export const MigrationTrust = {
  PLATFORM: 'PLATFORM',
  LEGACY: 'LEGACY',
} as const
export type MigrationTrust = (typeof MigrationTrust)[keyof typeof MigrationTrust]

export const RelationType = {
  CREATED: 'CREATED',
  MENTIONED: 'MENTIONED',
  UPDATED: 'UPDATED',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  REOPENED: 'REOPENED',
} as const
export type RelationType = (typeof RelationType)[keyof typeof RelationType]

export const CompletionProposalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const
export type CompletionProposalStatus =
  (typeof CompletionProposalStatus)[keyof typeof CompletionProposalStatus]

export const ProposedByType = {
  AI: 'AI',
  USER: 'USER',
} as const
export type ProposedByType = (typeof ProposedByType)[keyof typeof ProposedByType]

/** Estados de procesamiento de reunión (§32). */
export const MeetingProcessingStatus = {
  DISCOVERED: 'DISCOVERED',
  WAITING_FOR_ARTIFACTS: 'WAITING_FOR_ARTIFACTS',
  ARTIFACTS_AVAILABLE: 'ARTIFACTS_AVAILABLE',
  INGESTING: 'INGESTING',
  INGESTED: 'INGESTED',
  ANALYZING: 'ANALYZING',
  ANALYZED: 'ANALYZED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  EXCLUDED: 'EXCLUDED',
} as const
export type MeetingProcessingStatus =
  (typeof MeetingProcessingStatus)[keyof typeof MeetingProcessingStatus]

/** Estado de la reunión en sí (ciclo de vida de calendario/conferencia). */
export const MeetingStatus = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
} as const
export type MeetingStatus = (typeof MeetingStatus)[keyof typeof MeetingStatus]

export const MeetingSource = {
  WORKSPACE_EVENT: 'WORKSPACE_EVENT',
  CALENDAR_DISCOVERY: 'CALENDAR_DISCOVERY',
  MANUAL_IMPORT: 'MANUAL_IMPORT',
  LEGACY_IMPORT: 'LEGACY_IMPORT',
} as const
export type MeetingSource = (typeof MeetingSource)[keyof typeof MeetingSource]

/** Estado de un artefacto de Meet (transcript / smart notes) para una reunión. */
export const ArtifactStatus = {
  NOT_REQUESTED: 'NOT_REQUESTED',
  PENDING: 'PENDING',
  AVAILABLE: 'AVAILABLE',
  INGESTED: 'INGESTED',
  UNAVAILABLE: 'UNAVAILABLE',
  /** Reunión con organizador externo: no se puede garantizar el artefacto (§12.4). */
  UNAVAILABLE_EXTERNAL_HOST: 'UNAVAILABLE_EXTERNAL_HOST',
  /** Google rechazó la configuración automática por política/privilegios (§12.3). */
  CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED',
  FAILED: 'FAILED',
} as const
export type ArtifactStatus = (typeof ArtifactStatus)[keyof typeof ArtifactStatus]

export const AiAnalysisStatus = {
  NOT_STARTED: 'NOT_STARTED',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const
export type AiAnalysisStatus = (typeof AiAnalysisStatus)[keyof typeof AiAnalysisStatus]

export const ConfidentialityLevel = {
  NORMAL: 'NORMAL',
  RESTRICTED: 'RESTRICTED',
  LEGAL: 'LEGAL',
  EXECUTIVE: 'EXECUTIVE',
} as const
export type ConfidentialityLevel = (typeof ConfidentialityLevel)[keyof typeof ConfidentialityLevel]

export const ParticipantType = {
  SIGNED_IN_USER: 'SIGNED_IN_USER',
  ANONYMOUS_USER: 'ANONYMOUS_USER',
  PHONE_USER: 'PHONE_USER',
  UNKNOWN: 'UNKNOWN',
} as const
export type ParticipantType = (typeof ParticipantType)[keyof typeof ParticipantType]

export const TranscriptSourceType = {
  MEET_TRANSCRIPT: 'MEET_TRANSCRIPT',
  MEET_SMART_NOTES: 'MEET_SMART_NOTES',
  MANUAL: 'MANUAL',
} as const
export type TranscriptSourceType = (typeof TranscriptSourceType)[keyof typeof TranscriptSourceType]

export const UserRole = {
  ADMIN: 'ADMIN',
  DIRECTOR: 'DIRECTOR',
  MANAGER: 'MANAGER',
  MEMBER: 'MEMBER',
  AUDITOR: 'AUDITOR',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const DecisionStatus = {
  PROPOSED: 'PROPOSED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const
export type DecisionStatus = (typeof DecisionStatus)[keyof typeof DecisionStatus]

/** Resultado de la reconciliación de un action item extraído contra el backlog (§10.2 paso 6). */
export const ReconcileDecision = {
  CREATE_NEW: 'CREATE_NEW',
  LINK_EXISTING: 'LINK_EXISTING',
  UPDATE_EXISTING: 'UPDATE_EXISTING',
  MARK_DONE_CANDIDATE: 'MARK_DONE_CANDIDATE',
  REOPEN_CANDIDATE: 'REOPEN_CANDIDATE',
  REQUIRES_HUMAN_REVIEW: 'REQUIRES_HUMAN_REVIEW',
} as const
export type ReconcileDecision = (typeof ReconcileDecision)[keyof typeof ReconcileDecision]

export const AiReviewItemStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  MERGED: 'MERGED',
} as const
export type AiReviewItemStatus = (typeof AiReviewItemStatus)[keyof typeof AiReviewItemStatus]

export const AiReviewReason = {
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  AMBIGUOUS_OWNER: 'AMBIGUOUS_OWNER',
  AMBIGUOUS_DUE_DATE: 'AMBIGUOUS_DUE_DATE',
  POSSIBLE_DUPLICATE: 'POSSIBLE_DUPLICATE',
  POSSIBLE_COMPLETION: 'POSSIBLE_COMPLETION',
  CONFLICT_WITH_EXISTING: 'CONFLICT_WITH_EXISTING',
} as const
export type AiReviewReason = (typeof AiReviewReason)[keyof typeof AiReviewReason]

export const InboundEventProcessingStatus = {
  RECEIVED: 'RECEIVED',
  QUEUED: 'QUEUED',
  PROCESSED: 'PROCESSED',
  IGNORED: 'IGNORED',
  FAILED: 'FAILED',
} as const
export type InboundEventProcessingStatus =
  (typeof InboundEventProcessingStatus)[keyof typeof InboundEventProcessingStatus]

export const SubscriptionState = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  DELETED: 'DELETED',
  ERROR: 'ERROR',
} as const
export type SubscriptionState = (typeof SubscriptionState)[keyof typeof SubscriptionState]

export const DigestAudience = {
  EXECUTIVE: 'EXECUTIVE',
  INDIVIDUAL: 'INDIVIDUAL',
  AREA: 'AREA',
} as const
export type DigestAudience = (typeof DigestAudience)[keyof typeof DigestAudience]

export const NotificationType = {
  POST_MEETING_SUMMARY: 'POST_MEETING_SUMMARY',
  NEW_ASSIGNMENT: 'NEW_ASSIGNMENT',
  DUE_SOON: 'DUE_SOON',
  OVERDUE: 'OVERDUE',
  WEEKLY_DIGEST_INDIVIDUAL: 'WEEKLY_DIGEST_INDIVIDUAL',
  WEEKLY_DIGEST_EXECUTIVE: 'WEEKLY_DIGEST_EXECUTIVE',
  AREA_SUMMARY: 'AREA_SUMMARY',
  OPERATIONAL_ERROR: 'OPERATIONAL_ERROR',
} as const
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType]

/** Eventos de Google Workspace Events prioritarios (§13.1). */
export const GoogleMeetEventType = {
  CONFERENCE_STARTED: 'google.workspace.meet.conference.v2.started',
  CONFERENCE_ENDED: 'google.workspace.meet.conference.v2.ended',
  TRANSCRIPT_STARTED: 'google.workspace.meet.transcript.v2.started',
  TRANSCRIPT_ENDED: 'google.workspace.meet.transcript.v2.ended',
  TRANSCRIPT_FILE_GENERATED: 'google.workspace.meet.transcript.v2.fileGenerated',
  SMART_NOTE_STARTED: 'google.workspace.meet.smartNote.v2.started',
  SMART_NOTE_ENDED: 'google.workspace.meet.smartNote.v2.ended',
  SMART_NOTE_FILE_GENERATED: 'google.workspace.meet.smartNote.v2.fileGenerated',
} as const
export type GoogleMeetEventType = (typeof GoogleMeetEventType)[keyof typeof GoogleMeetEventType]

export const ALL_GOOGLE_MEET_EVENT_TYPES: readonly GoogleMeetEventType[] =
  Object.values(GoogleMeetEventType)
