-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('PROPOSED', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'WAITING', 'COMPLETION_PROPOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionItemPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ActionItemType" AS ENUM ('ONE_OFF', 'RECURRING');

-- CreateEnum
CREATE TYPE "MigrationTrust" AS ENUM ('PLATFORM', 'LEGACY');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('CREATED', 'MENTIONED', 'UPDATED', 'BLOCKED', 'COMPLETED', 'REOPENED');

-- CreateEnum
CREATE TYPE "CompletionProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProposedByType" AS ENUM ('AI', 'USER');

-- CreateEnum
CREATE TYPE "MeetingProcessingStatus" AS ENUM ('DISCOVERED', 'WAITING_FOR_ARTIFACTS', 'ARTIFACTS_AVAILABLE', 'INGESTING', 'INGESTED', 'ANALYZING', 'ANALYZED', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingSource" AS ENUM ('WORKSPACE_EVENT', 'CALENDAR_DISCOVERY', 'MANUAL_IMPORT', 'LEGACY_IMPORT');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'AVAILABLE', 'INGESTED', 'UNAVAILABLE', 'UNAVAILABLE_EXTERNAL_HOST', 'CAPABILITY_BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConfidentialityLevel" AS ENUM ('NORMAL', 'RESTRICTED', 'LEGAL', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('SIGNED_IN_USER', 'ANONYMOUS_USER', 'PHONE_USER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TranscriptSourceType" AS ENUM ('MEET_TRANSCRIPT', 'MEET_SMART_NOTES', 'MANUAL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DIRECTOR', 'MANAGER', 'MEMBER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReconcileDecision" AS ENUM ('CREATE_NEW', 'LINK_EXISTING', 'UPDATE_EXISTING', 'MARK_DONE_CANDIDATE', 'REOPEN_CANDIDATE', 'REQUIRES_HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "AiReviewItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "AiReviewReason" AS ENUM ('LOW_CONFIDENCE', 'AMBIGUOUS_OWNER', 'AMBIGUOUS_DUE_DATE', 'POSSIBLE_DUPLICATE', 'POSSIBLE_COMPLETION', 'CONFLICT_WITH_EXISTING');

-- CreateEnum
CREATE TYPE "InboundEventProcessingStatus" AS ENUM ('RECEIVED', 'QUEUED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionState" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'DELETED', 'ERROR');

-- CreateEnum
CREATE TYPE "DigestAudience" AS ENUM ('EXECUTIVE', 'INDIVIDUAL', 'AREA');

-- CreateEnum
CREATE TYPE "ProcessingRunKind" AS ENUM ('ANALYZE_MEETING', 'RECONCILE', 'WEEKLY_DIGEST', 'REPROCESS');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'AI', 'IMPORT');

-- CreateEnum
CREATE TYPE "CommentSource" AS ENUM ('USER', 'LEGACY_IMPORT', 'SYSTEM');

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isExternalCategory" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "areaId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_aliases" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "project_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "googleUserId" TEXT,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "areaId" UUID,
    "managerId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monitored" BOOLEAN NOT NULL DEFAULT false,
    "notificationPreferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_aliases" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "user_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_assignees" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "external_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "googleConferenceRecordId" TEXT,
    "googleMeetingSpaceId" TEXT,
    "googleMeetingCode" TEXT,
    "googleCalendarEventId" TEXT,
    "title" TEXT NOT NULL,
    "organizerUserId" UUID,
    "organizerEmail" TEXT,
    "isExternalHost" BOOLEAN NOT NULL DEFAULT false,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6),
    "durationSeconds" INTEGER,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "MeetingSource" NOT NULL,
    "processingStatus" "MeetingProcessingStatus" NOT NULL DEFAULT 'DISCOVERED',
    "transcriptStatus" "ArtifactStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "smartNotesStatus" "ArtifactStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "aiAnalysisStatus" "AiAnalysisStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "confidentialityLevel" "ConfidentialityLevel" NOT NULL DEFAULT 'NORMAL',
    "excludedFromAi" BOOLEAN NOT NULL DEFAULT false,
    "reportedLanguageCode" TEXT,
    "detectedLanguageCode" TEXT,
    "mixedLanguageDetected" BOOLEAN NOT NULL DEFAULT false,
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMPTZ(6),
    "areaId" UUID,
    "projectId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "internalUserId" UUID,
    "googleParticipantId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "participantType" "ParticipantType" NOT NULL DEFAULT 'UNKNOWN',
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ(6),
    "leftAt" TIMESTAMPTZ(6),
    "speakingDurationSeconds" INTEGER,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "sourceType" "TranscriptSourceType" NOT NULL,
    "googleTranscriptId" TEXT,
    "languageCode" TEXT,
    "startedAt" TIMESTAMPTZ(6),
    "endedAt" TIMESTAMPTZ(6),
    "rawText" TEXT NOT NULL,
    "structuredPayload" JSONB,
    "sourceUri" TEXT,
    "retainedUntil" TIMESTAMPTZ(6),
    "ingestionChecksum" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" UUID NOT NULL,
    "transcriptId" UUID NOT NULL,
    "participantId" UUID,
    "speakerLabel" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_summaries" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "processingRunId" UUID NOT NULL,
    "executiveSummary" JSONB NOT NULL,
    "detailedSummary" TEXT NOT NULL,
    "topics" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "openQuestions" JSONB NOT NULL,
    "aiModel" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ(6),
    "approvedByUserId" UUID,

    CONSTRAINT "meeting_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "processingRunId" UUID,
    "description" TEXT NOT NULL,
    "decidedBy" TEXT,
    "effectiveDate" DATE,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sourceSegmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" UUID NOT NULL,
    "sequence" SERIAL NOT NULL,
    "externalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ActionItemType" NOT NULL DEFAULT 'ONE_OFF',
    "ownerUserId" UUID,
    "externalAssigneeId" UUID,
    "ownerTextOriginal" TEXT,
    "areaId" UUID,
    "projectId" UUID,
    "createdFromMeetingId" UUID,
    "latestMeetingId" UUID,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "ActionItemPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATE,
    "dueDateTextOriginal" TEXT,
    "dateConfidence" DOUBLE PRECISION,
    "startDate" DATE,
    "completedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "confidence" DOUBLE PRECISION,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "sourceEvidence" JSONB NOT NULL DEFAULT '[]',
    "recurrence" JSONB,
    "parentActionItemId" UUID,
    "blocker" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "migrationTrust" "MigrationTrust" NOT NULL DEFAULT 'PLATFORM',
    "legacyId" TEXT,
    "lastMentionedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item_collaborators" (
    "actionItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "action_item_collaborators_pkey" PRIMARY KEY ("actionItemId","userId")
);

-- CreateTable
CREATE TABLE "action_item_meeting_links" (
    "id" UUID NOT NULL,
    "actionItemId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "relationType" "RelationType" NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "previousStatus" "ActionItemStatus",
    "detectedStatus" "ActionItemStatus",
    "detectedDueDate" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_item_meeting_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item_status_history" (
    "id" UUID NOT NULL,
    "actionItemId" UUID NOT NULL,
    "fromStatus" "ActionItemStatus",
    "toStatus" "ActionItemStatus" NOT NULL,
    "changedByUserId" UUID,
    "changedBySystem" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "meetingId" UUID,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_item_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item_comments" (
    "id" UUID NOT NULL,
    "actionItemId" UUID NOT NULL,
    "authorUserId" UUID,
    "body" TEXT NOT NULL,
    "source" "CommentSource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_item_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completion_proposals" (
    "id" UUID NOT NULL,
    "actionItemId" UUID NOT NULL,
    "proposedByType" "ProposedByType" NOT NULL,
    "proposedByUserId" UUID,
    "proposedFromMeetingId" UUID,
    "reason" TEXT NOT NULL,
    "evidenceSegmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "CompletionProposalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "completion_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_review_items" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "processingRunId" UUID NOT NULL,
    "reasons" "AiReviewReason"[] DEFAULT ARRAY[]::"AiReviewReason"[],
    "reconcileDecision" "ReconcileDecision" NOT NULL,
    "candidateActionItemId" UUID,
    "candidateScore" DOUBLE PRECISION,
    "proposedActionItemId" UUID,
    "extracted" JSONB NOT NULL,
    "suggestedOwnerUserId" UUID,
    "suggestedOwnerConfidence" DOUBLE PRECISION,
    "suggestedDueDate" DATE,
    "suggestedDueDateConfidence" DOUBLE PRECISION,
    "status" "AiReviewItemStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_runs" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "kind" "ProcessingRunKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "processing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_workspace_subscriptions" (
    "id" UUID NOT NULL,
    "monitoredUserId" UUID NOT NULL,
    "monitoredUserEmail" TEXT NOT NULL,
    "googleSubscriptionName" TEXT NOT NULL,
    "targetResource" TEXT NOT NULL,
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "state" "SubscriptionState" NOT NULL DEFAULT 'ACTIVE',
    "lastRenewedAt" TIMESTAMPTZ(6),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "google_workspace_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_google_events" (
    "id" UUID NOT NULL,
    "cloudEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "subject" TEXT,
    "occurredAt" TIMESTAMPTZ(6),
    "resourceName" TEXT,
    "rawPayloadRedacted" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "processingStatus" "InboundEventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,

    CONSTRAINT "inbound_google_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_sync_cursors" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "calendarId" TEXT NOT NULL,
    "syncToken" TEXT,
    "lastFullSyncAt" TIMESTAMPTZ(6),
    "lastIncrementalSyncAt" TIMESTAMPTZ(6),
    "lastError" TEXT,

    CONSTRAINT "calendar_sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_digest_configs" (
    "id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "dayOfWeek" INTEGER NOT NULL DEFAULT 5,
    "localTime" TEXT NOT NULL DEFAULT '18:00',
    "recipientUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includeAreaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includeAllAreas" BOOLEAN NOT NULL DEFAULT true,
    "includeExternalTasks" BOOLEAN NOT NULL DEFAULT true,
    "attachSpreadsheet" BOOLEAN NOT NULL DEFAULT false,
    "sendEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "weekly_digest_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_digests" (
    "id" UUID NOT NULL,
    "weekStart" TIMESTAMPTZ(6) NOT NULL,
    "weekEnd" TIMESTAMPTZ(6) NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audience" "DigestAudience" NOT NULL DEFAULT 'EXECUTIVE',
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "recipientEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "weekly_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipientUserId" UUID,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "source" TEXT NOT NULL,
    "correlationId" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "featureFlags" JSONB NOT NULL DEFAULT '{}',
    "confidenceThresholds" JSONB NOT NULL DEFAULT '{"autoAccept":0.9,"proposal":0.7}',
    "companyTimezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "companyDomain" TEXT NOT NULL DEFAULT 'smlxl.mx',
    "rawTranscriptRetentionDays" INTEGER,
    "autoCaptureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monitoredUserEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_import_batches" (
    "id" UUID NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "report" JSONB,

    CONSTRAINT "legacy_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_import_references" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "legacyId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "importBatchId" UUID NOT NULL,
    "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_import_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "areas_name_key" ON "areas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "areas_code_key" ON "areas"("code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_canonicalName_key" ON "projects"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "project_aliases_aliasNormalized_key" ON "project_aliases"("aliasNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleUserId_key" ON "users"("googleUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_areaId_idx" ON "users"("areaId");

-- CreateIndex
CREATE INDEX "users_managerId_idx" ON "users"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "user_aliases_aliasNormalized_key" ON "user_aliases"("aliasNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "external_assignees_nameNormalized_key" ON "external_assignees"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_googleConferenceRecordId_key" ON "meetings"("googleConferenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_googleCalendarEventId_key" ON "meetings"("googleCalendarEventId");

-- CreateIndex
CREATE INDEX "meetings_startAt_idx" ON "meetings"("startAt");

-- CreateIndex
CREATE INDEX "meetings_organizerUserId_idx" ON "meetings"("organizerUserId");

-- CreateIndex
CREATE INDEX "meetings_processingStatus_idx" ON "meetings"("processingStatus");

-- CreateIndex
CREATE INDEX "meetings_googleMeetingCode_idx" ON "meetings"("googleMeetingCode");

-- CreateIndex
CREATE INDEX "meeting_participants_meetingId_idx" ON "meeting_participants"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_participants_internalUserId_idx" ON "meeting_participants"("internalUserId");

-- CreateIndex
CREATE INDEX "transcripts_meetingId_idx" ON "transcripts"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_meetingId_ingestionChecksum_key" ON "transcripts"("meetingId", "ingestionChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_segments_transcriptId_sequence_key" ON "transcript_segments"("transcriptId", "sequence");

-- CreateIndex
CREATE INDEX "meeting_summaries_meetingId_idx" ON "meeting_summaries"("meetingId");

-- CreateIndex
CREATE INDEX "decisions_meetingId_idx" ON "decisions"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "action_items_sequence_key" ON "action_items"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "action_items_externalKey_key" ON "action_items"("externalKey");

-- CreateIndex
CREATE INDEX "action_items_status_idx" ON "action_items"("status");

-- CreateIndex
CREATE INDEX "action_items_ownerUserId_idx" ON "action_items"("ownerUserId");

-- CreateIndex
CREATE INDEX "action_items_areaId_idx" ON "action_items"("areaId");

-- CreateIndex
CREATE INDEX "action_items_projectId_idx" ON "action_items"("projectId");

-- CreateIndex
CREATE INDEX "action_items_dueDate_idx" ON "action_items"("dueDate");

-- CreateIndex
CREATE INDEX "action_items_createdFromMeetingId_idx" ON "action_items"("createdFromMeetingId");

-- CreateIndex
CREATE INDEX "action_items_legacyId_idx" ON "action_items"("legacyId");

-- CreateIndex
CREATE INDEX "action_item_meeting_links_actionItemId_idx" ON "action_item_meeting_links"("actionItemId");

-- CreateIndex
CREATE INDEX "action_item_meeting_links_meetingId_idx" ON "action_item_meeting_links"("meetingId");

-- CreateIndex
CREATE INDEX "action_item_status_history_actionItemId_idx" ON "action_item_status_history"("actionItemId");

-- CreateIndex
CREATE INDEX "action_item_comments_actionItemId_idx" ON "action_item_comments"("actionItemId");

-- CreateIndex
CREATE INDEX "completion_proposals_actionItemId_status_idx" ON "completion_proposals"("actionItemId", "status");

-- CreateIndex
CREATE INDEX "ai_review_items_status_idx" ON "ai_review_items"("status");

-- CreateIndex
CREATE INDEX "ai_review_items_meetingId_idx" ON "ai_review_items"("meetingId");

-- CreateIndex
CREATE INDEX "processing_runs_meetingId_idx" ON "processing_runs"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "google_workspace_subscriptions_googleSubscriptionName_key" ON "google_workspace_subscriptions"("googleSubscriptionName");

-- CreateIndex
CREATE INDEX "google_workspace_subscriptions_expiresAt_idx" ON "google_workspace_subscriptions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "google_workspace_subscriptions_monitoredUserId_key" ON "google_workspace_subscriptions"("monitoredUserId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_google_events_cloudEventId_key" ON "inbound_google_events"("cloudEventId");

-- CreateIndex
CREATE INDEX "inbound_google_events_processingStatus_idx" ON "inbound_google_events"("processingStatus");

-- CreateIndex
CREATE INDEX "inbound_google_events_receivedAt_idx" ON "inbound_google_events"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sync_cursors_userId_calendarId_key" ON "calendar_sync_cursors"("userId", "calendarId");

-- CreateIndex
CREATE INDEX "weekly_digests_weekStart_idx" ON "weekly_digests"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_digests_weekStart_audience_version_key" ON "weekly_digests"("weekStart", "audience", "version");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_idempotencyKey_key" ON "notification_logs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "notification_logs_recipientEmail_sentAt_idx" ON "notification_logs"("recipientEmail", "sentAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "legacy_import_references_legacyId_idx" ON "legacy_import_references"("legacyId");

-- CreateIndex
CREATE INDEX "legacy_import_references_entityType_entityId_idx" ON "legacy_import_references"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_import_references_sourceFile_sourceSheet_sourceRow_key" ON "legacy_import_references"("sourceFile", "sourceSheet", "sourceRow");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_aliases" ADD CONSTRAINT "project_aliases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_internalUserId_fkey" FOREIGN KEY ("internalUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "meeting_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_processingRunId_fkey" FOREIGN KEY ("processingRunId") REFERENCES "processing_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_processingRunId_fkey" FOREIGN KEY ("processingRunId") REFERENCES "processing_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_externalAssigneeId_fkey" FOREIGN KEY ("externalAssigneeId") REFERENCES "external_assignees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_createdFromMeetingId_fkey" FOREIGN KEY ("createdFromMeetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_latestMeetingId_fkey" FOREIGN KEY ("latestMeetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_parentActionItemId_fkey" FOREIGN KEY ("parentActionItemId") REFERENCES "action_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_collaborators" ADD CONSTRAINT "action_item_collaborators_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_collaborators" ADD CONSTRAINT "action_item_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_meeting_links" ADD CONSTRAINT "action_item_meeting_links_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_meeting_links" ADD CONSTRAINT "action_item_meeting_links_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_status_history" ADD CONSTRAINT "action_item_status_history_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_status_history" ADD CONSTRAINT "action_item_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_status_history" ADD CONSTRAINT "action_item_status_history_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_comments" ADD CONSTRAINT "action_item_comments_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_comments" ADD CONSTRAINT "action_item_comments_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_proposals" ADD CONSTRAINT "completion_proposals_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_proposals" ADD CONSTRAINT "completion_proposals_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_proposals" ADD CONSTRAINT "completion_proposals_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_proposals" ADD CONSTRAINT "completion_proposals_proposedFromMeetingId_fkey" FOREIGN KEY ("proposedFromMeetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_processingRunId_fkey" FOREIGN KEY ("processingRunId") REFERENCES "processing_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_candidateActionItemId_fkey" FOREIGN KEY ("candidateActionItemId") REFERENCES "action_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_proposedActionItemId_fkey" FOREIGN KEY ("proposedActionItemId") REFERENCES "action_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_suggestedOwnerUserId_fkey" FOREIGN KEY ("suggestedOwnerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_workspace_subscriptions" ADD CONSTRAINT "google_workspace_subscriptions_monitoredUserId_fkey" FOREIGN KEY ("monitoredUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_sync_cursors" ADD CONSTRAINT "calendar_sync_cursors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_import_references" ADD CONSTRAINT "legacy_import_references_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "legacy_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
