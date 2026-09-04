import {
  ActionItemStatus,
  DEFAULT_COMPANY_TIMEZONE,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  OPEN_ACTION_ITEM_STATUSES,
  isOverdue,
  normalizeText,
  tokenize,
  type ActionItem,
  type ActionItemComment,
  type ActionItemFilter,
  type ActionItemMeetingLink,
  type ActionItemRepository,
  type ActionItemStatusHistory,
  type AiReviewItem,
  type AiReviewRepository,
  type Area,
  type AreaRepository,
  type AuditLogEntry,
  type AuditLogRepository,
  type CalendarSyncCursor,
  type CalendarSyncCursorRepository,
  type Clock,
  type CompletionProposal,
  type CompletionProposalRepository,
  type Decision,
  type DecisionRepository,
  type ExternalAssignee,
  type ExternalAssigneeRepository,
  type FeatureFlags,
  type GoogleSubscriptionRepository,
  type GoogleWorkspaceSubscription,
  type Id,
  type InboundEventRepository,
  type InboundGoogleEvent,
  type LegacyImportReference,
  type LegacyImportRepository,
  type Meeting,
  type MeetingFilter,
  type MeetingParticipant,
  type MeetingProcessingStatus,
  type MeetingRepository,
  type MeetingSummary,
  type Page,
  type PageRequest,
  type PlatformSettings,
  type ProcessingRun,
  type ProcessingRunRepository,
  type Project,
  type ProjectAlias,
  type ProjectRepository,
  type Repositories,
  type SettingsRepository,
  type SummaryRepository,
  type Transcript,
  type TranscriptRepository,
  type TranscriptSegment,
  type UnitOfWork,
  type User,
  type UserAlias,
  type UserRepository,
  type WeeklyDigest,
  type WeeklyDigestConfig,
  type WeeklyDigestRepository,
} from '@smlxl/domain'

/**
 * Implementación en memoria de `Repositories` + `UnitOfWork` para tests y
 * demos. Los filtros replican la semántica esperada del repositorio Prisma
 * (incluida búsqueda full-text simplificada por tokens). `visibleToUserId`
 * se ignora: el alcance se aplica en la capa de aplicación.
 */
export interface InMemoryState {
  users: Map<Id, User>
  userAliases: UserAlias[]
  areas: Map<Id, Area>
  projects: Map<Id, Project>
  projectAliases: ProjectAlias[]
  externalAssignees: Map<Id, ExternalAssignee>
  meetings: Map<Id, Meeting>
  participants: Map<Id, MeetingParticipant[]>
  transcripts: Map<Id, Transcript>
  segments: Map<Id, TranscriptSegment[]>
  summaries: Map<Id, MeetingSummary>
  decisions: Map<Id, Decision>
  actionItems: Map<Id, ActionItem>
  links: ActionItemMeetingLink[]
  history: ActionItemStatusHistory[]
  comments: ActionItemComment[]
  proposals: Map<Id, CompletionProposal>
  aiReview: Map<Id, AiReviewItem>
  runs: Map<Id, ProcessingRun>
  audit: AuditLogEntry[]
  digests: Map<Id, WeeklyDigest>
  digestConfig: WeeklyDigestConfig
  subscriptions: Map<Id, GoogleWorkspaceSubscription>
  inboundEvents: Map<Id, InboundGoogleEvent>
  cursors: Map<string, CalendarSyncCursor>
  legacy: LegacyImportReference[]
  settings: PlatformSettings
  sequence: number
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  GOOGLE_INTEGRATION_ENABLED: false,
  GOOGLE_MEET_EVENTS_ENABLED: false,
  AI_PROCESSING_ENABLED: true,
  AI_COMPLETION_PROPOSALS_ENABLED: true,
  GMAIL_NOTIFICATIONS_ENABLED: true,
  SHEETS_SYNC_ENABLED: true,
  WEEKLY_DIGEST_ENABLED: true,
}

export function defaultSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, ...(overrides.featureFlags ?? {}) },
    confidenceThresholds: {
      ...DEFAULT_CONFIDENCE_THRESHOLDS,
      ...(overrides.confidenceThresholds ?? {}),
    },
    companyTimezone: overrides.companyTimezone ?? DEFAULT_COMPANY_TIMEZONE,
    companyDomain: overrides.companyDomain ?? 'smlxl.mx',
    rawTranscriptRetentionDays:
      overrides.rawTranscriptRetentionDays === undefined
        ? 90
        : overrides.rawTranscriptRetentionDays,
    autoCaptureEnabled: overrides.autoCaptureEnabled ?? true,
    monitoredUserEmails: overrides.monitoredUserEmails ?? [],
  }
}

export function defaultDigestConfig(now: Date): WeeklyDigestConfig {
  return {
    id: 'digest-config',
    enabled: true,
    timezone: DEFAULT_COMPANY_TIMEZONE,
    dayOfWeek: 5,
    localTime: '18:00',
    recipientUserIds: [],
    includeAreaIds: null,
    includeExternalTasks: true,
    attachSpreadsheet: false,
    sendEmail: true,
    createdByUserId: null,
    updatedByUserId: null,
    updatedAt: now,
  }
}

export function emptyState(now: Date, settings?: Partial<PlatformSettings>): InMemoryState {
  return {
    users: new Map(),
    userAliases: [],
    areas: new Map(),
    projects: new Map(),
    projectAliases: [],
    externalAssignees: new Map(),
    meetings: new Map(),
    participants: new Map(),
    transcripts: new Map(),
    segments: new Map(),
    summaries: new Map(),
    decisions: new Map(),
    actionItems: new Map(),
    links: [],
    history: [],
    comments: [],
    proposals: new Map(),
    aiReview: new Map(),
    runs: new Map(),
    audit: [],
    digests: new Map(),
    digestConfig: defaultDigestConfig(now),
    subscriptions: new Map(),
    inboundEvents: new Map(),
    cursors: new Map(),
    legacy: [],
    settings: defaultSettings(settings),
    sequence: 0,
  }
}

const clone = <T>(v: T): T => structuredClone(v)

function pageOf<T>(items: T[], page: PageRequest): Page<T> {
  const start = (page.page - 1) * page.pageSize
  return {
    items: items.slice(start, start + page.pageSize),
    total: items.length,
    page: page.page,
    pageSize: page.pageSize,
  }
}

function includesText(hay: string | null | undefined, needle: string): boolean {
  return normalizeText(hay ?? '').includes(normalizeText(needle))
}

class Users implements UserRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.users.get(id) ?? null
  }
  async findByEmail(email: string) {
    return (
      [...this.s.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
    )
  }
  async findByGoogleUserId(googleUserId: string) {
    return [...this.s.users.values()].find((u) => u.googleUserId === googleUserId) ?? null
  }
  async list(filter: { active?: boolean; monitored?: boolean; areaId?: Id } = {}) {
    return [...this.s.users.values()].filter(
      (u) =>
        (filter.active === undefined || u.active === filter.active) &&
        (filter.monitored === undefined || u.monitored === filter.monitored) &&
        (filter.areaId === undefined || u.areaId === filter.areaId),
    )
  }
  async save(user: User) {
    this.s.users.set(user.id, clone(user))
    return user
  }
  async listAliases() {
    return [...this.s.userAliases]
  }
  async addAlias(alias: Omit<UserAlias, 'id'>) {
    const a = { id: `alias-${this.s.userAliases.length + 1}`, ...alias }
    this.s.userAliases.push(a)
    return a
  }
  async listTeamUserIds(managerId: Id) {
    return [...this.s.users.values()].filter((u) => u.managerId === managerId).map((u) => u.id)
  }
}

class Areas implements AreaRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.areas.get(id) ?? null
  }
  async findByName(name: string) {
    return (
      [...this.s.areas.values()].find((a) => normalizeText(a.name) === normalizeText(name)) ?? null
    )
  }
  async list(activeOnly = false) {
    return [...this.s.areas.values()]
      .filter((a) => !activeOnly || a.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }
  async save(area: Area) {
    this.s.areas.set(area.id, clone(area))
    return area
  }
}

class Projects implements ProjectRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.projects.get(id) ?? null
  }
  async findByAlias(aliasNormalized: string) {
    const n = normalizeText(aliasNormalized)
    const a = this.s.projectAliases.find((x) => x.aliasNormalized === n)
    if (a) return this.s.projects.get(a.projectId) ?? null
    return [...this.s.projects.values()].find((p) => normalizeText(p.canonicalName) === n) ?? null
  }
  async list(activeOnly = false) {
    return [...this.s.projects.values()].filter((p) => !activeOnly || p.active)
  }
  async save(project: Project) {
    this.s.projects.set(project.id, clone(project))
    return project
  }
  async addAlias(alias: Omit<ProjectAlias, 'id'>) {
    const a = { id: `palias-${this.s.projectAliases.length + 1}`, ...alias }
    this.s.projectAliases.push(a)
    return a
  }
  async listAliases() {
    return [...this.s.projectAliases]
  }
}

class Externals implements ExternalAssigneeRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.externalAssignees.get(id) ?? null
  }
  async findByNormalizedName(n: string) {
    return (
      [...this.s.externalAssignees.values()].find(
        (e) => normalizeText(e.displayName) === normalizeText(n),
      ) ?? null
    )
  }
  async list() {
    return [...this.s.externalAssignees.values()]
  }
  async save(e: ExternalAssignee) {
    this.s.externalAssignees.set(e.id, clone(e))
    return e
  }
}

class Meetings implements MeetingRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.meetings.get(id) ?? null
  }
  async findByConferenceRecordId(name: string) {
    return [...this.s.meetings.values()].find((m) => m.googleConferenceRecordId === name) ?? null
  }
  async findByMeetingCode(code: string) {
    return [...this.s.meetings.values()].filter((m) => m.googleMeetingCode === code)
  }
  async findByCalendarEventId(id: string) {
    return [...this.s.meetings.values()].find((m) => m.googleCalendarEventId === id) ?? null
  }
  async list(filter: MeetingFilter, page: PageRequest) {
    const items = [...this.s.meetings.values()]
      .filter((m) => {
        if (filter.from && m.startAt < filter.from) return false
        if (filter.to && m.startAt > filter.to) return false
        if (filter.organizerUserId && m.organizerUserId !== filter.organizerUserId) return false
        if (filter.areaId && m.areaId !== filter.areaId) return false
        if (
          filter.participantUserId &&
          !(this.s.participants.get(m.id) ?? []).some(
            (p) => p.internalUserId === filter.participantUserId,
          )
        )
          return false
        if (filter.processed !== undefined) {
          const processed = ['COMPLETED', 'REVIEW_REQUIRED', 'ANALYZED'].includes(
            m.processingStatus,
          )
          if (processed !== filter.processed) return false
        }
        if (filter.withActionItems !== undefined) {
          const has = this.s.links.some((l) => l.meetingId === m.id)
          if (has !== filter.withActionItems) return false
        }
        if (filter.confidentialityLevel && m.confidentialityLevel !== filter.confidentialityLevel)
          return false
        if (filter.processingStatus && m.processingStatus !== filter.processingStatus) return false
        if (filter.search && !includesText(m.title, filter.search)) return false
        return true
      })
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    return pageOf(items, page)
  }
  async listRecent(limit: number) {
    return [...this.s.meetings.values()]
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
      .slice(0, limit)
  }
  async listByStatus(status: MeetingProcessingStatus, limit: number) {
    return [...this.s.meetings.values()]
      .filter((m) => m.processingStatus === status)
      .slice(0, limit)
  }
  async save(meeting: Meeting) {
    this.s.meetings.set(meeting.id, clone(meeting))
    return meeting
  }
  async updateProcessing(id: Id, patch: Parameters<MeetingRepository['updateProcessing']>[1]) {
    const m = this.s.meetings.get(id)
    if (!m) throw new Error(`Meeting ${id} no existe`)
    const next = {
      ...m,
      ...patch,
      updatedAt: new Date(Math.max(m.updatedAt.getTime(), Date.now())),
    }
    this.s.meetings.set(id, next)
    return next
  }
  async listParticipants(meetingId: Id) {
    return [...(this.s.participants.get(meetingId) ?? [])]
  }
  async replaceParticipants(meetingId: Id, participants: MeetingParticipant[]) {
    this.s.participants.set(meetingId, clone(participants))
  }
  async countActionItems(meetingId: Id) {
    const ids = new Set(
      this.s.links.filter((l) => l.meetingId === meetingId).map((l) => l.actionItemId),
    )
    for (const i of this.s.actionItems.values())
      if (i.createdFromMeetingId === meetingId) ids.add(i.id)
    return ids.size
  }
}

class Transcripts implements TranscriptRepository {
  constructor(private readonly s: InMemoryState) {}
  async findByMeeting(meetingId: Id) {
    return [...this.s.transcripts.values()].filter((t) => t.meetingId === meetingId)
  }
  async findByChecksum(meetingId: Id, checksum: string) {
    return (
      [...this.s.transcripts.values()].find(
        (t) => t.meetingId === meetingId && t.ingestionChecksum === checksum,
      ) ?? null
    )
  }
  async save(transcript: Transcript, segments: TranscriptSegment[]) {
    this.s.transcripts.set(transcript.id, clone(transcript))
    this.s.segments.set(transcript.id, clone(segments))
    return transcript
  }
  async listSegments(transcriptId: Id) {
    return [...(this.s.segments.get(transcriptId) ?? [])].sort((a, b) => a.sequence - b.sequence)
  }
  async findSegments(ids: Id[]) {
    const set = new Set(ids)
    return [...this.s.segments.values()].flat().filter((s) => set.has(s.id))
  }
  async deleteRawOlderThan(date: Date) {
    let n = 0
    for (const t of this.s.transcripts.values()) {
      if (t.retainedUntil && t.retainedUntil < date && t.rawText !== '') {
        this.s.transcripts.set(t.id, { ...t, rawText: '' })
        this.s.segments.set(t.id, [])
        n += 1
      }
    }
    return n
  }
}

class Summaries implements SummaryRepository {
  constructor(private readonly s: InMemoryState) {}
  async findLatestByMeeting(meetingId: Id) {
    return (await this.listByMeeting(meetingId))[0] ?? null
  }
  async listByMeeting(meetingId: Id) {
    return [...this.s.summaries.values()]
      .filter((x) => x.meetingId === meetingId)
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
  }
  async save(summary: MeetingSummary) {
    this.s.summaries.set(summary.id, clone(summary))
    return summary
  }
}

class Decisions implements DecisionRepository {
  constructor(private readonly s: InMemoryState) {}
  async listByMeeting(meetingId: Id) {
    return [...this.s.decisions.values()].filter((d) => d.meetingId === meetingId)
  }
  async saveMany(decisions: Decision[]) {
    for (const d of decisions) this.s.decisions.set(d.id, clone(d))
  }
  async save(d: Decision) {
    this.s.decisions.set(d.id, clone(d))
    return d
  }
  async findById(id: Id) {
    return this.s.decisions.get(id) ?? null
  }
}

class ActionItems implements ActionItemRepository {
  constructor(
    private readonly s: InMemoryState,
    private readonly clock: Clock,
  ) {}
  private matches(i: ActionItem, f: ActionItemFilter): boolean {
    if (f.status && !f.status.includes(i.status)) return false
    if (f.ownerUserId && i.ownerUserId !== f.ownerUserId) return false
    if (f.ownerUserIds && (!i.ownerUserId || !f.ownerUserIds.includes(i.ownerUserId))) return false
    if (f.externalAssigneeId && i.externalAssigneeId !== f.externalAssigneeId) return false
    if (f.areaId && i.areaId !== f.areaId) return false
    if (f.projectId && i.projectId !== f.projectId) return false
    if (
      f.meetingId &&
      i.createdFromMeetingId !== f.meetingId &&
      i.latestMeetingId !== f.meetingId &&
      !this.s.links.some((l) => l.actionItemId === i.id && l.meetingId === f.meetingId)
    )
      return false
    if (
      f.overdueOnly &&
      !isOverdue(
        { dueDate: i.dueDate, status: i.status },
        this.clock.now(),
        this.s.settings.companyTimezone,
      )
    )
      return false
    if (f.dueFrom && (!i.dueDate || i.dueDate < f.dueFrom)) return false
    if (f.dueTo && (!i.dueDate || i.dueDate > f.dueTo)) return false
    if (f.noDueDate && i.dueDate !== null) return false
    if (f.noOwner && (i.ownerUserId !== null || i.externalAssigneeId !== null)) return false
    if (f.requiresReview !== undefined && i.requiresReview !== f.requiresReview) return false
    if (f.search && !includesText(`${i.title} ${i.description ?? ''} ${i.externalKey}`, f.search))
      return false
    if (f.createdFrom && i.createdAt < f.createdFrom) return false
    if (f.createdTo && i.createdAt > f.createdTo) return false
    if (f.completedFrom && (!i.completedAt || i.completedAt < f.completedFrom)) return false
    if (f.completedTo && (!i.completedAt || i.completedAt > f.completedTo)) return false
    if (f.tags && f.tags.length > 0 && !f.tags.some((t) => i.tags.includes(t))) return false
    return true
  }
  async findById(id: Id) {
    return this.s.actionItems.get(id) ?? null
  }
  async findByExternalKey(key: string) {
    return [...this.s.actionItems.values()].find((i) => i.externalKey === key) ?? null
  }
  async list(filter: ActionItemFilter, page: PageRequest) {
    return pageOf(await this.listAll(filter), page)
  }
  async listAll(filter: ActionItemFilter) {
    return [...this.s.actionItems.values()]
      .filter((i) => this.matches(i, filter))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }
  async searchFullText(query: string, options: { openOnly: boolean; limit: number }) {
    const tokens = tokenize(query).filter((t) => t.length > 2)
    if (tokens.length === 0) return []
    return [...this.s.actionItems.values()]
      .filter((i) => !options.openOnly || OPEN_ACTION_ITEM_STATUSES.includes(i.status))
      .map((i) => ({
        i,
        hits: tokens.filter((t) => normalizeText(`${i.title} ${i.description ?? ''}`).includes(t))
          .length,
      }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, options.limit)
      .map((x) => x.i)
  }
  async nextSequence() {
    this.s.sequence += 1
    return this.s.sequence
  }
  async save(item: ActionItem) {
    this.s.actionItems.set(item.id, clone(item))
    return item
  }
  async addLink(link: ActionItemMeetingLink) {
    this.s.links.push(clone(link))
    return link
  }
  async listLinks(actionItemId: Id) {
    return this.s.links.filter((l) => l.actionItemId === actionItemId)
  }
  async listLinksByMeeting(meetingId: Id) {
    return this.s.links.filter((l) => l.meetingId === meetingId)
  }
  async addStatusHistory(entry: ActionItemStatusHistory) {
    this.s.history.push(clone(entry))
  }
  async listStatusHistory(actionItemId: Id) {
    return this.s.history
      .filter((h) => h.actionItemId === actionItemId)
      .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())
  }
  async addComment(comment: ActionItemComment) {
    this.s.comments.push(clone(comment))
    return comment
  }
  async listComments(actionItemId: Id) {
    return this.s.comments.filter((c) => c.actionItemId === actionItemId)
  }
  async countMentionsWithoutProgress(actionItemId: Id) {
    const history = await this.listStatusHistory(actionItemId)
    const lastChange =
      history.length > 1 ? (history[history.length - 1]?.changedAt.getTime() ?? 0) : 0
    return this.s.links.filter(
      (l) =>
        l.actionItemId === actionItemId &&
        l.relationType === 'MENTIONED' &&
        l.createdAt.getTime() >= lastChange,
    ).length
  }
}

class Proposals implements CompletionProposalRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.proposals.get(id) ?? null
  }
  async findPendingByActionItem(actionItemId: Id) {
    return (
      [...this.s.proposals.values()].find(
        (p) => p.actionItemId === actionItemId && p.status === 'PENDING',
      ) ?? null
    )
  }
  async listPending(filter: { actionItemIds?: Id[]; limit?: number } = {}) {
    return [...this.s.proposals.values()]
      .filter(
        (p) =>
          p.status === 'PENDING' &&
          (!filter.actionItemIds || filter.actionItemIds.includes(p.actionItemId)),
      )
      .slice(0, filter.limit ?? 1000)
  }
  async save(p: CompletionProposal) {
    this.s.proposals.set(p.id, clone(p))
    return p
  }
  async expireOlderThan(date: Date) {
    let n = 0
    for (const p of this.s.proposals.values())
      if (p.status === 'PENDING' && p.createdAt < date) {
        this.s.proposals.set(p.id, { ...p, status: 'EXPIRED' })
        n += 1
      }
    return n
  }
}

class AiReview implements AiReviewRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.aiReview.get(id) ?? null
  }
  async listPending(filter: { meetingId?: Id; limit?: number } = {}) {
    return [...this.s.aiReview.values()]
      .filter(
        (r) => r.status === 'PENDING' && (!filter.meetingId || r.meetingId === filter.meetingId),
      )
      .slice(0, filter.limit ?? 1000)
  }
  async listByMeeting(meetingId: Id) {
    return [...this.s.aiReview.values()].filter((r) => r.meetingId === meetingId)
  }
  async save(item: AiReviewItem) {
    this.s.aiReview.set(item.id, clone(item))
    return item
  }
  async countPending() {
    return (await this.listPending()).length
  }
}

class Runs implements ProcessingRunRepository {
  constructor(private readonly s: InMemoryState) {}
  async findById(id: Id) {
    return this.s.runs.get(id) ?? null
  }
  async listByMeeting(meetingId: Id) {
    return [...this.s.runs.values()]
      .filter((r) => r.meetingId === meetingId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  }
  async save(run: ProcessingRun) {
    this.s.runs.set(run.id, clone(run))
    return run
  }
  async usageSummary(from: Date, to: Date) {
    const runs = [...this.s.runs.values()].filter((r) => r.startedAt >= from && r.startedAt <= to)
    return {
      runs: runs.length,
      inputTokens: runs.reduce((n, r) => n + (r.inputTokens ?? 0), 0),
      outputTokens: runs.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
      estimatedCostUsd: runs.reduce((n, r) => n + (r.estimatedCostUsd ?? 0), 0),
      failures: runs.filter((r) => !r.success && r.finishedAt !== null).length,
    }
  }
}

class Audit implements AuditLogRepository {
  constructor(private readonly s: InMemoryState) {}
  async append(entry: AuditLogEntry) {
    this.s.audit.push(clone(entry))
  }
  async list(
    filter: { entity?: string; entityId?: Id; actorUserId?: Id; from?: Date; to?: Date },
    page: PageRequest,
  ) {
    const items = this.s.audit
      .filter(
        (e) =>
          (!filter.entity || e.entity === filter.entity) &&
          (!filter.entityId || e.entityId === filter.entityId) &&
          (!filter.actorUserId || e.actorUserId === filter.actorUserId) &&
          (!filter.from || e.timestamp >= filter.from) &&
          (!filter.to || e.timestamp <= filter.to),
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    return pageOf(items, page)
  }
}

class Digests implements WeeklyDigestRepository {
  constructor(private readonly s: InMemoryState) {}
  async getConfig() {
    return clone(this.s.digestConfig)
  }
  async saveConfig(config: WeeklyDigestConfig) {
    this.s.digestConfig = clone(config)
    return config
  }
  async findById(id: Id) {
    return this.s.digests.get(id) ?? null
  }
  async findByWeek(weekStart: Date, audience: WeeklyDigest['audience']) {
    return (
      [...this.s.digests.values()]
        .filter((d) => d.weekStart.getTime() === weekStart.getTime() && d.audience === audience)
        .sort((a, b) => b.version - a.version)[0] ?? null
    )
  }
  async list(limit: number) {
    return [...this.s.digests.values()]
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
      .slice(0, limit)
  }
  async save(d: WeeklyDigest) {
    this.s.digests.set(d.id, clone(d))
    return d
  }
}

class Subscriptions implements GoogleSubscriptionRepository {
  constructor(private readonly s: InMemoryState) {}
  async findByUser(userId: Id) {
    return [...this.s.subscriptions.values()].find((x) => x.monitoredUserId === userId) ?? null
  }
  async list() {
    return [...this.s.subscriptions.values()]
  }
  async listExpiringBefore(date: Date) {
    return [...this.s.subscriptions.values()].filter((x) => x.expiresAt < date)
  }
  async save(sub: GoogleWorkspaceSubscription) {
    this.s.subscriptions.set(sub.id, clone(sub))
    return sub
  }
}

class InboundEvents implements InboundEventRepository {
  constructor(private readonly s: InMemoryState) {}
  async findByCloudEventId(cloudEventId: string) {
    return [...this.s.inboundEvents.values()].find((e) => e.cloudEventId === cloudEventId) ?? null
  }
  async insertIfAbsent(event: InboundGoogleEvent) {
    const existing = await this.findByCloudEventId(event.cloudEventId)
    if (existing) return { created: false, event: existing }
    this.s.inboundEvents.set(event.id, clone(event))
    return { created: true, event }
  }
  async save(event: InboundGoogleEvent) {
    this.s.inboundEvents.set(event.id, clone(event))
    return event
  }
  async listRecent(limit: number) {
    return [...this.s.inboundEvents.values()]
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, limit)
  }
  async listFailed(limit: number) {
    return [...this.s.inboundEvents.values()]
      .filter((e) => e.processingStatus === 'FAILED')
      .slice(0, limit)
  }
}

class Cursors implements CalendarSyncCursorRepository {
  constructor(private readonly s: InMemoryState) {}
  async find(userId: Id, calendarId: string) {
    return this.s.cursors.get(`${userId}|${calendarId}`) ?? null
  }
  async save(cursor: CalendarSyncCursor) {
    this.s.cursors.set(`${cursor.userId}|${cursor.calendarId}`, clone(cursor))
    return cursor
  }
  async list() {
    return [...this.s.cursors.values()]
  }
}

class Legacy implements LegacyImportRepository {
  constructor(private readonly s: InMemoryState) {}
  async saveMany(refs: LegacyImportReference[]) {
    this.s.legacy.push(...clone(refs))
  }
  async findByLegacyKey(sourceSheet: string, sourceRow: number, sourceFile: string) {
    return (
      this.s.legacy.find(
        (r) =>
          r.sourceSheet === sourceSheet && r.sourceRow === sourceRow && r.sourceFile === sourceFile,
      ) ?? null
    )
  }
  async listByBatch(batchId: Id) {
    return this.s.legacy.filter((r) => r.importBatchId === batchId)
  }
}

class Settings implements SettingsRepository {
  constructor(private readonly s: InMemoryState) {}
  async get() {
    return clone(this.s.settings)
  }
  async save(settings: PlatformSettings) {
    this.s.settings = clone(settings)
    return settings
  }
}

export class InMemoryRepositories implements Repositories {
  readonly users: UserRepository
  readonly areas: AreaRepository
  readonly projects: ProjectRepository
  readonly externalAssignees: ExternalAssigneeRepository
  readonly meetings: MeetingRepository
  readonly transcripts: TranscriptRepository
  readonly summaries: SummaryRepository
  readonly decisions: DecisionRepository
  readonly actionItems: ActionItemRepository
  readonly completionProposals: CompletionProposalRepository
  readonly aiReview: AiReviewRepository
  readonly processingRuns: ProcessingRunRepository
  readonly audit: AuditLogRepository
  readonly digests: WeeklyDigestRepository
  readonly googleSubscriptions: GoogleSubscriptionRepository
  readonly inboundEvents: InboundEventRepository
  readonly calendarCursors: CalendarSyncCursorRepository
  readonly legacyImports: LegacyImportRepository
  readonly settings: SettingsRepository

  constructor(
    readonly state: InMemoryState,
    clock: Clock,
  ) {
    this.users = new Users(state)
    this.areas = new Areas(state)
    this.projects = new Projects(state)
    this.externalAssignees = new Externals(state)
    this.meetings = new Meetings(state)
    this.transcripts = new Transcripts(state)
    this.summaries = new Summaries(state)
    this.decisions = new Decisions(state)
    this.actionItems = new ActionItems(state, clock)
    this.completionProposals = new Proposals(state)
    this.aiReview = new AiReview(state)
    this.processingRuns = new Runs(state)
    this.audit = new Audit(state)
    this.digests = new Digests(state)
    this.googleSubscriptions = new Subscriptions(state)
    this.inboundEvents = new InboundEvents(state)
    this.calendarCursors = new Cursors(state)
    this.legacyImports = new Legacy(state)
    this.settings = new Settings(state)
  }
}

/** UnitOfWork en memoria con snapshot/restore (rollback ante excepción). */
export class InMemoryUnitOfWork implements UnitOfWork {
  private depth = 0
  constructor(private readonly repos: InMemoryRepositories) {}
  async run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    const state = this.repos.state
    const snapshot = this.depth === 0 ? snapshotState(state) : null
    this.depth += 1
    try {
      return await fn(this.repos)
    } catch (err) {
      if (snapshot) restoreState(state, snapshot)
      throw err
    } finally {
      this.depth -= 1
    }
  }
}

type Snapshot = Omit<InMemoryState, never>

function snapshotState(state: InMemoryState): Snapshot {
  return structuredClone(state)
}

function restoreState(state: InMemoryState, snapshot: Snapshot): void {
  for (const key of Object.keys(snapshot) as Array<keyof InMemoryState>) {
    ;(state as unknown as Record<string, unknown>)[key] = snapshot[key]
  }
}

export function isOpenStatusValue(status: ActionItemStatus): boolean {
  return OPEN_ACTION_ITEM_STATUSES.includes(status)
}
