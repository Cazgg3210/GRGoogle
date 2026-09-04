import { beforeEach, describe, expect, it } from 'vitest'
import { ActionItemStatus, DomainErrorCode } from '@smlxl/domain'
import {
  createTestContext,
  principalOf,
  seedDemoUsers,
  type SeededUsers,
  type TestContext,
} from '../../testing/index.js'
import {
  approveCompletion,
  changeActionItemStatus,
  createActionItem,
  nextRecurrenceDueDate,
  proposeCompletion,
  rejectCompletion,
  reopenActionItem,
  updateActionItem,
} from './commands.js'
import { approveAiReview, rejectAiReview } from '../review/resolve-ai-review.js'
import { getActionItemDetail } from '../../queries/action-items.js'

let ctx: TestContext
let u: SeededUsers

beforeEach(async () => {
  ctx = createTestContext()
  u = await seedDemoUsers(ctx)
})

describe('ciclo de vida de action items', () => {
  it('crear → proponer cierre → aprobar deja COMPLETED con historial y auditoría; nunca directo a COMPLETED', async () => {
    const director = principalOf(u.andres)
    const item = await createActionItem(ctx, director, {
      title: 'Enviar contrato firmado',
      ownerUserId: u.lucia.id,
      dueDate: '2026-09-10',
      priority: 'HIGH',
    })
    expect(item).toMatchObject({
      status: 'PENDING',
      externalKey: 'ACT-000001',
      ownerUserId: u.lucia.id,
    })
    expect(ctx.queue.pending('send-action-item-notification')).toHaveLength(1)
    await expect(
      changeActionItemStatus(ctx, principalOf(u.lucia), item.id, ActionItemStatus.COMPLETED),
    ).rejects.toMatchObject({ code: DomainErrorCode.ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL })
    const inProgress = await changeActionItemStatus(
      ctx,
      principalOf(u.lucia),
      item.id,
      ActionItemStatus.IN_PROGRESS,
      'arrancando',
    )
    expect(inProgress.status).toBe('IN_PROGRESS')
    const { proposal } = await proposeCompletion(
      ctx,
      principalOf(u.lucia),
      item.id,
      'Ya se envió el contrato',
    )
    expect((await ctx.repos.actionItems.findById(item.id))?.status).toBe('COMPLETION_PROPOSED')
    // MEMBER no puede aprobar.
    await expect(
      approveCompletion(ctx, principalOf(u.mariana), item.id, proposal.id),
    ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN })
    const { item: done, nextInstance } = await approveCompletion(
      ctx,
      director,
      item.id,
      proposal.id,
      { comment: 'ok' },
    )
    expect(done.status).toBe('COMPLETED')
    expect(done.completedAt).not.toBeNull()
    expect(nextInstance).toBeNull()
    expect((await ctx.repos.completionProposals.findById(proposal.id))?.status).toBe('APPROVED')
    const history = await ctx.repos.actionItems.listStatusHistory(item.id)
    expect(history.map((h) => h.toStatus)).toEqual([
      'PENDING',
      'IN_PROGRESS',
      'COMPLETION_PROPOSED',
      'COMPLETED',
    ])
    expect(ctx.state.audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'action_item.created',
        'action_item.status_changed',
        'action_item.completion_proposed',
        'action_item.completion_approved',
      ]),
    )
    expect(ctx.events.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['ActionItemCreated', 'CompletionProposed', 'CompletionApproved']),
    )
    await expect(approveCompletion(ctx, director, item.id, proposal.id)).rejects.toMatchObject({
      code: DomainErrorCode.COMPLETION_PROPOSAL_NOT_PENDING,
    })
    // Reapertura auditada → IN_PROGRESS.
    const reopened = await reopenActionItem(ctx, director, item.id, 'faltó el anexo')
    expect(reopened).toMatchObject({ status: 'IN_PROGRESS', completedAt: null })
    expect(ctx.state.audit.some((a) => a.action === 'action_item.reopened')).toBe(true)
    const detail = await getActionItemDetail(ctx, director, item.id)
    expect(detail.statusHistory).toHaveLength(5)
    expect(detail.allowedTransitions).not.toContain('COMPLETED')
    expect(detail.canApproveCompletion).toBe(false)
  })

  it('rechazar devuelve al estado previo del historial', async () => {
    const lucia = principalOf(u.lucia)
    const item = await createActionItem(ctx, lucia, {
      title: 'Revisar póliza',
      ownerUserId: u.lucia.id,
    })
    await changeActionItemStatus(ctx, lucia, item.id, ActionItemStatus.IN_PROGRESS)
    const { proposal } = await proposeCompletion(ctx, lucia, item.id, 'listo')
    const back = await rejectCompletion(ctx, principalOf(u.andres), item.id, proposal.id, {
      comment: 'falta firma',
    })
    expect(back.status).toBe('IN_PROGRESS')
    expect(await ctx.repos.completionProposals.findById(proposal.id)).toMatchObject({
      status: 'REJECTED',
      reviewComment: 'falta firma',
    })
    expect(ctx.events.events.some((e) => e.type === 'CompletionRejected')).toBe(true)
  })

  it('tareas recurrentes generan la siguiente instancia al aprobar el cierre', async () => {
    const director = principalOf(u.andres)
    const item = await createActionItem(ctx, director, {
      title: 'Seguimiento semanal al proveedor de transporte',
      ownerUserId: u.lucia.id,
      dueDate: '2026-09-05',
      type: 'RECURRING',
      recurrence: { frequency: 'WEEKLY' },
    })
    const { proposal } = await proposeCompletion(
      ctx,
      principalOf(u.lucia),
      item.id,
      'hecho esta semana',
    )
    const { item: done, nextInstance } = await approveCompletion(
      ctx,
      director,
      item.id,
      proposal.id,
    )
    expect(done.status).toBe('COMPLETED')
    expect(nextInstance).toMatchObject({
      status: 'PENDING',
      parentActionItemId: item.id,
      externalKey: 'ACT-000002',
      type: 'RECURRING',
    })
    expect(nextInstance?.dueDate?.toISOString()).toBe('2026-09-12T06:00:00.000Z')
    expect(
      nextRecurrenceDueDate(
        { frequency: 'MONTHLY' },
        new Date('2026-01-31T12:00:00Z'),
        'America/Mexico_City',
      )
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-03-03')
    expect(
      nextRecurrenceDueDate(
        { frequency: 'DAILY', interval: 2 },
        new Date('2026-09-03T12:00:00Z'),
        'UTC',
      )
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-09-05')
  })

  it('reasignar requiere ACTION_ITEM_REASSIGN y emite evento', async () => {
    const item = await createActionItem(ctx, principalOf(u.mariana), {
      title: 'Preparar inventario',
    })
    expect(item.ownerUserId).toBe(u.mariana.id)
    await expect(
      updateActionItem(ctx, principalOf(u.mariana), item.id, { ownerUserId: u.lucia.id }),
    ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN })
    const mine = await updateActionItem(ctx, principalOf(u.mariana), item.id, {
      ownerUserId: u.mariana.id,
      dueDate: '2026-09-09',
    })
    expect(mine.ownerUserId).toBe(u.mariana.id)
    const reassigned = await updateActionItem(
      ctx,
      principalOf(u.lucia, { teamUserIds: [u.mariana.id] }),
      item.id,
      { ownerUserId: u.lucia.id },
    )
    expect(reassigned.ownerUserId).toBe(u.lucia.id)
    expect(ctx.events.events.filter((e) => e.type === 'ActionItemReassigned')).toHaveLength(1)
  })

  it('revisión IA: aprobar propuesta PROPOSED → PENDING; rechazar → CANCELLED', async () => {
    const now = ctx.clock.now()
    const meetingId = ctx.ids.next()
    const mk = async (status: ActionItemStatus) => {
      const id = ctx.ids.next()
      await ctx.repos.actionItems.save({
        id,
        externalKey: `ACT-${id.slice(-6)}`,
        title: 'Tarea IA',
        description: null,
        type: 'ONE_OFF',
        ownerUserId: null,
        externalAssigneeId: null,
        ownerTextOriginal: 'Carlos',
        collaboratorUserIds: [],
        areaId: null,
        projectId: null,
        createdFromMeetingId: meetingId,
        latestMeetingId: meetingId,
        status,
        priority: 'MEDIUM',
        dueDate: null,
        dueDateTextOriginal: null,
        dateConfidence: null,
        startDate: null,
        completedAt: null,
        cancelledAt: null,
        confidence: 0.75,
        requiresReview: true,
        sourceEvidence: [],
        recurrence: null,
        parentActionItemId: null,
        blocker: null,
        tags: [],
        migrationTrust: 'PLATFORM',
        legacyId: null,
        lastMentionedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      const review = await ctx.repos.aiReview.save({
        id: ctx.ids.next(),
        meetingId,
        processingRunId: 'run',
        reasons: ['LOW_CONFIDENCE'],
        reconcileDecision: 'CREATE_NEW',
        candidateActionItemId: null,
        candidateScore: null,
        proposedActionItemId: id,
        extracted: {
          title: 'Tarea IA',
          owner: null,
          dueDate: null,
          priority: null,
          statusHint: 'NEW',
          evidence: [{ text: 'x' }],
          confidence: 0.75,
        },
        suggestedOwnerUserId: null,
        suggestedOwnerConfidence: null,
        suggestedDueDate: null,
        suggestedDueDateConfidence: null,
        status: 'PENDING',
        resolvedByUserId: null,
        resolvedAt: null,
        resolutionNote: null,
        createdAt: now,
      })
      return { id, review }
    }
    const a = await mk(ActionItemStatus.PROPOSED)
    const approved = await approveAiReview(ctx, principalOf(u.andres), a.review.id, {
      ownerUserId: u.lucia.id,
      dueDate: '2026-09-12',
    })
    expect(approved.actionItem).toMatchObject({
      status: 'PENDING',
      ownerUserId: u.lucia.id,
      requiresReview: false,
    })
    expect(approved.review.status).toBe('APPROVED')
    const b = await mk(ActionItemStatus.PROPOSED)
    await expect(rejectAiReview(ctx, principalOf(u.mariana), b.review.id)).rejects.toMatchObject({
      code: DomainErrorCode.FORBIDDEN,
    })
    const rejected = await rejectAiReview(ctx, principalOf(u.lucia), b.review.id, {
      note: 'no aplica',
    })
    expect(rejected.status).toBe('REJECTED')
    expect((await ctx.repos.actionItems.findById(b.id))?.status).toBe('CANCELLED')
  })
})
