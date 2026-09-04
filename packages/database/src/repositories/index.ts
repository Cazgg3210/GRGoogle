import type { Repositories } from '@smlxl/domain'
import type { Db, RepositoryDefaults } from './base.js'
import { PrismaActionItemRepository } from './action-item.repository.js'
import { PrismaAiReviewRepository } from './ai-review.repository.js'
import { PrismaAreaRepository } from './area.repository.js'
import { PrismaAuditLogRepository } from './audit-log.repository.js'
import { PrismaCalendarSyncCursorRepository } from './calendar-cursor.repository.js'
import { PrismaCompletionProposalRepository } from './completion-proposal.repository.js'
import { PrismaDecisionRepository } from './decision.repository.js'
import { PrismaExternalAssigneeRepository } from './external-assignee.repository.js'
import { PrismaGoogleSubscriptionRepository } from './google-subscription.repository.js'
import { PrismaInboundEventRepository } from './inbound-event.repository.js'
import { PrismaLegacyImportRepository } from './legacy-import.repository.js'
import { PrismaMeetingRepository } from './meeting.repository.js'
import { PrismaProcessingRunRepository } from './processing-run.repository.js'
import { PrismaProjectRepository } from './project.repository.js'
import { PrismaSettingsRepository } from './settings.repository.js'
import { PrismaSummaryRepository } from './summary.repository.js'
import { PrismaTranscriptRepository } from './transcript.repository.js'
import { PrismaUserRepository } from './user.repository.js'
import { PrismaWeeklyDigestRepository } from './weekly-digest.repository.js'

/** Conjunto de repositorios con los tipos concretos (útil para métodos extra, p. ej. lotes legado). */
export interface PrismaRepositories extends Repositories {
  users: PrismaUserRepository
  areas: PrismaAreaRepository
  projects: PrismaProjectRepository
  externalAssignees: PrismaExternalAssigneeRepository
  meetings: PrismaMeetingRepository
  transcripts: PrismaTranscriptRepository
  summaries: PrismaSummaryRepository
  decisions: PrismaDecisionRepository
  actionItems: PrismaActionItemRepository
  completionProposals: PrismaCompletionProposalRepository
  aiReview: PrismaAiReviewRepository
  processingRuns: PrismaProcessingRunRepository
  audit: PrismaAuditLogRepository
  digests: PrismaWeeklyDigestRepository
  googleSubscriptions: PrismaGoogleSubscriptionRepository
  inboundEvents: PrismaInboundEventRepository
  calendarCursors: PrismaCalendarSyncCursorRepository
  legacyImports: PrismaLegacyImportRepository
  settings: PrismaSettingsRepository
}

/** Construye todos los repositorios sobre un cliente (o transacción) Prisma. */
export function createRepositories(db: Db, defaults: RepositoryDefaults): PrismaRepositories {
  return {
    users: new PrismaUserRepository(db, defaults),
    areas: new PrismaAreaRepository(db, defaults),
    projects: new PrismaProjectRepository(db, defaults),
    externalAssignees: new PrismaExternalAssigneeRepository(db, defaults),
    meetings: new PrismaMeetingRepository(db, defaults),
    transcripts: new PrismaTranscriptRepository(db, defaults),
    summaries: new PrismaSummaryRepository(db, defaults),
    decisions: new PrismaDecisionRepository(db, defaults),
    actionItems: new PrismaActionItemRepository(db, defaults),
    completionProposals: new PrismaCompletionProposalRepository(db, defaults),
    aiReview: new PrismaAiReviewRepository(db, defaults),
    processingRuns: new PrismaProcessingRunRepository(db, defaults),
    audit: new PrismaAuditLogRepository(db, defaults),
    digests: new PrismaWeeklyDigestRepository(db, defaults),
    googleSubscriptions: new PrismaGoogleSubscriptionRepository(db, defaults),
    inboundEvents: new PrismaInboundEventRepository(db, defaults),
    calendarCursors: new PrismaCalendarSyncCursorRepository(db, defaults),
    legacyImports: new PrismaLegacyImportRepository(db, defaults),
    settings: new PrismaSettingsRepository(db, defaults),
  }
}

export type { Db, RepositoryDefaults } from './base.js'
export { PrismaActionItemRepository } from './action-item.repository.js'
export { PrismaAiReviewRepository } from './ai-review.repository.js'
export { PrismaAreaRepository } from './area.repository.js'
export { PrismaAuditLogRepository } from './audit-log.repository.js'
export { PrismaCalendarSyncCursorRepository } from './calendar-cursor.repository.js'
export { PrismaCompletionProposalRepository } from './completion-proposal.repository.js'
export { PrismaDecisionRepository } from './decision.repository.js'
export { PrismaExternalAssigneeRepository } from './external-assignee.repository.js'
export { PrismaGoogleSubscriptionRepository } from './google-subscription.repository.js'
export { PrismaInboundEventRepository } from './inbound-event.repository.js'
export { PrismaLegacyImportRepository, type LegacyImportBatch } from './legacy-import.repository.js'
export { PrismaMeetingRepository } from './meeting.repository.js'
export { PrismaProcessingRunRepository } from './processing-run.repository.js'
export { PrismaProjectRepository } from './project.repository.js'
export { PrismaSettingsRepository, SETTINGS_ROW_ID } from './settings.repository.js'
export { PrismaSummaryRepository } from './summary.repository.js'
export { PrismaTranscriptRepository } from './transcript.repository.js'
export { PrismaUserRepository } from './user.repository.js'
export { PrismaWeeklyDigestRepository } from './weekly-digest.repository.js'
