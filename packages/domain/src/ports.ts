import type {
  ActionItem,
  ActionItemComment,
  ActionItemMeetingLink,
  ActionItemStatusHistory,
  AiReviewItem,
  Area,
  AuditLogEntry,
  CalendarSyncCursor,
  CompletionProposal,
  Decision,
  ExternalAssignee,
  FeatureFlags,
  GoogleWorkspaceSubscription,
  Id,
  InboundGoogleEvent,
  LegacyImportReference,
  Meeting,
  MeetingParticipant,
  MeetingSummary,
  ProcessingRun,
  Project,
  ProjectAlias,
  Transcript,
  TranscriptSegment,
  User,
  UserAlias,
  WeeklyDigest,
  WeeklyDigestConfig,
} from './entities.js'
import type {
  ActionItemStatus,
  ArtifactStatus,
  MeetingProcessingStatus,
  RelationType,
} from './enums.js'
import type { ConfidenceThresholds } from './rules/confidence-gate.js'

// ---------------------------------------------------------------------------
// Puertos de infraestructura básicos
// ---------------------------------------------------------------------------

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  next(): Id
}

export interface CorrelationContext {
  correlationId: string
  actorUserId?: Id | null
}

// ---------------------------------------------------------------------------
// Repositorios (Application depende de estos, nunca de Prisma)
// ---------------------------------------------------------------------------

export interface PageRequest {
  page: number
  pageSize: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface UserRepository {
  findById(id: Id): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findByGoogleUserId(googleUserId: string): Promise<User | null>
  list(filter?: { active?: boolean; monitored?: boolean; areaId?: Id }): Promise<User[]>
  save(user: User): Promise<User>
  listAliases(): Promise<UserAlias[]>
  addAlias(alias: Omit<UserAlias, 'id'>): Promise<UserAlias>
  listTeamUserIds(managerId: Id): Promise<Id[]>
}

export interface AreaRepository {
  findById(id: Id): Promise<Area | null>
  findByName(name: string): Promise<Area | null>
  list(activeOnly?: boolean): Promise<Area[]>
  save(area: Area): Promise<Area>
}

export interface ProjectRepository {
  findById(id: Id): Promise<Project | null>
  findByAlias(aliasNormalized: string): Promise<Project | null>
  list(activeOnly?: boolean): Promise<Project[]>
  save(project: Project): Promise<Project>
  addAlias(alias: Omit<ProjectAlias, 'id'>): Promise<ProjectAlias>
  listAliases(): Promise<ProjectAlias[]>
}

export interface ExternalAssigneeRepository {
  findById(id: Id): Promise<ExternalAssignee | null>
  findByNormalizedName(nameNormalized: string): Promise<ExternalAssignee | null>
  list(): Promise<ExternalAssignee[]>
  save(assignee: ExternalAssignee): Promise<ExternalAssignee>
}

export interface MeetingFilter {
  from?: Date
  to?: Date
  organizerUserId?: Id
  areaId?: Id
  participantUserId?: Id
  processed?: boolean
  withActionItems?: boolean
  confidentialityLevel?: Meeting['confidentialityLevel']
  processingStatus?: MeetingProcessingStatus
  search?: string
  /** Restringe a reuniones visibles por el principal (RBAC server-side). */
  visibleToUserId?: Id
}

export interface MeetingRepository {
  findById(id: Id): Promise<Meeting | null>
  findByConferenceRecordId(name: string): Promise<Meeting | null>
  findByMeetingCode(meetingCode: string): Promise<Meeting[]>
  findByCalendarEventId(calendarEventId: string): Promise<Meeting | null>
  list(filter: MeetingFilter, page: PageRequest): Promise<Page<Meeting>>
  listRecent(limit: number): Promise<Meeting[]>
  listByStatus(status: MeetingProcessingStatus, limit: number): Promise<Meeting[]>
  save(meeting: Meeting): Promise<Meeting>
  updateProcessing(
    id: Id,
    patch: Partial<
      Pick<
        Meeting,
        | 'processingStatus'
        | 'transcriptStatus'
        | 'smartNotesStatus'
        | 'aiAnalysisStatus'
        | 'lastErrorCode'
        | 'lastErrorAt'
        | 'detectedLanguageCode'
        | 'mixedLanguageDetected'
        | 'status'
        | 'endAt'
        | 'durationSeconds'
        | 'googleConferenceRecordId'
      >
    >,
  ): Promise<Meeting>
  listParticipants(meetingId: Id): Promise<MeetingParticipant[]>
  replaceParticipants(meetingId: Id, participants: MeetingParticipant[]): Promise<void>
  countActionItems(meetingId: Id): Promise<number>
}

export interface TranscriptRepository {
  findByMeeting(meetingId: Id): Promise<Transcript[]>
  findByChecksum(meetingId: Id, checksum: string): Promise<Transcript | null>
  save(transcript: Transcript, segments: TranscriptSegment[]): Promise<Transcript>
  listSegments(transcriptId: Id): Promise<TranscriptSegment[]>
  findSegments(ids: Id[]): Promise<TranscriptSegment[]>
  deleteRawOlderThan(date: Date): Promise<number>
}

export interface SummaryRepository {
  findLatestByMeeting(meetingId: Id): Promise<MeetingSummary | null>
  listByMeeting(meetingId: Id): Promise<MeetingSummary[]>
  save(summary: MeetingSummary): Promise<MeetingSummary>
}

export interface DecisionRepository {
  listByMeeting(meetingId: Id): Promise<Decision[]>
  saveMany(decisions: Decision[]): Promise<void>
  save(decision: Decision): Promise<Decision>
  findById(id: Id): Promise<Decision | null>
}

export interface ActionItemFilter {
  status?: ActionItemStatus[]
  ownerUserId?: Id
  ownerUserIds?: Id[]
  externalAssigneeId?: Id
  areaId?: Id
  projectId?: Id
  meetingId?: Id
  overdueOnly?: boolean
  dueFrom?: Date
  dueTo?: Date
  noDueDate?: boolean
  noOwner?: boolean
  requiresReview?: boolean
  search?: string
  createdFrom?: Date
  createdTo?: Date
  completedFrom?: Date
  completedTo?: Date
  tags?: string[]
  /** Restringe a tareas visibles por el principal (RBAC server-side). */
  visibleToUserId?: Id
}

export interface ActionItemRepository {
  findById(id: Id): Promise<ActionItem | null>
  findByExternalKey(key: string): Promise<ActionItem | null>
  list(filter: ActionItemFilter, page: PageRequest): Promise<Page<ActionItem>>
  listAll(filter: ActionItemFilter): Promise<ActionItem[]>
  /** Búsqueda full-text (PostgreSQL) sobre título/descripción, limitada a abiertos si se indica. */
  searchFullText(query: string, options: { openOnly: boolean; limit: number }): Promise<ActionItem[]>
  nextSequence(): Promise<number>
  save(item: ActionItem): Promise<ActionItem>
  addLink(link: ActionItemMeetingLink): Promise<ActionItemMeetingLink>
  listLinks(actionItemId: Id): Promise<ActionItemMeetingLink[]>
  listLinksByMeeting(meetingId: Id): Promise<ActionItemMeetingLink[]>
  addStatusHistory(entry: ActionItemStatusHistory): Promise<void>
  listStatusHistory(actionItemId: Id): Promise<ActionItemStatusHistory[]>
  addComment(comment: ActionItemComment): Promise<ActionItemComment>
  listComments(actionItemId: Id): Promise<ActionItemComment[]>
  countMentionsWithoutProgress(actionItemId: Id): Promise<number>
}

export interface CompletionProposalRepository {
  findById(id: Id): Promise<CompletionProposal | null>
  findPendingByActionItem(actionItemId: Id): Promise<CompletionProposal | null>
  listPending(filter?: { actionItemIds?: Id[]; limit?: number }): Promise<CompletionProposal[]>
  save(proposal: CompletionProposal): Promise<CompletionProposal>
  expireOlderThan(date: Date): Promise<number>
}

export interface AiReviewRepository {
  findById(id: Id): Promise<AiReviewItem | null>
  listPending(filter?: { meetingId?: Id; limit?: number }): Promise<AiReviewItem[]>
  listByMeeting(meetingId: Id): Promise<AiReviewItem[]>
  save(item: AiReviewItem): Promise<AiReviewItem>
  countPending(): Promise<number>
}

export interface ProcessingRunRepository {
  findById(id: Id): Promise<ProcessingRun | null>
  listByMeeting(meetingId: Id): Promise<ProcessingRun[]>
  save(run: ProcessingRun): Promise<ProcessingRun>
  usageSummary(from: Date, to: Date): Promise<{
    runs: number
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    failures: number
  }>
}

export interface AuditLogRepository {
  append(entry: AuditLogEntry): Promise<void>
  list(
    filter: { entity?: string; entityId?: Id; actorUserId?: Id; from?: Date; to?: Date },
    page: PageRequest,
  ): Promise<Page<AuditLogEntry>>
}

export interface WeeklyDigestRepository {
  getConfig(): Promise<WeeklyDigestConfig>
  saveConfig(config: WeeklyDigestConfig): Promise<WeeklyDigestConfig>
  findById(id: Id): Promise<WeeklyDigest | null>
  findByWeek(weekStart: Date, audience: WeeklyDigest['audience']): Promise<WeeklyDigest | null>
  list(limit: number): Promise<WeeklyDigest[]>
  save(digest: WeeklyDigest): Promise<WeeklyDigest>
}

export interface GoogleSubscriptionRepository {
  findByUser(userId: Id): Promise<GoogleWorkspaceSubscription | null>
  list(): Promise<GoogleWorkspaceSubscription[]>
  listExpiringBefore(date: Date): Promise<GoogleWorkspaceSubscription[]>
  save(sub: GoogleWorkspaceSubscription): Promise<GoogleWorkspaceSubscription>
}

export interface InboundEventRepository {
  findByCloudEventId(cloudEventId: string): Promise<InboundGoogleEvent | null>
  /** Inserta si no existe; devuelve `created=false` cuando ya estaba (idempotencia §13.5). */
  insertIfAbsent(event: InboundGoogleEvent): Promise<{ created: boolean; event: InboundGoogleEvent }>
  save(event: InboundGoogleEvent): Promise<InboundGoogleEvent>
  listRecent(limit: number): Promise<InboundGoogleEvent[]>
  listFailed(limit: number): Promise<InboundGoogleEvent[]>
}

export interface CalendarSyncCursorRepository {
  find(userId: Id, calendarId: string): Promise<CalendarSyncCursor | null>
  save(cursor: CalendarSyncCursor): Promise<CalendarSyncCursor>
  list(): Promise<CalendarSyncCursor[]>
}

export interface LegacyImportRepository {
  saveMany(refs: LegacyImportReference[]): Promise<void>
  findByLegacyKey(sourceSheet: string, sourceRow: number, sourceFile: string): Promise<LegacyImportReference | null>
  listByBatch(batchId: Id): Promise<LegacyImportReference[]>
}

export interface PlatformSettings {
  featureFlags: FeatureFlags
  confidenceThresholds: ConfidenceThresholds
  companyTimezone: string
  companyDomain: string
  /** Política de retención de texto bruto (días). null = sin borrado automático. */
  rawTranscriptRetentionDays: number | null
  autoCaptureEnabled: boolean
  monitoredUserEmails: string[]
}

export interface SettingsRepository {
  get(): Promise<PlatformSettings>
  save(settings: PlatformSettings, updatedByUserId: Id | null): Promise<PlatformSettings>
}

/** Ejecuta `fn` en una transacción; los repos usados dentro deben ser los del `tx`. */
export interface UnitOfWork {
  run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>
}

export interface Repositories {
  users: UserRepository
  areas: AreaRepository
  projects: ProjectRepository
  externalAssignees: ExternalAssigneeRepository
  meetings: MeetingRepository
  transcripts: TranscriptRepository
  summaries: SummaryRepository
  decisions: DecisionRepository
  actionItems: ActionItemRepository
  completionProposals: CompletionProposalRepository
  aiReview: AiReviewRepository
  processingRuns: ProcessingRunRepository
  audit: AuditLogRepository
  digests: WeeklyDigestRepository
  googleSubscriptions: GoogleSubscriptionRepository
  inboundEvents: InboundEventRepository
  calendarCursors: CalendarSyncCursorRepository
  legacyImports: LegacyImportRepository
  settings: SettingsRepository
}

// ---------------------------------------------------------------------------
// Job queue (§6.3, §31)
// ---------------------------------------------------------------------------

export interface EnqueueOptions {
  /** Clave de unicidad: pg-boss singletonKey; evita duplicar trabajos en vuelo. */
  singletonKey?: string
  startAfterSeconds?: number
  retryLimit?: number
  retryBackoff?: boolean
  correlationId?: string
  priority?: number
}

export interface JobHandlerContext {
  jobId: string
  correlationId: string
  attempt: number
}

export type JobHandler<TPayload> = (payload: TPayload, ctx: JobHandlerContext) => Promise<void>

export interface JobQueuePort {
  enqueue<TPayload>(name: string, payload: TPayload, options?: EnqueueOptions): Promise<string | null>
  schedule<TPayload>(name: string, cron: string, payload: TPayload, options?: { timezone?: string }): Promise<void>
  work<TPayload>(name: string, handler: JobHandler<TPayload>, options?: { concurrency?: number }): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

// ---------------------------------------------------------------------------
// Puertos Google (implementados en @smlxl/google-workspace; fakes para dev)
// ---------------------------------------------------------------------------

export interface MeetSpace {
  name: string
  meetingCode: string
  meetingUri: string
  autoTranscriptionGeneration: 'ON' | 'OFF' | 'UNKNOWN'
  autoSmartNotesGeneration: 'ON' | 'OFF' | 'UNKNOWN'
}

export interface MeetConferenceRecord {
  name: string
  spaceName: string
  startTime: Date
  endTime: Date | null
  expireTime: Date | null
}

export interface MeetParticipant {
  name: string
  displayName: string
  email: string | null
  type: MeetingParticipant['participantType']
  earliestStartTime: Date | null
  latestEndTime: Date | null
}

export interface MeetTranscriptMeta {
  name: string
  state: 'STARTED' | 'ENDED' | 'FILE_GENERATED' | 'UNKNOWN'
  docsDocumentId: string | null
  startTime: Date | null
  endTime: Date | null
}

export interface MeetTranscriptEntry {
  name: string
  participantName: string | null
  text: string
  languageCode: string | null
  startTime: Date | null
  endTime: Date | null
}

export interface MeetSmartNoteMeta {
  name: string
  state: 'STARTED' | 'ENDED' | 'FILE_GENERATED' | 'UNKNOWN'
  docsDocumentId: string | null
  startTime: Date | null
  endTime: Date | null
}

/** Puerto de captura de reuniones (Google Meet REST API). `asUser` = impersonación DWD. */
export interface MeetingCapturePort {
  getSpaceByMeetingCode(meetingCode: string, asUser: string): Promise<MeetSpace | null>
  patchArtifactConfig(
    spaceName: string,
    config: { autoTranscription: boolean; autoSmartNotes: boolean },
    asUser: string,
  ): Promise<{ applied: boolean; blockedReason?: string }>
  getConferenceRecord(name: string, asUser: string): Promise<MeetConferenceRecord | null>
  listConferenceRecordsByMeetingCode(meetingCode: string, asUser: string): Promise<MeetConferenceRecord[]>
  listParticipants(conferenceRecordName: string, asUser: string): Promise<MeetParticipant[]>
  listTranscripts(conferenceRecordName: string, asUser: string): Promise<MeetTranscriptMeta[]>
  listTranscriptEntries(transcriptName: string, asUser: string): Promise<MeetTranscriptEntry[]>
  listSmartNotes(conferenceRecordName: string, asUser: string): Promise<MeetSmartNoteMeta[]>
}

export interface WorkspaceEventsPort {
  createUserSubscription(input: {
    userEmail: string
    userResourceName: string
    eventTypes: string[]
    pubsubTopic: string
  }): Promise<{ subscriptionName: string; expiresAt: Date }>
  renewSubscription(subscriptionName: string, asUser: string): Promise<{ expiresAt: Date }>
  deleteSubscription(subscriptionName: string, asUser: string): Promise<void>
  getSubscription(subscriptionName: string, asUser: string): Promise<{ state: string; expiresAt: Date } | null>
}

export interface CalendarEventSummary {
  calendarEventId: string
  iCalUid: string | null
  title: string
  description: string | null
  organizerEmail: string | null
  creatorEmail: string | null
  attendees: Array<{ email: string; responseStatus: string | null; isOrganizer: boolean }>
  startAt: Date
  endAt: Date | null
  timezone: string | null
  recurringEventId: string | null
  meetUri: string | null
  meetingCode: string | null
  status: 'confirmed' | 'tentative' | 'cancelled'
  updatedAt: Date
}

export interface CalendarPort {
  /** Sync incremental con syncToken; si Google responde 410 devuelve fullSyncRequired=true. */
  syncEvents(input: {
    userEmail: string
    calendarId: string
    syncToken: string | null
    timeMin?: Date
    timeMax?: Date
  }): Promise<{ events: CalendarEventSummary[]; nextSyncToken: string | null; fullSyncRequired: boolean }>
}

export interface DirectoryPort {
  listDomainUsers(domain: string): Promise<Array<{ googleUserId: string; email: string; displayName: string; suspended: boolean }>>
  resolveUserResourceName(email: string): Promise<string | null>
}

export interface DrivePort {
  exportDocumentText(documentId: string, asUser: string): Promise<string | null>
}

export interface MailMessage {
  to: string[]
  cc?: string[]
  subject: string
  html: string
  text: string
  /** Idempotencia: el adapter no reenvía el mismo id. */
  idempotencyKey: string
  replyTo?: string
}

export interface MailPort {
  send(message: MailMessage): Promise<{ messageId: string; skipped: boolean }>
}

export interface SheetRow {
  /** Clave estable (ActionItem.id / Meeting.id); nunca la posición de fila. */
  key: string
  values: Record<string, string | number | boolean | null>
}

export interface SheetsPort {
  upsertRows(input: {
    spreadsheetId: string
    sheetName: string
    keyColumn: string
    columns: string[]
    rows: SheetRow[]
  }): Promise<{ inserted: number; updated: number }>
}

export interface ArtifactStatusUpdate {
  transcriptStatus?: ArtifactStatus
  smartNotesStatus?: ArtifactStatus
}

export type LinkRelation = RelationType
