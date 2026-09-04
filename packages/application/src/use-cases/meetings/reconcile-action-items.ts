import {
  ActionItemStatus,
  ActionItemType,
  AiReviewReason,
  CompletionProposalStatus,
  ConfidenceBand,
  DomainErrorCode,
  OPEN_ACTION_ITEM_STATUSES,
  ProposedByType,
  ReconcileDecision,
  RelationType,
  assertTransition,
  canProposeCompletion,
  confidenceBand,
  detectRecurrenceHint,
  formatExternalKey,
  isDomainError,
  isInternalEmail,
  normalizeText,
  parseLocalDate,
  tokenJaccard,
  trigramSimilarity,
  type ActionItem,
  type AiReviewItem,
  type EvidenceQuote,
  type ExtractedActionItem,
  type ExternalAssignee,
  type Id,
  type Meeting,
  type MeetingParticipant,
  type PlatformSettings,
  type ProcessingRun,
  type Project,
  type ReconcileCandidate,
  type Repositories,
  type User,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { audit, resolveUserByNameOrEmail } from '../../shared.js'

/**
 * Reconciliación de action items extraídos contra el backlog (§10.2 pasos 6–7).
 *
 * Dos fases:
 *  1. `planReconciliation` (lectura + juez LLM): resuelve responsable/proyecto/fecha,
 *     busca candidatos, puntúa y decide.
 *  2. `applyReconciliation` (transacción): crea/vincula/propone y genera la
 *     bandeja de revisión. La IA NUNCA escribe COMPLETED ni cambia estados
 *     salvo proponer cierre (máquina de estados con actor AI).
 */
export interface ReconcileSummary {
  created: number
  linked: number
  updated: number
  proposals: number
  reviewItems: number
}

export interface OwnerResolution {
  userId: Id | null
  externalAssigneeId: Id | null
  /** Nombre externo a crear si no existe (se materializa en apply). */
  externalAssigneeName: string | null
  externalAssigneeEmail: string | null
  areaId: Id | null
  ownerTextOriginal: string | null
  confidence: number
}

export interface ScoredCandidate {
  item: ActionItem
  score: number
  sameOwner: boolean
  sameProject: boolean
  keyReferenced: boolean
}

export interface ReconcilePlanItem {
  extracted: ExtractedActionItem
  owner: OwnerResolution
  projectId: Id | null
  dueDate: Date | null
  dateConfidence: number | null
  band: ConfidenceBand
  decision: ReconcileDecision
  candidate: ScoredCandidate | null
  judgeRationale: string | null
  judgeConfidence: number | null
  extraReasons: AiReviewReason[]
}

export interface ReconcileContext {
  meeting: Meeting
  run: ProcessingRun
  participants: MeetingParticipant[]
  settings: PlatformSettings
  referenceDate: string
  correlationId?: string | null
}

export const CANDIDATE_SCORE_WEIGHTS = {
  title: 0.5,
  trigram: 0.2,
  owner: 0.15,
  project: 0.15,
  keyRef: 0.1,
} as const
export const LINK_THRESHOLD = 0.85
export const JUDGE_THRESHOLD = 0.6

export function scoreCandidate(
  extracted: { title: string; relatedOpenActionKey?: string | null },
  item: ActionItem,
  owner: { userId: Id | null; externalAssigneeId: Id | null },
  projectId: Id | null,
): ScoredCandidate {
  const sameOwner =
    (owner.userId !== null && item.ownerUserId === owner.userId) ||
    (owner.externalAssigneeId !== null && item.externalAssigneeId === owner.externalAssigneeId)
  const sameProject = projectId !== null && item.projectId === projectId
  const keyReferenced =
    extracted.relatedOpenActionKey !== null &&
    extracted.relatedOpenActionKey !== undefined &&
    extracted.relatedOpenActionKey === item.externalKey
  const score =
    CANDIDATE_SCORE_WEIGHTS.title * tokenJaccard(extracted.title, item.title) +
    CANDIDATE_SCORE_WEIGHTS.trigram * trigramSimilarity(extracted.title, item.title) +
    (sameOwner ? CANDIDATE_SCORE_WEIGHTS.owner : 0) +
    (sameProject ? CANDIDATE_SCORE_WEIGHTS.project : 0) +
    (keyReferenced ? CANDIDATE_SCORE_WEIGHTS.keyRef : 0)
  return {
    item,
    score: Math.min(1, Math.round(score * 1000) / 1000),
    sameOwner,
    sameProject,
    keyReferenced,
  }
}

async function resolveOwner(
  repos: Repositories,
  extracted: ExtractedActionItem,
  participants: MeetingParticipant[],
  settings: PlatformSettings,
  cache: {
    users: User[]
    aliases: Array<{ userId: Id; aliasNormalized: string }>
    areas: Array<{ id: Id; name: string }>
    externals: ExternalAssignee[]
  },
): Promise<OwnerResolution> {
  const none: OwnerResolution = {
    userId: null,
    externalAssigneeId: null,
    externalAssigneeName: null,
    externalAssigneeEmail: null,
    areaId: null,
    ownerTextOriginal: null,
    confidence: 0,
  }
  if (!extracted.owner) return none
  const name = extracted.owner.name ?? null
  const email = extracted.owner.email?.toLowerCase() ?? null
  const internal = await resolveUserByNameOrEmail(repos, { email, name }, cache)
  if (internal.user)
    return {
      ...none,
      userId: internal.user.id,
      areaId: internal.user.areaId,
      ownerTextOriginal: name ?? email,
      confidence: internal.confidence,
    }
  // Participante de la reunión con ese nombre (interno sin usuario o externo).
  const n = normalizeText(name)
  const participant = participants.find(
    (p) =>
      normalizeText(p.displayName) === n ||
      (email && p.email === email) ||
      (n && trigramSimilarity(normalizeText(p.displayName), n) >= 0.85),
  )
  if (participant?.internalUserId) {
    const u = cache.users.find((x) => x.id === participant.internalUserId)
    if (u)
      return {
        ...none,
        userId: u.id,
        areaId: u.areaId,
        ownerTextOriginal: name ?? email,
        confidence: 0.9,
      }
  }
  const isExternal =
    (participant && !participant.isInternal) ||
    (email !== null && !isInternalEmail(email, settings.companyDomain))
  if (isExternal) {
    const displayName = participant?.displayName ?? name ?? email ?? 'Externo'
    const existing = cache.externals.find(
      (e) =>
        normalizeText(e.displayName) === normalizeText(displayName) || (email && e.email === email),
    )
    return {
      ...none,
      externalAssigneeId: existing?.id ?? null,
      externalAssigneeName: existing ? null : displayName,
      externalAssigneeEmail: participant?.email ?? email,
      ownerTextOriginal: name ?? email,
      confidence: participant ? 0.9 : 0.75,
    }
  }
  // Área como responsable (p. ej. "Jurídico").
  const area = cache.areas.find(
    (a) => normalizeText(a.name) === n || (n.length > 3 && normalizeText(a.name).includes(n)),
  )
  if (area) return { ...none, areaId: area.id, ownerTextOriginal: name, confidence: 0.5 }
  return {
    ...none,
    ownerTextOriginal: name ?? email,
    confidence: Math.min(0.4, internal.confidence),
  }
}

async function resolveProject(
  repos: Repositories,
  hint: string | null | undefined,
  meeting: Meeting,
  cache: { projects: Project[] },
): Promise<Id | null> {
  const n = normalizeText(hint)
  if (n) {
    const byAlias = await repos.projects.findByAlias(n)
    if (byAlias) return byAlias.id
    const byName = cache.projects.find(
      (p) =>
        normalizeText(p.canonicalName) === n ||
        trigramSimilarity(normalizeText(p.canonicalName), n) >= 0.85,
    )
    if (byName) return byName.id
  }
  return meeting.projectId
}

function isOpen(item: ActionItem): boolean {
  return OPEN_ACTION_ITEM_STATUSES.includes(item.status)
}

export async function planReconciliation(
  ctx: AppContext,
  repos: Repositories,
  rc: ReconcileContext,
  items: ExtractedActionItem[],
): Promise<ReconcilePlanItem[]> {
  const thresholds = rc.settings.confidenceThresholds
  const cache = {
    users: await repos.users.list(),
    aliases: await repos.users.listAliases(),
    areas: await repos.areas.list(),
    externals: await repos.externalAssignees.list(),
    projects: await repos.projects.list(),
  }
  const plan: ReconcilePlanItem[] = []
  for (const extracted of items) {
    const owner = await resolveOwner(repos, extracted, rc.participants, rc.settings, cache)
    const projectId = await resolveProject(repos, extracted.projectHint, rc.meeting, cache)
    const dueDate = extracted.dueDate
      ? parseLocalDate(extracted.dueDate, rc.settings.companyTimezone)
      : null
    const dateConfidence = dueDate ? extracted.confidence : null
    const band = confidenceBand(extracted.confidence, thresholds)

    // Candidatos: full-text ∪ clave referenciada ∪ abiertos del mismo responsable.
    const byId = new Map<Id, ActionItem>()
    for (const c of await repos.actionItems.searchFullText(extracted.title, {
      openOnly: true,
      limit: 20,
    }))
      byId.set(c.id, c)
    if (extracted.relatedOpenActionKey) {
      const ref = await repos.actionItems.findByExternalKey(extracted.relatedOpenActionKey)
      if (ref) byId.set(ref.id, ref)
    }
    if (owner.userId)
      for (const c of await repos.actionItems.listAll({
        ownerUserId: owner.userId,
        status: [...OPEN_ACTION_ITEM_STATUSES],
      }))
        byId.set(c.id, c)
    if (owner.externalAssigneeId)
      for (const c of await repos.actionItems.listAll({
        externalAssigneeId: owner.externalAssigneeId,
        status: [...OPEN_ACTION_ITEM_STATUSES],
      }))
        byId.set(c.id, c)
    const scored = [...byId.values()]
      .map((item) => scoreCandidate(extracted, item, owner, projectId))
      .sort((a, b) => b.score - a.score)
    const best = scored[0] ?? null

    let decision: ReconcileDecision = ReconcileDecision.CREATE_NEW
    let candidate: ScoredCandidate | null = null
    let judgeRationale: string | null = null
    let judgeConfidence: number | null = null
    if (best && best.score >= JUDGE_THRESHOLD) {
      candidate = best
      if (!isOpen(best.item)) {
        decision =
          extracted.statusHint === 'DONE'
            ? ReconcileDecision.LINK_EXISTING
            : ReconcileDecision.REOPEN_CANDIDATE
      } else if (extracted.statusHint === 'DONE') {
        decision = ReconcileDecision.MARK_DONE_CANDIDATE
      } else if (best.score >= LINK_THRESHOLD) {
        decision =
          extracted.statusHint === 'UPDATE' ||
          extracted.statusHint === 'BLOCKED' ||
          (dueDate !== null && best.item.dueDate?.getTime() !== dueDate.getTime())
            ? ReconcileDecision.UPDATE_EXISTING
            : ReconcileDecision.LINK_EXISTING
      } else {
        // Zona gris: juez LLM con contexto limitado (≤5 candidatos).
        const candidates: ReconcileCandidate[] = scored.slice(0, 5).map((c) => ({
          actionItemId: c.item.id,
          externalKey: c.item.externalKey,
          title: c.item.title,
          description: c.item.description,
          ownerName: c.item.ownerUserId
            ? (cache.users.find((u) => u.id === c.item.ownerUserId)?.displayName ?? null)
            : c.item.ownerTextOriginal,
          status: c.item.status,
          dueDate: c.item.dueDate ? c.item.dueDate.toISOString().slice(0, 10) : null,
          projectName: c.item.projectId
            ? (cache.projects.find((p) => p.id === c.item.projectId)?.canonicalName ?? null)
            : null,
          preScore: c.score,
        }))
        try {
          const judge = await ctx.ai.reconcileActionItems({
            extracted,
            candidates,
            meetingTitle: rc.meeting.title,
            referenceDate: rc.referenceDate,
          })
          judgeRationale = judge.result.rationale
          judgeConfidence = judge.result.confidence
          const matched = judge.result.matchedActionItemId
            ? (scored.find((c) => c.item.id === judge.result.matchedActionItemId) ?? null)
            : null
          if (
            judge.result.confidence >= thresholds.autoAccept &&
            judge.result.decision !== ReconcileDecision.REQUIRES_HUMAN_REVIEW
          ) {
            decision = judge.result.decision
            candidate = decision === ReconcileDecision.CREATE_NEW ? null : (matched ?? best)
          } else {
            decision = ReconcileDecision.REQUIRES_HUMAN_REVIEW
            candidate = matched ?? best
          }
        } catch (err) {
          ctx.logger.warn(
            {
              meetingId: rc.meeting.id,
              errorCode: isDomainError(err) ? err.code : DomainErrorCode.AI_PROVIDER_ERROR,
            },
            'Juez LLM falló; se envía a revisión humana',
          )
          decision = ReconcileDecision.REQUIRES_HUMAN_REVIEW
        }
      }
    }
    const extraReasons: AiReviewReason[] = []
    if (
      extracted.owner &&
      owner.userId === null &&
      owner.externalAssigneeId === null &&
      owner.externalAssigneeName === null
    )
      extraReasons.push(AiReviewReason.AMBIGUOUS_OWNER)
    else if (extracted.owner && owner.confidence < 0.7)
      extraReasons.push(AiReviewReason.AMBIGUOUS_OWNER)
    if (extracted.dueDateTextOriginal && !dueDate && extracted.statusHint !== 'DONE')
      extraReasons.push(AiReviewReason.AMBIGUOUS_DUE_DATE)
    plan.push({
      extracted,
      owner,
      projectId,
      dueDate,
      dateConfidence,
      band,
      decision,
      candidate,
      judgeRationale,
      judgeConfidence,
      extraReasons,
    })
  }
  return plan
}

// ---------------------------------------------------------------------------
// Fase 2: aplicar
// ---------------------------------------------------------------------------

function evidenceOf(e: ExtractedActionItem): EvidenceQuote[] {
  return e.evidence.map((q) => ({
    text: q.text,
    ...(q.speaker ? { speaker: q.speaker } : {}),
    ...(q.startTime ? { startTime: q.startTime } : {}),
    ...(q.endTime ? { endTime: q.endTime } : {}),
    ...(q.segmentId ? { segmentId: q.segmentId } : {}),
  }))
}

async function materializeExternal(
  repos: Repositories,
  ctx: AppContext,
  owner: OwnerResolution,
): Promise<Id | null> {
  if (owner.externalAssigneeId) return owner.externalAssigneeId
  if (!owner.externalAssigneeName) return null
  const existing = await repos.externalAssignees.findByNormalizedName(
    normalizeText(owner.externalAssigneeName),
  )
  if (existing) return existing.id
  const created = await repos.externalAssignees.save({
    id: ctx.ids.next(),
    displayName: owner.externalAssigneeName,
    company: null,
    email: owner.externalAssigneeEmail,
    phone: null,
    source: 'AI',
    active: true,
  })
  return created.id
}

async function createReviewItem(
  repos: Repositories,
  ctx: AppContext,
  rc: ReconcileContext,
  p: ReconcilePlanItem,
  reasons: AiReviewReason[],
  proposedActionItemId: Id | null,
): Promise<AiReviewItem> {
  const item: AiReviewItem = {
    id: ctx.ids.next(),
    meetingId: rc.meeting.id,
    processingRunId: rc.run.id,
    reasons: [...new Set(reasons)],
    reconcileDecision: p.decision,
    candidateActionItemId: p.candidate?.item.id ?? null,
    candidateScore: p.candidate?.score ?? null,
    proposedActionItemId,
    extracted: {
      ...p.extracted,
      judgeRationale: p.judgeRationale,
      judgeConfidence: p.judgeConfidence,
    },
    suggestedOwnerUserId: p.owner.userId,
    suggestedOwnerConfidence: p.extracted.owner ? p.owner.confidence : null,
    suggestedDueDate: p.dueDate,
    suggestedDueDateConfidence: p.dateConfidence,
    status: 'PENDING',
    resolvedByUserId: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: ctx.clock.now(),
  }
  await repos.aiReview.save(item)
  metrics.increment(MetricNames.AI_REVIEW_ITEMS, 1, { reason: item.reasons[0] ?? 'UNKNOWN' })
  await ctx.events.publish({
    type: 'AiReviewItemCreated',
    reviewItemId: item.id,
    meetingId: rc.meeting.id,
    occurredAt: item.createdAt,
  })
  return item
}

async function link(
  repos: Repositories,
  ctx: AppContext,
  rc: ReconcileContext,
  item: ActionItem,
  relation: RelationType,
  p: ReconcilePlanItem,
  detectedStatus: ActionItem['status'] | null,
): Promise<void> {
  const now = ctx.clock.now()
  await repos.actionItems.addLink({
    id: ctx.ids.next(),
    actionItemId: item.id,
    meetingId: rc.meeting.id,
    relationType: relation,
    evidence: evidenceOf(p.extracted),
    previousStatus: item.status,
    detectedStatus,
    detectedDueDate: p.dueDate,
    createdAt: now,
  })
  await ctx.events.publish({
    type: 'ActionItemLinkedToMeeting',
    actionItemId: item.id,
    meetingId: rc.meeting.id,
    relation,
    occurredAt: now,
  })
}

export async function applyReconciliation(
  ctx: AppContext,
  repos: Repositories,
  rc: ReconcileContext,
  plan: ReconcilePlanItem[],
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    created: 0,
    linked: 0,
    updated: 0,
    proposals: 0,
    reviewItems: 0,
  }
  const thresholds = rc.settings.confidenceThresholds
  const now = ctx.clock.now()
  const flags = rc.settings.featureFlags

  for (const p of plan) {
    const e = p.extracted
    switch (p.decision) {
      case ReconcileDecision.CREATE_NEW: {
        if (p.band === ConfidenceBand.REVIEW) {
          await createReviewItem(
            repos,
            ctx,
            rc,
            p,
            [AiReviewReason.LOW_CONFIDENCE, ...p.extraReasons],
            null,
          )
          summary.reviewItems += 1
          break
        }
        const proposed = p.band === ConfidenceBand.PROPOSAL
        const externalAssigneeId = await materializeExternal(repos, ctx, p.owner)
        const seq = await repos.actionItems.nextSequence()
        const recurrence = e.recurringHint
          ? (detectRecurrenceHint(
              `${e.title} ${e.description ?? ''} ${e.evidence.map((q) => q.text).join(' ')}`,
            ) ?? { frequency: 'WEEKLY' as const })
          : null
        const item: ActionItem = {
          id: ctx.ids.next(),
          externalKey: formatExternalKey(seq),
          title: e.title,
          description: e.description ?? null,
          type: recurrence ? ActionItemType.RECURRING : ActionItemType.ONE_OFF,
          ownerUserId: p.owner.userId,
          externalAssigneeId,
          ownerTextOriginal: p.owner.ownerTextOriginal,
          collaboratorUserIds: [],
          areaId: p.owner.areaId ?? rc.meeting.areaId,
          projectId: p.projectId,
          createdFromMeetingId: rc.meeting.id,
          latestMeetingId: rc.meeting.id,
          status: proposed ? ActionItemStatus.PROPOSED : ActionItemStatus.PENDING,
          priority: e.priority ?? 'MEDIUM',
          dueDate: p.dueDate,
          dueDateTextOriginal: e.dueDateTextOriginal ?? null,
          dateConfidence: p.dateConfidence,
          startDate: null,
          completedAt: null,
          cancelledAt: null,
          confidence: e.confidence,
          requiresReview: proposed || p.extraReasons.length > 0,
          sourceEvidence: evidenceOf(e),
          recurrence,
          parentActionItemId: null,
          blocker:
            e.statusHint === 'BLOCKED' ? (e.description ?? e.evidence[0]?.text ?? null) : null,
          tags: [],
          migrationTrust: 'PLATFORM',
          legacyId: null,
          lastMentionedAt: now,
          createdAt: now,
          updatedAt: now,
        }
        await repos.actionItems.save(item)
        await repos.actionItems.addStatusHistory({
          id: ctx.ids.next(),
          actionItemId: item.id,
          fromStatus: null,
          toStatus: item.status,
          changedByUserId: null,
          changedBySystem: true,
          reason: 'Creada por IA desde reunión',
          meetingId: rc.meeting.id,
          changedAt: now,
        })
        await repos.actionItems.addLink({
          id: ctx.ids.next(),
          actionItemId: item.id,
          meetingId: rc.meeting.id,
          relationType: RelationType.CREATED,
          evidence: item.sourceEvidence,
          previousStatus: null,
          detectedStatus: item.status,
          detectedDueDate: p.dueDate,
          createdAt: now,
        })
        await audit(repos, ctx, {
          actorType: 'AI',
          action: 'action_item.created',
          entity: 'ActionItem',
          entityId: item.id,
          after: {
            externalKey: item.externalKey,
            status: item.status,
            confidence: item.confidence,
            decision: p.decision,
          },
          correlationId: rc.correlationId,
        })
        await ctx.events.publish({
          type: 'ActionItemCreated',
          actionItemId: item.id,
          meetingId: rc.meeting.id,
          ownerUserId: item.ownerUserId,
          proposed,
          occurredAt: now,
        })
        metrics.increment(MetricNames.ACTION_ITEMS_CREATED, 1, { status: item.status })
        summary.created += 1
        const reasons: AiReviewReason[] = [
          ...(proposed ? [AiReviewReason.LOW_CONFIDENCE] : []),
          ...p.extraReasons,
        ]
        if (reasons.length > 0) {
          await createReviewItem(repos, ctx, rc, p, reasons, item.id)
          summary.reviewItems += 1
        }
        break
      }
      case ReconcileDecision.LINK_EXISTING: {
        const target = p.candidate?.item
        if (!target) break
        await link(repos, ctx, rc, target, RelationType.MENTIONED, p, null)
        await repos.actionItems.save({
          ...target,
          latestMeetingId: rc.meeting.id,
          lastMentionedAt: now,
          updatedAt: now,
        })
        await audit(repos, ctx, {
          actorType: 'AI',
          action: 'action_item.linked',
          entity: 'ActionItem',
          entityId: target.id,
          after: { meetingId: rc.meeting.id, score: p.candidate?.score },
          correlationId: rc.correlationId,
        })
        metrics.increment(MetricNames.ACTION_ITEMS_MERGED, 1, { decision: p.decision })
        summary.linked += 1
        break
      }
      case ReconcileDecision.UPDATE_EXISTING: {
        const target = p.candidate?.item
        if (!target) break
        const blocked = e.statusHint === 'BLOCKED'
        await link(
          repos,
          ctx,
          rc,
          target,
          blocked ? RelationType.BLOCKED : RelationType.UPDATED,
          p,
          blocked ? ActionItemStatus.BLOCKED : null,
        )
        const before = { dueDate: target.dueDate, blocker: target.blocker }
        let next: ActionItem = {
          ...target,
          latestMeetingId: rc.meeting.id,
          lastMentionedAt: now,
          updatedAt: now,
        }
        let conflict = false
        if (
          p.dueDate &&
          (target.dueDate === null || target.dueDate.getTime() !== p.dueDate.getTime())
        ) {
          if (e.confidence >= thresholds.autoAccept) {
            next = {
              ...next,
              dueDate: p.dueDate,
              dueDateTextOriginal: e.dueDateTextOriginal ?? null,
              dateConfidence: p.dateConfidence,
            }
          } else conflict = true
        }
        if (blocked) {
          next = { ...next, blocker: e.description ?? e.evidence[0]?.text ?? target.blocker }
          // La IA no cambia estados: el bloqueo detectado se propone a revisión humana.
          conflict = true
        }
        await repos.actionItems.save(next)
        await audit(repos, ctx, {
          actorType: 'AI',
          action: 'action_item.updated_from_meeting',
          entity: 'ActionItem',
          entityId: target.id,
          before,
          after: { dueDate: next.dueDate, blocker: next.blocker, meetingId: rc.meeting.id },
          correlationId: rc.correlationId,
        })
        metrics.increment(MetricNames.ACTION_ITEMS_MERGED, 1, { decision: p.decision })
        summary.updated += 1
        if (conflict || p.extraReasons.length > 0) {
          await createReviewItem(
            repos,
            ctx,
            rc,
            p,
            [AiReviewReason.CONFLICT_WITH_EXISTING, ...p.extraReasons],
            null,
          )
          summary.reviewItems += 1
        }
        break
      }
      case ReconcileDecision.MARK_DONE_CANDIDATE: {
        const target = p.candidate?.item
        if (!target) break
        const canPropose =
          flags.AI_COMPLETION_PROPOSALS_ENABLED &&
          canProposeCompletion(target.status) &&
          !(await repos.completionProposals.findPendingByActionItem(target.id))
        if (canPropose) {
          assertTransition(target.status, ActionItemStatus.COMPLETION_PROPOSED, {
            actor: { kind: 'AI' },
          })
          const proposal = await repos.completionProposals.save({
            id: ctx.ids.next(),
            actionItemId: target.id,
            proposedByType: ProposedByType.AI,
            proposedByUserId: null,
            proposedFromMeetingId: rc.meeting.id,
            reason:
              p.judgeRationale ??
              `En la reunión "${rc.meeting.title}" se indicó que la tarea ya fue completada.`,
            evidenceSegmentIds: e.evidence
              .map((q) => q.segmentId)
              .filter((s): s is string => typeof s === 'string'),
            evidence: evidenceOf(e),
            confidence: e.confidence,
            status: CompletionProposalStatus.PENDING,
            reviewedByUserId: null,
            reviewedAt: null,
            reviewComment: null,
            createdAt: now,
          })
          await repos.actionItems.save({
            ...target,
            status: ActionItemStatus.COMPLETION_PROPOSED,
            latestMeetingId: rc.meeting.id,
            lastMentionedAt: now,
            updatedAt: now,
          })
          await repos.actionItems.addStatusHistory({
            id: ctx.ids.next(),
            actionItemId: target.id,
            fromStatus: target.status,
            toStatus: ActionItemStatus.COMPLETION_PROPOSED,
            changedByUserId: null,
            changedBySystem: true,
            reason: 'Cierre propuesto por IA',
            meetingId: rc.meeting.id,
            changedAt: now,
          })
          await link(
            repos,
            ctx,
            rc,
            target,
            RelationType.COMPLETED,
            p,
            ActionItemStatus.COMPLETION_PROPOSED,
          )
          await audit(repos, ctx, {
            actorType: 'AI',
            action: 'action_item.completion_proposed',
            entity: 'ActionItem',
            entityId: target.id,
            before: { status: target.status },
            after: {
              status: ActionItemStatus.COMPLETION_PROPOSED,
              proposalId: proposal.id,
              confidence: e.confidence,
            },
            correlationId: rc.correlationId,
          })
          await ctx.events.publish({
            type: 'ActionItemStatusChanged',
            actionItemId: target.id,
            from: target.status,
            to: ActionItemStatus.COMPLETION_PROPOSED,
            byUserId: null,
            occurredAt: now,
          })
          await ctx.events.publish({
            type: 'CompletionProposed',
            actionItemId: target.id,
            proposalId: proposal.id,
            byType: 'AI',
            occurredAt: now,
          })
          summary.proposals += 1
          if (e.confidence < thresholds.autoAccept) {
            await createReviewItem(repos, ctx, rc, p, [AiReviewReason.POSSIBLE_COMPLETION], null)
            summary.reviewItems += 1
          }
        } else {
          await link(repos, ctx, rc, target, RelationType.MENTIONED, p, ActionItemStatus.COMPLETED)
          await repos.actionItems.save({
            ...target,
            latestMeetingId: rc.meeting.id,
            lastMentionedAt: now,
            updatedAt: now,
          })
          await createReviewItem(repos, ctx, rc, p, [AiReviewReason.POSSIBLE_COMPLETION], null)
          summary.reviewItems += 1
          summary.linked += 1
        }
        break
      }
      case ReconcileDecision.REOPEN_CANDIDATE: {
        const target = p.candidate?.item
        if (!target) break
        // Nunca reabrir automáticamente.
        await link(repos, ctx, rc, target, RelationType.MENTIONED, p, ActionItemStatus.PENDING)
        await repos.actionItems.save({
          ...target,
          latestMeetingId: rc.meeting.id,
          lastMentionedAt: now,
          updatedAt: now,
        })
        await createReviewItem(repos, ctx, rc, p, [AiReviewReason.CONFLICT_WITH_EXISTING], null)
        summary.reviewItems += 1
        summary.linked += 1
        break
      }
      case ReconcileDecision.REQUIRES_HUMAN_REVIEW: {
        await createReviewItem(
          repos,
          ctx,
          rc,
          p,
          [AiReviewReason.POSSIBLE_DUPLICATE, ...p.extraReasons],
          null,
        )
        summary.reviewItems += 1
        break
      }
    }
  }
  return summary
}

/** Conveniencia: planifica y aplica en el mismo `repos` (para tests y SimulateMeetingEnded). */
export async function reconcileActionItems(
  ctx: AppContext,
  repos: Repositories,
  rc: ReconcileContext,
  items: ExtractedActionItem[],
): Promise<ReconcileSummary> {
  const plan = await planReconciliation(ctx, repos, rc, items)
  return applyReconciliation(ctx, repos, rc, plan)
}
