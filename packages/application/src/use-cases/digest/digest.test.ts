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
  createActionItem,
  proposeCompletion,
  approveCompletion,
  updateActionItem,
} from '../action-items/commands.js'
import { simulateMeetingEnded } from '../meetings/simulate-meeting-ended.js'
import { generateWeeklyDigest } from './generate-weekly-digest.js'
import { renderDigestEmail } from './render-digest-email.js'
import {
  digestCronOf,
  getDigest,
  scheduleWeeklyDigest,
  sendWeeklyDigest,
  updateDigestConfig,
} from './send-weekly-digest.js'
import type { WeeklyDigestPayload } from './payload.js'

let ctx: TestContext
let u: SeededUsers

beforeEach(async () => {
  ctx = createTestContext({ now: '2026-09-03T18:00:00Z' })
  u = await seedDemoUsers(ctx)
})

describe('resumen semanal', () => {
  it('calcula las secciones A–G, versiona, renderiza y envía con idempotencia', async () => {
    const director = principalOf(u.andres)
    // Backlog previo (creado la semana pasada), vencido y sin responsable.
    ctx.clock.set('2026-08-25T15:00:00Z')
    const old = await createActionItem(ctx, director, {
      title: 'Actualizar manual de procesos',
      dueDate: '2026-08-31',
      priority: 'HIGH',
    })
    const recurring = await createActionItem(ctx, director, {
      title: 'Seguimiento diario a proveedor',
      ownerUserId: u.lucia.id,
      type: 'RECURRING',
      recurrence: { frequency: 'DAILY' },
    })
    ctx.clock.set('2026-09-03T18:00:00Z')
    // Semana actual: reunión demo (3 items nuevos), un cierre aprobado, un cambio de fecha.
    await simulateMeetingEnded(ctx, principalOf(u.admin), {})
    const done = await createActionItem(ctx, director, {
      title: 'Enviar factura de agosto',
      ownerUserId: u.mariana.id,
      dueDate: '2026-09-04',
    })
    const { proposal } = await proposeCompletion(ctx, principalOf(u.mariana), done.id, 'enviada')
    await approveCompletion(ctx, director, done.id, proposal.id)
    await updateActionItem(ctx, director, old.id, { dueDate: '2026-09-10' })
    const blocked = await createActionItem(ctx, director, {
      title: 'Liberar rutas',
      ownerUserId: u.lucia.id,
      dueDate: '2026-09-09',
    })
    await updateActionItem(ctx, principalOf(u.lucia), blocked.id, {
      status: ActionItemStatus.BLOCKED,
      blocker: 'esperando póliza',
    })

    const digest = await generateWeeklyDigest(ctx, director, {})
    const p = digest.payload as WeeklyDigestPayload
    expect(digest.version).toBe(1)
    expect(p.weekLabel).toBe('2026-W36')
    expect(p.summary).toMatchObject({
      meetingsDetected: 4,
      meetingsProcessed: 1,
      meetingsWithoutArtifacts: 1,
      meetingsWithError: 0,
      newActionItems: 5,
      pendingProposals: 0,
      approvedCompletions: 1,
      blocked: 1,
    })
    expect(p.summary.overdue).toBe(0)
    expect(p.newCommitments.items.map((i) => i.key)).toHaveLength(5)
    expect(p.newCommitments.byOwner.length).toBeGreaterThan(1)
    expect(p.newCommitments.byPriority.some((g) => g.label === 'HIGH')).toBe(true)
    expect(p.backlog.map((b) => b.key)).toEqual(
      expect.arrayContaining([old.externalKey, recurring.externalKey]),
    )
    expect(p.backlog[0]?.daysOpen).toBe(9)
    expect(p.risks.noDueDate.some((i) => i.key === recurring.externalKey)).toBe(true)
    expect(p.risks.noOwner.length).toBeGreaterThanOrEqual(1)
    expect(p.risks.blocked.map((i) => i.key)).toEqual([blocked.externalKey])
    expect(p.changes.map((c) => c.type)).toEqual(
      expect.arrayContaining(['POSSIBLE_COMPLETION', 'DUE_DATE']),
    )
    expect(p.approvalInbox).toEqual([])
    expect(p.nextWeek.dueSoon.map((i) => i.key)).toEqual(
      expect.arrayContaining([old.externalKey, blocked.externalKey]),
    )
    expect(p.nextWeek.recurring.map((i) => i.key)).toEqual([recurring.externalKey])
    expect(p.nextWeek.highPriority.map((i) => i.key)).toContain(old.externalKey)
    expect(p.narrative?.executiveNarrative[0]).toContain('4 reuniones')
    expect(p.risks.captureIssues.map((c) => c.issue)).toEqual([
      'Auto-captura bloqueada por política',
    ])
    for (const i of p.newCommitments.items)
      expect(i.url).toBe(`${ctx.env.APP_URL}/pendientes/${i.id}`)

    const email = renderDigestEmail(p)
    expect(email.subject).toContain('2026-W36')
    for (const section of [
      'A. Resumen ejecutivo',
      'B. Nuevos compromisos',
      'C. Backlog acumulado',
      'D. Riesgos',
      'E. Cambios detectados',
      'F. Bandeja de aprobación',
      'G. Próxima semana',
    ])
      expect(email.html).toContain(section)
    expect(email.text).toContain('G. PRÓXIMA SEMANA')
    expect(email.html).toContain(`${ctx.env.APP_URL}/pendientes/${old.id}`)

    const sent = await sendWeeklyDigest(ctx, director, digest.id)
    expect(sent.sentAt).not.toBeNull()
    expect(sent.recipientEmails.sort()).toEqual([u.admin.email, u.andres.email].sort())
    expect(ctx.google.mail.sent).toHaveLength(1)
    expect(ctx.google.mail.sent[0]?.idempotencyKey).toBe(`digest:${digest.id}:v1`)
    await sendWeeklyDigest(ctx, director, digest.id)
    expect(ctx.google.mail.sent).toHaveLength(1)
    // Regenerar → versión 2; el digest nunca muta tareas.
    const before = [...ctx.state.actionItems.values()].map((i) => i.status)
    const v2 = await generateWeeklyDigest(ctx, director, { weekOf: '2026-09-01' })
    expect(v2.version).toBe(2)
    expect([...ctx.state.actionItems.values()].map((i) => i.status)).toEqual(before)
    const dto = await getDigest(ctx, director, v2.id)
    expect(dto.emailPreviewHtml).toContain('Resumen semanal')
    expect(ctx.events.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['WeeklyDigestGenerated', 'WeeklyDigestSent']),
    )
  })

  it('bandeja de aprobación incluye COMPLETION_PROPOSED con enlace y respeta flags', async () => {
    const director = principalOf(u.andres)
    const item = await createActionItem(ctx, director, {
      title: 'Cerrar contrato',
      ownerUserId: u.lucia.id,
    })
    await proposeCompletion(ctx, principalOf(u.lucia), item.id, 'listo')
    const digest = await generateWeeklyDigest(ctx, null, { withNarrative: false })
    const p = digest.payload as WeeklyDigestPayload
    expect(p.approvalInbox[0]).toMatchObject({
      key: item.externalKey,
      proposedBy: 'Lucía Ferrer',
      url: `${ctx.env.APP_URL}/pendientes/${item.id}`,
    })
    expect(p.narrative).toBeNull()
    await updateDigestConfig(ctx, principalOf(u.admin), { sendEmail: false })
    await expect(sendWeeklyDigest(ctx, director, digest.id)).rejects.toMatchObject({
      code: DomainErrorCode.FEATURE_DISABLED,
    })
    await expect(sendWeeklyDigest(ctx, principalOf(u.mariana), digest.id)).rejects.toMatchObject({
      code: DomainErrorCode.FORBIDDEN,
    })
  })

  it('programación: cron y próxima ejecución desde la configuración', async () => {
    expect(digestCronOf({ dayOfWeek: 5, localTime: '18:30' })).toBe('30 18 * * 5')
    const s = await scheduleWeeklyDigest(ctx)
    expect(s.cron).toBe('0 18 * * 5')
    // 2026-09-03 (jueves 12:00 CDMX, UTC-6 sin horario de verano) → viernes 2026-09-04 18:00 CDMX = 00:00Z del 5.
    expect(s.nextRunAt?.toISOString()).toBe('2026-09-05T00:00:00.000Z')
    expect(ctx.queue.schedules[0]).toMatchObject({
      name: 'generate-weekly-digest',
      cron: '0 18 * * 5',
      timezone: 'America/Mexico_City',
    })
  })
})
