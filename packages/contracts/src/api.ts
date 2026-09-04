import { z } from 'zod'

/** Contratos HTTP de /api/v1 (§30). Fastify valida con estos schemas y genera OpenAPI. */

export const IdSchema = z.string().uuid()
export const IsoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const IsoDateTime = z.string().datetime({ offset: true })

export const ActionItemStatusSchema = z.enum([
  'PROPOSED', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'WAITING', 'COMPLETION_PROPOSED', 'COMPLETED', 'CANCELLED',
])
export const PrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
export const ConfidentialitySchema = z.enum(['NORMAL', 'RESTRICTED', 'LEGAL', 'EXECUTIVE'])
export const UserRoleSchema = z.enum(['ADMIN', 'DIRECTOR', 'MANAGER', 'MEMBER', 'AUDITOR'])
export const MeetingProcessingStatusSchema = z.enum([
  'DISCOVERED', 'WAITING_FOR_ARTIFACTS', 'ARTIFACTS_AVAILABLE', 'INGESTING', 'INGESTED', 'ANALYZING', 'ANALYZED', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED', 'EXCLUDED',
])
export const ArtifactStatusSchema = z.enum([
  'NOT_REQUESTED', 'PENDING', 'AVAILABLE', 'INGESTED', 'UNAVAILABLE', 'UNAVAILABLE_EXTERNAL_HOST', 'CAPABILITY_BLOCKED', 'FAILED',
])

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
})

export const EvidenceDtoSchema = z.object({
  text: z.string(),
  speaker: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  segmentId: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Usuarios / catálogos
// ---------------------------------------------------------------------------

export const UserDtoSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  displayName: z.string(),
  role: UserRoleSchema,
  areaId: IdSchema.nullable(),
  areaName: z.string().nullable(),
  managerId: IdSchema.nullable(),
  active: z.boolean(),
  monitored: z.boolean(),
})

export const UpdateUserBodySchema = z.object({
  role: UserRoleSchema.optional(),
  areaId: IdSchema.nullable().optional(),
  managerId: IdSchema.nullable().optional(),
  active: z.boolean().optional(),
  monitored: z.boolean().optional(),
  displayName: z.string().min(1).max(200).optional(),
})

export const AreaDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  code: z.string().nullable(),
  isExternalCategory: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number(),
})

export const ProjectDtoSchema = z.object({
  id: IdSchema,
  canonicalName: z.string(),
  code: z.string().nullable(),
  active: z.boolean(),
  areaId: IdSchema.nullable(),
  aliases: z.array(z.string()),
})

export const UpsertAreaBodySchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(20).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export const UpsertProjectBodySchema = z.object({
  canonicalName: z.string().min(1).max(200),
  code: z.string().max(30).nullable().optional(),
  active: z.boolean().optional(),
  areaId: IdSchema.nullable().optional(),
  aliases: z.array(z.string().min(1).max(200)).optional(),
})

// ---------------------------------------------------------------------------
// Reuniones
// ---------------------------------------------------------------------------

export const MeetingListQuerySchema = PaginationQuerySchema.extend({
  from: IsoDateOnly.optional(),
  to: IsoDateOnly.optional(),
  organizerUserId: IdSchema.optional(),
  areaId: IdSchema.optional(),
  participantUserId: IdSchema.optional(),
  processed: z.coerce.boolean().optional(),
  withActionItems: z.coerce.boolean().optional(),
  confidentiality: ConfidentialitySchema.optional(),
  processingStatus: MeetingProcessingStatusSchema.optional(),
  search: z.string().max(200).optional(),
})

export const MeetingListItemSchema = z.object({
  id: IdSchema,
  title: z.string(),
  startAt: IsoDateTime,
  endAt: IsoDateTime.nullable(),
  durationSeconds: z.number().nullable(),
  organizerUserId: IdSchema.nullable(),
  organizerName: z.string().nullable(),
  organizerEmail: z.string().nullable(),
  isExternalHost: z.boolean(),
  participantCount: z.number(),
  participantNames: z.array(z.string()),
  source: z.string(),
  processingStatus: MeetingProcessingStatusSchema,
  transcriptStatus: ArtifactStatusSchema,
  smartNotesStatus: ArtifactStatusSchema,
  aiAnalysisStatus: z.string(),
  confidentialityLevel: ConfidentialitySchema,
  excludedFromAi: z.boolean(),
  actionItemCount: z.number(),
  pendingReviewCount: z.number(),
  extractionConfidence: z.number().nullable(),
  areaId: IdSchema.nullable(),
  projectId: IdSchema.nullable(),
})

export const ParticipantDtoSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
  email: z.string().nullable(),
  isInternal: z.boolean(),
  internalUserId: IdSchema.nullable(),
  participantType: z.string(),
  joinedAt: IsoDateTime.nullable(),
  leftAt: IsoDateTime.nullable(),
  speakingDurationSeconds: z.number().nullable(),
})

export const SummaryDtoSchema = z.object({
  id: IdSchema,
  executiveSummary: z.array(z.string()),
  detailedSummary: z.string(),
  topics: z.array(z.string()),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
  aiModel: z.string(),
  promptVersion: z.string(),
  generatedAt: IsoDateTime,
  approvedAt: IsoDateTime.nullable(),
})

export const DecisionDtoSchema = z.object({
  id: IdSchema,
  description: z.string(),
  decidedBy: z.string().nullable(),
  effectiveDate: IsoDateOnly.nullable(),
  confidence: z.number(),
  evidence: z.array(EvidenceDtoSchema),
  status: z.string(),
})

export const TranscriptSegmentDtoSchema = z.object({
  id: IdSchema,
  sequence: z.number(),
  speakerLabel: z.string(),
  text: z.string(),
  startAt: IsoDateTime.nullable(),
  endAt: IsoDateTime.nullable(),
  participantId: IdSchema.nullable(),
})

export const ProcessingRunDtoSchema = z.object({
  id: IdSchema,
  kind: z.string(),
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  estimatedCostUsd: z.number().nullable(),
  latencyMs: z.number().nullable(),
  success: z.boolean(),
  errorCode: z.string().nullable(),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.nullable(),
})

export const MeetingDetailSchema = MeetingListItemSchema.extend({
  googleConferenceRecordId: z.string().nullable(),
  googleMeetingCode: z.string().nullable(),
  googleCalendarEventId: z.string().nullable(),
  reportedLanguageCode: z.string().nullable(),
  detectedLanguageCode: z.string().nullable(),
  mixedLanguageDetected: z.boolean(),
  lastErrorCode: z.string().nullable(),
  participants: z.array(ParticipantDtoSchema),
  summary: SummaryDtoSchema.nullable(),
  decisions: z.array(DecisionDtoSchema),
  processingRuns: z.array(ProcessingRunDtoSchema),
  captureQuality: z.array(z.string()),
})

export const UpdateMeetingBodySchema = z.object({
  confidentialityLevel: ConfidentialitySchema.optional(),
  excludedFromAi: z.boolean().optional(),
  areaId: IdSchema.nullable().optional(),
  projectId: IdSchema.nullable().optional(),
})

export const ManualMeetingBodySchema = z.object({
  title: z.string().min(3).max(300),
  startAt: IsoDateTime,
  endAt: IsoDateTime.nullable().optional(),
  organizerEmail: z.string().email().optional(),
  participantEmails: z.array(z.string().email()).default([]),
  transcriptText: z.string().min(20).max(500000),
  smartNotesText: z.string().max(100000).nullable().optional(),
  confidentialityLevel: ConfidentialitySchema.default('NORMAL'),
})

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

export const ActionItemListQuerySchema = PaginationQuerySchema.extend({
  view: z
    .enum(['all', 'mine', 'team', 'overdue', 'thisWeek', 'noDueDate', 'noOwner', 'blocked', 'completed', 'proposed'])
    .default('all'),
  status: z.string().optional(), // CSV
  ownerUserId: IdSchema.optional(),
  areaId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  meetingId: IdSchema.optional(),
  priority: PrioritySchema.optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(['attention', 'dueDate', 'createdAt', 'updatedAt', 'priority']).default('attention'),
})

export const ActionItemDtoSchema = z.object({
  id: IdSchema,
  externalKey: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(['ONE_OFF', 'RECURRING']),
  status: ActionItemStatusSchema,
  priority: PrioritySchema,
  ownerUserId: IdSchema.nullable(),
  ownerName: z.string().nullable(),
  externalAssigneeId: IdSchema.nullable(),
  externalAssigneeName: z.string().nullable(),
  ownerTextOriginal: z.string().nullable(),
  collaboratorUserIds: z.array(IdSchema),
  areaId: IdSchema.nullable(),
  areaName: z.string().nullable(),
  projectId: IdSchema.nullable(),
  projectName: z.string().nullable(),
  createdFromMeetingId: IdSchema.nullable(),
  createdFromMeetingTitle: z.string().nullable(),
  latestMeetingId: IdSchema.nullable(),
  dueDate: IsoDateOnly.nullable(),
  dueDateTextOriginal: z.string().nullable(),
  dateConfidence: z.number().nullable(),
  startDate: IsoDateOnly.nullable(),
  completedAt: IsoDateTime.nullable(),
  confidence: z.number().nullable(),
  requiresReview: z.boolean(),
  sourceEvidence: z.array(EvidenceDtoSchema),
  recurrence: z.unknown().nullable(),
  blocker: z.string().nullable(),
  tags: z.array(z.string()),
  migrationTrust: z.enum(['PLATFORM', 'LEGACY']),
  legacyId: z.string().nullable(),
  isOverdue: z.boolean(),
  daysOpen: z.number(),
  daysUntilDue: z.number().nullable(),
  lastMentionedAt: IsoDateTime.nullable(),
  attentionScore: z.number(),
  attentionReasons: z.array(z.string()),
  pendingProposalId: IdSchema.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})

export const CreateActionItemBodySchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(4000).nullable().optional(),
  ownerUserId: IdSchema.nullable().optional(),
  externalAssigneeId: IdSchema.nullable().optional(),
  areaId: IdSchema.nullable().optional(),
  projectId: IdSchema.nullable().optional(),
  priority: PrioritySchema.default('MEDIUM'),
  dueDate: IsoDateOnly.nullable().optional(),
  meetingId: IdSchema.nullable().optional(),
  type: z.enum(['ONE_OFF', 'RECURRING']).default('ONE_OFF'),
  tags: z.array(z.string().max(40)).max(20).optional(),
})

export const UpdateActionItemBodySchema = z.object({
  title: z.string().min(3).max(300).optional(),
  description: z.string().max(4000).nullable().optional(),
  status: ActionItemStatusSchema.optional(),
  statusReason: z.string().max(1000).optional(),
  ownerUserId: IdSchema.nullable().optional(),
  externalAssigneeId: IdSchema.nullable().optional(),
  areaId: IdSchema.nullable().optional(),
  projectId: IdSchema.nullable().optional(),
  priority: PrioritySchema.optional(),
  dueDate: IsoDateOnly.nullable().optional(),
  blocker: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  collaboratorUserIds: z.array(IdSchema).max(20).optional(),
})

export const ProposeCompletionBodySchema = z.object({
  reason: z.string().min(3).max(2000),
})

export const ReviewProposalBodySchema = z.object({
  comment: z.string().max(2000).optional(),
  /** Al rechazar: a qué estado regresa (PENDING o IN_PROGRESS). */
  returnToStatus: z.enum(['PENDING', 'IN_PROGRESS']).optional(),
})

export const CommentBodySchema = z.object({ body: z.string().min(1).max(4000) })

export const CommentDtoSchema = z.object({
  id: IdSchema,
  authorUserId: IdSchema.nullable(),
  authorName: z.string().nullable(),
  body: z.string(),
  source: z.string(),
  createdAt: IsoDateTime,
})

export const StatusHistoryDtoSchema = z.object({
  id: IdSchema,
  fromStatus: ActionItemStatusSchema.nullable(),
  toStatus: ActionItemStatusSchema,
  changedByUserId: IdSchema.nullable(),
  changedByName: z.string().nullable(),
  changedBySystem: z.boolean(),
  reason: z.string().nullable(),
  meetingId: IdSchema.nullable(),
  changedAt: IsoDateTime,
})

export const MeetingLinkDtoSchema = z.object({
  id: IdSchema,
  meetingId: IdSchema,
  meetingTitle: z.string(),
  meetingStartAt: IsoDateTime,
  relationType: z.string(),
  evidence: z.array(EvidenceDtoSchema),
  detectedStatus: ActionItemStatusSchema.nullable(),
  detectedDueDate: IsoDateOnly.nullable(),
  createdAt: IsoDateTime,
})

export const CompletionProposalDtoSchema = z.object({
  id: IdSchema,
  actionItemId: IdSchema,
  proposedByType: z.enum(['AI', 'USER']),
  proposedByUserId: IdSchema.nullable(),
  proposedByName: z.string().nullable(),
  proposedFromMeetingId: IdSchema.nullable(),
  proposedFromMeetingTitle: z.string().nullable(),
  reason: z.string(),
  evidence: z.array(EvidenceDtoSchema),
  confidence: z.number(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
  reviewedByUserId: IdSchema.nullable(),
  reviewedAt: IsoDateTime.nullable(),
  reviewComment: z.string().nullable(),
  createdAt: IsoDateTime,
})

export const ActionItemDetailSchema = ActionItemDtoSchema.extend({
  comments: z.array(CommentDtoSchema),
  statusHistory: z.array(StatusHistoryDtoSchema),
  meetingLinks: z.array(MeetingLinkDtoSchema),
  proposals: z.array(CompletionProposalDtoSchema),
  allowedTransitions: z.array(ActionItemStatusSchema),
  canApproveCompletion: z.boolean(),
})

// ---------------------------------------------------------------------------
// Revisión IA
// ---------------------------------------------------------------------------

export const AiReviewItemDtoSchema = z.object({
  id: IdSchema,
  meetingId: IdSchema,
  meetingTitle: z.string(),
  meetingStartAt: IsoDateTime,
  reasons: z.array(z.string()),
  reconcileDecision: z.string(),
  candidateActionItemId: IdSchema.nullable(),
  candidateActionItemKey: z.string().nullable(),
  candidateActionItemTitle: z.string().nullable(),
  candidateScore: z.number().nullable(),
  proposedActionItemId: IdSchema.nullable(),
  extracted: z.unknown(),
  suggestedOwnerUserId: IdSchema.nullable(),
  suggestedOwnerName: z.string().nullable(),
  suggestedOwnerConfidence: z.number().nullable(),
  suggestedDueDate: IsoDateOnly.nullable(),
  suggestedDueDateConfidence: z.number().nullable(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'MERGED']),
  createdAt: IsoDateTime,
})

export const AiReviewApproveBodySchema = z.object({
  /** Crear nuevo con estos overrides opcionales. */
  ownerUserId: IdSchema.nullable().optional(),
  dueDate: IsoDateOnly.nullable().optional(),
  priority: PrioritySchema.optional(),
  title: z.string().min(3).max(300).optional(),
  note: z.string().max(1000).optional(),
})

export const AiReviewMergeBodySchema = z.object({
  targetActionItemId: IdSchema,
  applyDueDate: z.boolean().default(true),
  applyOwner: z.boolean().default(false),
  note: z.string().max(1000).optional(),
})

export const AiReviewRejectBodySchema = z.object({ note: z.string().max(1000).optional() })

export const AiReviewReasonSchema = z.enum([
  'LOW_CONFIDENCE', 'AMBIGUOUS_OWNER', 'AMBIGUOUS_DUE_DATE', 'POSSIBLE_DUPLICATE', 'POSSIBLE_COMPLETION', 'CONFLICT_WITH_EXISTING',
])

/** GET /ai-review: paginación + filtros opcionales por reunión y motivo. */
export const AiReviewListQuerySchema = PaginationQuerySchema.extend({
  meetingId: IdSchema.optional(),
  reason: AiReviewReasonSchema.optional(),
})

// ---------------------------------------------------------------------------
// Dashboard / reportes
// ---------------------------------------------------------------------------

export const PeriodQuerySchema = z.object({
  from: IsoDateOnly.optional(),
  to: IsoDateOnly.optional(),
  areaId: IdSchema.optional(),
  projectId: IdSchema.optional(),
})

export const KpiRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  total: z.number(),
  completed: z.number(),
  inProgress: z.number(),
  pending: z.number(),
  completionProposed: z.number(),
  overdue: z.number(),
  progressPct: z.number(),
})

export const DashboardDtoSchema = z.object({
  period: z.object({ from: IsoDateOnly, to: IsoDateOnly }),
  kpis: z.object({
    totalOpen: z.number(),
    completedInPeriod: z.number(),
    inProgress: z.number(),
    pending: z.number(),
    completionProposed: z.number(),
    progressPct: z.number(),
    overdue: z.number(),
    noDueDate: z.number(),
    meetingsProcessed: z.number(),
    meetingsDetected: z.number(),
  }),
  byArea: z.array(KpiRowSchema),
  byPerson: z.array(KpiRowSchema),
  weeklyTrend: z.array(
    z.object({
      week: z.string(),
      weekStart: IsoDateOnly,
      created: z.number(),
      completed: z.number(),
      openAtEnd: z.number(),
      overdueAtEnd: z.number(),
      closeRate: z.number(),
    }),
  ),
  needsAttention: z.array(ActionItemDtoSchema),
  captureQuality: z.object({
    detected: z.number(),
    withTranscript: z.number(),
    withSmartNotes: z.number(),
    transcriptOnly: z.number(),
    noArtifact: z.number(),
    externalHostUnavailable: z.number(),
    apiErrors: z.number(),
  }),
  recentMeetings: z.array(MeetingListItemSchema),
})

export const WeeklyDigestConfigDtoSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  recipientUserIds: z.array(IdSchema),
  includeAreaIds: z.array(IdSchema).nullable(),
  includeExternalTasks: z.boolean(),
  attachSpreadsheet: z.boolean(),
  sendEmail: z.boolean(),
  nextRunAt: IsoDateTime.nullable(),
})

export const UpdateWeeklyDigestConfigBodySchema = WeeklyDigestConfigDtoSchema.omit({ nextRunAt: true }).partial()

export const WeeklyDigestDtoSchema = z.object({
  id: IdSchema,
  weekLabel: z.string(),
  weekStart: IsoDateOnly,
  weekEnd: IsoDateOnly,
  generatedAt: IsoDateTime,
  audience: z.string(),
  sentAt: IsoDateTime.nullable(),
  version: z.number(),
  recipientEmails: z.array(z.string()),
  payload: z.unknown(),
  emailPreviewHtml: z.string().nullable(),
})

export const GenerateDigestBodySchema = z.object({
  /** Cualquier fecha dentro de la semana deseada; por defecto la semana actual. */
  weekOf: IsoDateOnly.optional(),
})

// ---------------------------------------------------------------------------
// Integraciones / administración
// ---------------------------------------------------------------------------

export const FeatureFlagsDtoSchema = z.object({
  GOOGLE_INTEGRATION_ENABLED: z.boolean(),
  GOOGLE_MEET_EVENTS_ENABLED: z.boolean(),
  AI_PROCESSING_ENABLED: z.boolean(),
  AI_COMPLETION_PROPOSALS_ENABLED: z.boolean(),
  GMAIL_NOTIFICATIONS_ENABLED: z.boolean(),
  SHEETS_SYNC_ENABLED: z.boolean(),
  WEEKLY_DIGEST_ENABLED: z.boolean(),
})

export const PlatformSettingsDtoSchema = z.object({
  featureFlags: FeatureFlagsDtoSchema,
  confidenceThresholds: z.object({ autoAccept: z.number().min(0).max(1), proposal: z.number().min(0).max(1) }),
  companyTimezone: z.string(),
  companyDomain: z.string(),
  rawTranscriptRetentionDays: z.number().int().min(1).nullable(),
  autoCaptureEnabled: z.boolean(),
  monitoredUserEmails: z.array(z.string().email()),
})

export const UpdatePlatformSettingsBodySchema = PlatformSettingsDtoSchema.partial()

export const GoogleStatusDtoSchema = z.object({
  mode: z.enum(['FAKE', 'REAL']),
  flags: FeatureFlagsDtoSchema,
  subscriptions: z.array(
    z.object({
      userEmail: z.string(),
      subscriptionName: z.string(),
      state: z.string(),
      expiresAt: IsoDateTime,
      lastRenewedAt: IsoDateTime.nullable(),
      lastErrorCode: z.string().nullable(),
    }),
  ),
  calendarCursors: z.array(
    z.object({
      userEmail: z.string(),
      calendarId: z.string(),
      lastIncrementalSyncAt: IsoDateTime.nullable(),
      lastFullSyncAt: IsoDateTime.nullable(),
      lastError: z.string().nullable(),
    }),
  ),
  recentEvents: z.array(
    z.object({
      cloudEventId: z.string(),
      type: z.string(),
      receivedAt: IsoDateTime,
      processingStatus: z.string(),
      attempts: z.number(),
      lastErrorCode: z.string().nullable(),
    }),
  ),
  aiUsage: z.object({ runs: z.number(), inputTokens: z.number(), outputTokens: z.number(), estimatedCostUsd: z.number(), failures: z.number() }),
})

export const SheetsSyncResultSchema = z.object({
  spreadsheetId: z.string().nullable(),
  pendientes: z.object({ inserted: z.number(), updated: z.number() }),
  reuniones: z.object({ inserted: z.number(), updated: z.number() }),
  preview: z.object({
    pendientes: z.object({ columns: z.array(z.string()), rows: z.array(z.record(z.unknown())) }),
    reuniones: z.object({ columns: z.array(z.string()), rows: z.array(z.record(z.unknown())) }),
  }),
})

export const AuditQuerySchema = PaginationQuerySchema.extend({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  actorUserId: IdSchema.optional(),
  from: IsoDateOnly.optional(),
  to: IsoDateOnly.optional(),
})

export const AuditEntryDtoSchema = z.object({
  id: IdSchema,
  actorUserId: IdSchema.nullable(),
  actorName: z.string().nullable(),
  actorType: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  source: z.string(),
  correlationId: z.string().nullable(),
  timestamp: IsoDateTime,
})

export const SearchQuerySchema = z.object({
  q: z.string().min(2).max(300),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const SearchResultSchema = z.object({
  query: z.string(),
  meetings: z.array(z.object({ id: IdSchema, title: z.string(), startAt: IsoDateTime, snippet: z.string() })),
  actionItems: z.array(z.object({ id: IdSchema, externalKey: z.string(), title: z.string(), status: ActionItemStatusSchema, ownerName: z.string().nullable(), snippet: z.string() })),
  decisions: z.array(z.object({ id: IdSchema, meetingId: IdSchema, meetingTitle: z.string(), description: z.string() })),
  /** Siempre se indican las reuniones fuente (§24). */
  sourceMeetingIds: z.array(IdSchema),
})

export const SessionDtoSchema = z.object({
  user: UserDtoSchema,
  permissions: z.array(z.string()),
})

/** GET /team/external-assignees */
export const ExternalAssigneeDtoSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  active: z.boolean(),
})

/** GET /notifications/counts — contadores baratos para badges de navegación. */
export const NotificationCountsSchema = z.object({
  pendingAiReview: z.number().int(),
  pendingCompletionProposals: z.number().int(),
})

/** POST /meetings/:id/reprocess */
export const ReprocessResponseSchema = z.object({ queued: z.literal(true), jobId: z.string().nullable() })

/** GET /admin/jobs */
export const JobQueueStatsSchema = z.object({
  queues: z.array(z.object({ name: z.string(), created: z.number(), active: z.number(), completed: z.number(), failed: z.number() })),
})

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), total: z.number(), page: z.number(), pageSize: z.number() })
}

export type MeetingListItemDto = z.infer<typeof MeetingListItemSchema>
export type MeetingDetailDto = z.infer<typeof MeetingDetailSchema>
export type ActionItemDto = z.infer<typeof ActionItemDtoSchema>
export type ActionItemDetailDto = z.infer<typeof ActionItemDetailSchema>
export type AiReviewItemDto = z.infer<typeof AiReviewItemDtoSchema>
export type DashboardDto = z.infer<typeof DashboardDtoSchema>
export type WeeklyDigestDto = z.infer<typeof WeeklyDigestDtoSchema>
export type WeeklyDigestConfigDto = z.infer<typeof WeeklyDigestConfigDtoSchema>
export type UserDto = z.infer<typeof UserDtoSchema>
export type AreaDto = z.infer<typeof AreaDtoSchema>
export type ProjectDto = z.infer<typeof ProjectDtoSchema>
export type GoogleStatusDto = z.infer<typeof GoogleStatusDtoSchema>
export type PlatformSettingsDto = z.infer<typeof PlatformSettingsDtoSchema>
export type SheetsSyncResultDto = z.infer<typeof SheetsSyncResultSchema>
export type AuditEntryDto = z.infer<typeof AuditEntryDtoSchema>
export type SearchResultDto = z.infer<typeof SearchResultSchema>
export type SessionDto = z.infer<typeof SessionDtoSchema>
export type ExternalAssigneeDto = z.infer<typeof ExternalAssigneeDtoSchema>
export type NotificationCountsDto = z.infer<typeof NotificationCountsSchema>
export type AiReviewListQuery = z.infer<typeof AiReviewListQuerySchema>
export type CommentDto = z.infer<typeof CommentDtoSchema>
export type CompletionProposalDto = z.infer<typeof CompletionProposalDtoSchema>
export type ErrorResponseDto = z.infer<typeof ErrorResponseSchema>
