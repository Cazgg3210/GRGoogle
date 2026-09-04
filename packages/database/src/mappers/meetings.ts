import type {
  Decision,
  Meeting,
  MeetingParticipant,
  MeetingSummary,
  ProcessingRun,
  Transcript,
  TranscriptSegment,
} from '@smlxl/domain'
import type {
  Decision as DecisionRow,
  Meeting as MeetingRow,
  MeetingParticipant as ParticipantRow,
  MeetingSummary as SummaryRow,
  Prisma,
  ProcessingRun as RunRow,
  Transcript as TranscriptRow,
  TranscriptSegment as SegmentRow,
} from '../generated/client/index.js'
import {
  asEvidence,
  asStringArray,
  dateOnlyFromDb,
  dateOnlyToDb,
  jsonSafe,
  toNullableJson,
  type MapperContext,
} from './common.js'

// Meeting --------------------------------------------------------------------

export function toMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    googleConferenceRecordId: row.googleConferenceRecordId,
    googleMeetingSpaceId: row.googleMeetingSpaceId,
    googleMeetingCode: row.googleMeetingCode,
    googleCalendarEventId: row.googleCalendarEventId,
    title: row.title,
    organizerUserId: row.organizerUserId,
    organizerEmail: row.organizerEmail,
    isExternalHost: row.isExternalHost,
    startAt: row.startAt,
    endAt: row.endAt,
    durationSeconds: row.durationSeconds,
    status: row.status,
    source: row.source,
    processingStatus: row.processingStatus,
    transcriptStatus: row.transcriptStatus,
    smartNotesStatus: row.smartNotesStatus,
    aiAnalysisStatus: row.aiAnalysisStatus,
    confidentialityLevel: row.confidentialityLevel,
    excludedFromAi: row.excludedFromAi,
    reportedLanguageCode: row.reportedLanguageCode,
    detectedLanguageCode: row.detectedLanguageCode,
    mixedLanguageDetected: row.mixedLanguageDetected,
    lastErrorCode: row.lastErrorCode,
    lastErrorAt: row.lastErrorAt,
    areaId: row.areaId,
    projectId: row.projectId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function meetingToDb(m: Meeting): Prisma.MeetingUncheckedCreateInput {
  return {
    id: m.id,
    googleConferenceRecordId: m.googleConferenceRecordId,
    googleMeetingSpaceId: m.googleMeetingSpaceId,
    googleMeetingCode: m.googleMeetingCode,
    googleCalendarEventId: m.googleCalendarEventId,
    title: m.title,
    organizerUserId: m.organizerUserId,
    organizerEmail: m.organizerEmail,
    isExternalHost: m.isExternalHost,
    startAt: m.startAt,
    endAt: m.endAt,
    durationSeconds: m.durationSeconds,
    status: m.status,
    source: m.source,
    processingStatus: m.processingStatus,
    transcriptStatus: m.transcriptStatus,
    smartNotesStatus: m.smartNotesStatus,
    aiAnalysisStatus: m.aiAnalysisStatus,
    confidentialityLevel: m.confidentialityLevel,
    excludedFromAi: m.excludedFromAi,
    reportedLanguageCode: m.reportedLanguageCode,
    detectedLanguageCode: m.detectedLanguageCode,
    mixedLanguageDetected: m.mixedLanguageDetected,
    lastErrorCode: m.lastErrorCode,
    lastErrorAt: m.lastErrorAt,
    areaId: m.areaId,
    projectId: m.projectId,
  }
}

export function toParticipant(row: ParticipantRow): MeetingParticipant {
  return {
    id: row.id,
    meetingId: row.meetingId,
    internalUserId: row.internalUserId,
    googleParticipantId: row.googleParticipantId,
    displayName: row.displayName,
    email: row.email,
    participantType: row.participantType,
    isInternal: row.isInternal,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    speakingDurationSeconds: row.speakingDurationSeconds,
  }
}

export function participantToDb(p: MeetingParticipant): Prisma.MeetingParticipantUncheckedCreateInput {
  return {
    id: p.id,
    meetingId: p.meetingId,
    internalUserId: p.internalUserId,
    googleParticipantId: p.googleParticipantId,
    displayName: p.displayName,
    email: p.email,
    participantType: p.participantType,
    isInternal: p.isInternal,
    joinedAt: p.joinedAt,
    leftAt: p.leftAt,
    speakingDurationSeconds: p.speakingDurationSeconds,
  }
}

// Transcript -----------------------------------------------------------------

export function toTranscript(row: TranscriptRow): Transcript {
  return {
    id: row.id,
    meetingId: row.meetingId,
    sourceType: row.sourceType,
    googleTranscriptId: row.googleTranscriptId,
    languageCode: row.languageCode,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    rawText: row.rawText,
    structuredPayload: row.structuredPayload ?? null,
    sourceUri: row.sourceUri,
    retainedUntil: row.retainedUntil,
    ingestionChecksum: row.ingestionChecksum,
    createdAt: row.createdAt,
  }
}

export function transcriptToDb(t: Transcript): Prisma.TranscriptUncheckedCreateInput {
  return {
    id: t.id,
    meetingId: t.meetingId,
    sourceType: t.sourceType,
    googleTranscriptId: t.googleTranscriptId,
    languageCode: t.languageCode,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    rawText: t.rawText,
    structuredPayload: toNullableJson(t.structuredPayload),
    sourceUri: t.sourceUri,
    retainedUntil: t.retainedUntil,
    ingestionChecksum: t.ingestionChecksum,
    createdAt: t.createdAt,
  }
}

export function toSegment(row: SegmentRow): TranscriptSegment {
  return {
    id: row.id,
    transcriptId: row.transcriptId,
    participantId: row.participantId,
    speakerLabel: row.speakerLabel,
    text: row.text,
    startAt: row.startAt,
    endAt: row.endAt,
    sequence: row.sequence,
  }
}

export function segmentToDb(s: TranscriptSegment): Prisma.TranscriptSegmentUncheckedCreateInput {
  return {
    id: s.id,
    transcriptId: s.transcriptId,
    participantId: s.participantId,
    speakerLabel: s.speakerLabel,
    text: s.text,
    startAt: s.startAt,
    endAt: s.endAt,
    sequence: s.sequence,
  }
}

// Summary --------------------------------------------------------------------

export function toSummary(row: SummaryRow): MeetingSummary {
  return {
    id: row.id,
    meetingId: row.meetingId,
    processingRunId: row.processingRunId,
    executiveSummary: asStringArray(row.executiveSummary),
    detailedSummary: row.detailedSummary,
    topics: asStringArray(row.topics),
    risks: asStringArray(row.risks),
    openQuestions: asStringArray(row.openQuestions),
    aiModel: row.aiModel,
    promptVersion: row.promptVersion,
    generatedAt: row.generatedAt,
    approvedAt: row.approvedAt,
    approvedByUserId: row.approvedByUserId,
  }
}

export function summaryToDb(s: MeetingSummary): Prisma.MeetingSummaryUncheckedCreateInput {
  return {
    id: s.id,
    meetingId: s.meetingId,
    processingRunId: s.processingRunId,
    executiveSummary: jsonSafe(s.executiveSummary),
    detailedSummary: s.detailedSummary,
    topics: jsonSafe(s.topics),
    risks: jsonSafe(s.risks),
    openQuestions: jsonSafe(s.openQuestions),
    aiModel: s.aiModel,
    promptVersion: s.promptVersion,
    generatedAt: s.generatedAt,
    approvedAt: s.approvedAt,
    approvedByUserId: s.approvedByUserId,
  }
}

// Decision -------------------------------------------------------------------

export function toDecision(row: DecisionRow, ctx: MapperContext): Decision {
  return {
    id: row.id,
    meetingId: row.meetingId,
    processingRunId: row.processingRunId,
    description: row.description,
    decidedBy: row.decidedBy,
    effectiveDate: dateOnlyFromDb(row.effectiveDate, ctx),
    confidence: row.confidence,
    sourceSegmentIds: row.sourceSegmentIds,
    evidence: asEvidence(row.evidence),
    status: row.status,
    createdAt: row.createdAt,
  }
}

export function decisionToDb(d: Decision, ctx: MapperContext): Prisma.DecisionUncheckedCreateInput {
  return {
    id: d.id,
    meetingId: d.meetingId,
    processingRunId: d.processingRunId,
    description: d.description,
    decidedBy: d.decidedBy,
    effectiveDate: dateOnlyToDb(d.effectiveDate, ctx),
    confidence: d.confidence,
    sourceSegmentIds: d.sourceSegmentIds,
    evidence: jsonSafe(d.evidence),
    status: d.status,
    createdAt: d.createdAt,
  }
}

// ProcessingRun --------------------------------------------------------------

export function toProcessingRun(row: RunRow): ProcessingRun {
  return {
    id: row.id,
    meetingId: row.meetingId,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    schemaVersion: row.schemaVersion,
    temperature: row.temperature,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cachedTokens: row.cachedTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    latencyMs: row.latencyMs,
    success: row.success,
    errorCode: row.errorCode,
    correlationId: row.correlationId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  }
}

export function processingRunToDb(r: ProcessingRun): Prisma.ProcessingRunUncheckedCreateInput {
  return {
    id: r.id,
    meetingId: r.meetingId,
    kind: r.kind,
    provider: r.provider,
    model: r.model,
    promptVersion: r.promptVersion,
    schemaVersion: r.schemaVersion,
    temperature: r.temperature,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cachedTokens: r.cachedTokens,
    estimatedCostUsd: r.estimatedCostUsd,
    latencyMs: r.latencyMs,
    success: r.success,
    errorCode: r.errorCode,
    correlationId: r.correlationId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }
}
