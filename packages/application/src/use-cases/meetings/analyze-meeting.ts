import { MeetingAnalysisResultSchema } from '@smlxl/contracts'
import {
  DomainError,
  DomainErrorCode,
  MeetingProcessingStatus,
  OPEN_ACTION_ITEM_STATUSES,
  TranscriptSourceType,
  isDomainError,
  toLocalDateString,
  type AiUsage,
  type AnalyzeMeetingInput,
  type Decision,
  type Meeting,
  type MeetingAnalysisResult,
  type MeetingSummary,
  type OpenActionContext,
  type ProcessingRun,
  type Repositories,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { audit, setProcessingStatus } from '../../shared.js'
import { applyReconciliation, planReconciliation, type ReconcileSummary } from './reconcile-action-items.js'

/**
 * AnalyzeMeeting (§10.2 pasos 1–5, §10.4, §35): construye el input compacto,
 * crea el ProcessingRun, llama al motor IA, valida el schema, persiste resumen y
 * decisiones (sin perder análisis previos) y reconcilia los action items.
 */
export interface AnalyzeMeetingResult {
  meetingId: string
  processingRunId: string
  processingStatus: Meeting['processingStatus']
  reconcile: ReconcileSummary | null
  skipped: boolean
}

export async function buildAnalyzeInput(ctx: AppContext, repos: Repositories, meeting: Meeting): Promise<AnalyzeMeetingInput> {
  const settings = await ctx.getSettings()
  const transcripts = await repos.transcripts.findByMeeting(meeting.id)
  const byNewest = [...transcripts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const main = byNewest.find((t) => t.sourceType === TranscriptSourceType.MEET_TRANSCRIPT) ?? byNewest.find((t) => t.sourceType === TranscriptSourceType.MANUAL) ?? null
  const notes = byNewest.find((t) => t.sourceType === TranscriptSourceType.MEET_SMART_NOTES) ?? null
  const segments = main ? await repos.transcripts.listSegments(main.id) : []
  if (segments.length === 0 && !notes) {
    throw new DomainError(DomainErrorCode.TRANSCRIPT_EMPTY, 'La reunión no tiene transcripción ni notas para analizar', { details: { meetingId: meeting.id } })
  }
  const participants = await repos.meetings.listParticipants(meeting.id)
  const participantUserIds = new Set(participants.map((p) => p.internalUserId).filter((id): id is string => id !== null))
  const users = await repos.users.list()
  const areaIds = new Set(users.filter((u) => participantUserIds.has(u.id)).map((u) => u.areaId).filter((a): a is string => a !== null))
  const open = await repos.actionItems.listAll({ status: [...OPEN_ACTION_ITEM_STATUSES] })
  const related = open
    .filter((a) => (a.ownerUserId && participantUserIds.has(a.ownerUserId)) || (a.areaId && areaIds.has(a.areaId)) || (meeting.projectId && a.projectId === meeting.projectId))
    .sort((a, b) => (b.lastMentionedAt?.getTime() ?? b.updatedAt.getTime()) - (a.lastMentionedAt?.getTime() ?? a.updatedAt.getTime()))
    .slice(0, 40)
  const projects = await repos.projects.list()
  const openActions: OpenActionContext[] = related.map((a) => ({
    id: a.id,
    externalKey: a.externalKey,
    title: a.title,
    ownerName: a.ownerUserId ? (users.find((u) => u.id === a.ownerUserId)?.displayName ?? null) : a.ownerTextOriginal,
    status: a.status,
    dueDate: a.dueDate ? toLocalDateString(a.dueDate, settings.companyTimezone) : null,
    projectName: a.projectId ? (projects.find((p) => p.id === a.projectId)?.canonicalName ?? null) : null,
  }))
  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      startAt: meeting.startAt.toISOString(),
      endAt: meeting.endAt?.toISOString() ?? null,
      organizerEmail: meeting.organizerEmail,
      reportedLanguageCode: meeting.reportedLanguageCode ?? main?.languageCode ?? null,
    },
    participants: participants.map((p) => ({ displayName: p.displayName, email: p.email, isInternal: p.isInternal, internalUserId: p.internalUserId })),
    segments: segments.map((s) => ({ id: s.id, sequence: s.sequence, speakerLabel: s.speakerLabel, text: s.text, startTime: s.startAt?.toISOString() ?? null, endTime: s.endAt?.toISOString() ?? null })),
    smartNotesText: notes?.rawText ?? null,
    openActions,
    companyDomain: settings.companyDomain,
    referenceDate: toLocalDateString(meeting.startAt, settings.companyTimezone),
    timezone: settings.companyTimezone,
  }
}

export async function analyzeMeeting(ctx: AppContext, input: { meetingId: string; kind?: ProcessingRun['kind']; correlationId?: string }): Promise<AnalyzeMeetingResult> {
  const settings = await ctx.getSettings()
  const kind = input.kind ?? 'ANALYZE_MEETING'
  const correlationId = input.correlationId ?? ctx.ids.next()
  const meeting = await ctx.repos.meetings.findById(input.meetingId)
  if (!meeting) throw DomainError.notFound('Meeting', input.meetingId)
  if (meeting.excludedFromAi) {
    await ctx.uow.run(async (repos) => {
      const m = (await repos.meetings.findById(meeting.id)) ?? meeting
      if (m.processingStatus === MeetingProcessingStatus.INGESTED) await setProcessingStatus(repos, m, MeetingProcessingStatus.COMPLETED, { aiAnalysisStatus: 'SKIPPED' })
      else await repos.meetings.updateProcessing(m.id, { aiAnalysisStatus: 'SKIPPED' })
    })
    return { meetingId: meeting.id, processingRunId: '', processingStatus: MeetingProcessingStatus.COMPLETED, reconcile: null, skipped: true }
  }
  const startedAt = ctx.clock.now()
  const run: ProcessingRun = {
    id: ctx.ids.next(),
    meetingId: meeting.id,
    kind,
    provider: ctx.ai.providerName,
    model: '',
    promptVersion: '',
    schemaVersion: '',
    temperature: null,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    estimatedCostUsd: null,
    latencyMs: null,
    success: false,
    errorCode: null,
    correlationId,
    startedAt,
    finishedAt: null,
  }
  // El run se registra antes de llamar al modelo para que un fallo quede trazado.
  let analyzeInput: AnalyzeMeetingInput
  try {
    analyzeInput = await ctx.uow.run(async (repos) => {
      const m = (await repos.meetings.findById(meeting.id)) ?? meeting
      await repos.processingRuns.save(run)
      await setProcessingStatus(repos, m, MeetingProcessingStatus.ANALYZING, { aiAnalysisStatus: 'RUNNING' })
      return buildAnalyzeInput(ctx, repos, m)
    })
  } catch (err) {
    const code = isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR
    await ctx.repos.processingRuns.save({ ...run, success: false, errorCode: code, finishedAt: ctx.clock.now() })
    await ctx.repos.meetings.updateProcessing(meeting.id, { processingStatus: MeetingProcessingStatus.FAILED, aiAnalysisStatus: 'FAILED', lastErrorCode: code, lastErrorAt: ctx.clock.now() })
    metrics.increment(MetricNames.AI_FAILURES, 1, { reason: code })
    throw err
  }

  let analysis: MeetingAnalysisResult
  let usage: AiUsage | undefined
  try {
    const response = await ctx.ai.analyzeMeeting(analyzeInput)
    usage = response.usage
    const validated = MeetingAnalysisResultSchema.safeParse(response.result)
    if (!validated.success) {
      throw new DomainError(DomainErrorCode.AI_INVALID_OUTPUT, 'La salida del modelo no cumple el schema', {
        details: { issues: validated.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`) },
      })
    }
    analysis = validated.data
  } catch (err) {
    const code = isDomainError(err) ? err.code : DomainErrorCode.AI_PROVIDER_ERROR
    const finishedAt = ctx.clock.now()
    metrics.increment(MetricNames.AI_FAILURES, 1, { reason: code })
    await ctx.uow.run(async (repos) => {
      await repos.processingRuns.save({
        ...run,
        model: usage?.model ?? run.model,
        promptVersion: usage?.promptVersion ?? run.promptVersion,
        schemaVersion: usage?.schemaVersion ?? run.schemaVersion,
        success: false,
        errorCode: code,
        latencyMs: finishedAt.getTime() - startedAt.getTime(),
        finishedAt,
      })
      await repos.meetings.updateProcessing(meeting.id, { processingStatus: MeetingProcessingStatus.FAILED, aiAnalysisStatus: 'FAILED', lastErrorCode: code, lastErrorAt: finishedAt })
      await audit(repos, ctx, { actorType: 'AI', action: 'meeting.analysis.failed', entity: 'Meeting', entityId: meeting.id, after: { runId: run.id, errorCode: code }, correlationId })
    })
    await ctx.events.publish({ type: 'MeetingProcessingFailed', meetingId: meeting.id, errorCode: code, occurredAt: finishedAt })
    throw err
  }

  const finishedAt = ctx.clock.now()
  const referenceDate = analyzeInput.referenceDate
  const result = await ctx.uow.run(async (repos) => {
    const m = (await repos.meetings.findById(meeting.id)) ?? meeting
    const participants = await repos.meetings.listParticipants(m.id)
    const savedRun = await repos.processingRuns.save({
      ...run,
      model: usage.model,
      promptVersion: usage.promptVersion,
      schemaVersion: usage.schemaVersion,
      temperature: usage.temperature,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      latencyMs: usage.latencyMs,
      success: true,
      errorCode: null,
      finishedAt,
    })
    metrics.increment(MetricNames.AI_RUNS, 1, { kind, provider: usage.provider })
    const summary: MeetingSummary = {
      id: ctx.ids.next(),
      meetingId: m.id,
      processingRunId: savedRun.id,
      executiveSummary: analysis.summary.executive,
      detailedSummary: analysis.summary.detailed,
      topics: analysis.topics.map((t) => t.title),
      risks: [...analysis.summary.risks, ...analysis.summary.attentionPoints.map((a) => `Atención: ${a}`)],
      openQuestions: analysis.summary.openQuestions,
      aiModel: usage.model,
      promptVersion: usage.promptVersion,
      generatedAt: finishedAt,
      approvedAt: null,
      approvedByUserId: null,
    }
    await repos.summaries.save(summary)
    const decisions: Decision[] = analysis.decisions.map((d) => ({
      id: ctx.ids.next(),
      meetingId: m.id,
      processingRunId: savedRun.id,
      description: d.description,
      decidedBy: d.decidedBy,
      effectiveDate: d.effectiveDate ? new Date(`${d.effectiveDate}T12:00:00Z`) : null,
      confidence: d.confidence,
      sourceSegmentIds: d.evidence.map((q) => q.segmentId).filter((s): s is string => typeof s === 'string'),
      evidence: d.evidence,
      status: 'PROPOSED',
      createdAt: finishedAt,
    }))
    if (decisions.length > 0) await repos.decisions.saveMany(decisions)

    // Proyecto sugerido por el modelo si la reunión no tiene uno.
    let projectId = m.projectId
    if (!projectId && analysis.projectHint) {
      const p = await repos.projects.findByAlias(analysis.projectHint.toLowerCase().trim())
      projectId = p?.id ?? null
    }
    await repos.meetings.save({
      ...m,
      detectedLanguageCode: analysis.language.detectedLanguageCode,
      mixedLanguageDetected: analysis.language.mixedLanguageDetected,
      projectId,
      updatedAt: finishedAt,
    })
    const rc = { meeting: { ...m, projectId }, run: savedRun, participants, settings, referenceDate, correlationId }
    const plan = await planReconciliation(ctx, repos, rc, analysis.actionItems)
    const reconcile = await applyReconciliation(ctx, repos, rc, plan)
    const pendingReviews = await repos.aiReview.listPending({ meetingId: m.id, limit: 1 })
    const reviewRequired = reconcile.reviewItems > 0 || pendingReviews.length > 0
    let current = (await repos.meetings.findById(m.id)) ?? m
    current = await setProcessingStatus(repos, current, MeetingProcessingStatus.ANALYZED, { aiAnalysisStatus: 'SUCCEEDED', lastErrorCode: null, lastErrorAt: null })
    current = await setProcessingStatus(repos, current, reviewRequired ? MeetingProcessingStatus.REVIEW_REQUIRED : MeetingProcessingStatus.COMPLETED)
    await audit(repos, ctx, {
      actorType: 'AI',
      action: kind === 'REPROCESS' ? 'meeting.reprocessed' : 'meeting.analyzed',
      entity: 'Meeting',
      entityId: m.id,
      after: { runId: savedRun.id, model: usage.model, promptVersion: usage.promptVersion, extractionConfidence: analysis.extractionConfidence, reconcile },
      correlationId,
    })
    metrics.increment(MetricNames.MEETINGS_PROCESSED)
    await ctx.events.publish({ type: 'MeetingAnalyzed', meetingId: m.id, processingRunId: savedRun.id, reviewRequired, occurredAt: finishedAt })
    return { processingStatus: current.processingStatus, reconcile, runId: savedRun.id }
  })
  return { meetingId: meeting.id, processingRunId: result.runId, processingStatus: result.processingStatus, reconcile: result.reconcile, skipped: false }
}
