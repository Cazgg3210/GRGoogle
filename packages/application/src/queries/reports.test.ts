import { beforeEach, describe, expect, it } from 'vitest'
import { ActionItemDtoSchema, DashboardDtoSchema, SheetsSyncResultSchema } from '@smlxl/contracts'
import { ActionItemStatus, DomainErrorCode } from '@smlxl/domain'
import {
  createTestContext,
  principalOf,
  seedDemoUsers,
  type SeededUsers,
  type TestContext,
} from '../testing/index.js'
import {
  approveCompletion,
  createActionItem,
  proposeCompletion,
  updateActionItem,
} from '../use-cases/action-items/commands.js'
import { simulateMeetingEnded } from '../use-cases/meetings/simulate-meeting-ended.js'
import { sendReminders } from '../use-cases/notifications/send-reminders.js'
import {
  PENDIENTES_COLUMNS,
  REUNIONES_COLUMNS,
  syncTasksToGoogleSheets,
} from '../use-cases/sheets/sync-tasks-to-google-sheets.js'
import { getDashboard } from './dashboard.js'
import { listActionItems } from './action-items.js'
import { createApplication } from '../index.js'

let ctx: TestContext
let u: SeededUsers

beforeEach(async () => {
  ctx = createTestContext({
    now: '2026-09-03T18:00:00Z',
    env: { GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-demo' },
  })
  u = await seedDemoUsers(ctx)
})

async function seedScenario() {
  const director = principalOf(u.andres)
  const overdue = await createActionItem(ctx, director, {
    title: 'Entregar reporte fiscal',
    ownerUserId: u.mariana.id,
    dueDate: '2026-08-30',
    priority: 'URGENT',
    areaId: u.areas.operaciones.id,
  })
  const soon = await createActionItem(ctx, director, {
    title: 'Enviar cotización',
    ownerUserId: u.mariana.id,
    dueDate: '2026-09-05',
    areaId: u.areas.operaciones.id,
  })
  const noDate = await createActionItem(ctx, director, {
    title: 'Definir plan de capacitación',
    ownerUserId: u.lucia.id,
    areaId: u.areas.juridico.id,
  })
  const done = await createActionItem(ctx, director, {
    title: 'Firmar convenio',
    ownerUserId: u.lucia.id,
    dueDate: '2026-09-02',
    areaId: u.areas.juridico.id,
  })
  const { proposal } = await proposeCompletion(ctx, principalOf(u.lucia), done.id, 'firmado')
  await approveCompletion(ctx, director, done.id, proposal.id)
  await updateActionItem(ctx, principalOf(u.lucia), noDate.id, {
    status: ActionItemStatus.IN_PROGRESS,
  })
  await simulateMeetingEnded(ctx, principalOf(u.admin), {})
  return { overdue, soon, noDate, done }
}

describe('dashboard y listados', () => {
  it('calcula KPIs, por área/persona, tendencia, atención y calidad de captura respetando alcance', async () => {
    const { overdue, done } = await seedScenario()
    const dash = await getDashboard(ctx, principalOf(u.andres), {})
    expect(DashboardDtoSchema.safeParse(dash).success).toBe(true)
    expect(dash.kpis).toMatchObject({
      completedInPeriod: 1,
      overdue: 1,
      meetingsDetected: 2,
      meetingsProcessed: 1,
    })
    expect(dash.kpis.totalOpen).toBe(6)
    expect(dash.kpis.inProgress).toBe(1)
    expect(dash.kpis.progressPct).toBeCloseTo(14.3, 0)
    const ops = dash.byArea.find((r) => r.key === u.areas.operaciones.id)
    expect(ops).toMatchObject({ total: 3, overdue: 1, completed: 0 })
    const jur = dash.byArea.find((r) => r.key === u.areas.juridico.id)
    expect(jur?.completed).toBe(1)
    expect(dash.byPerson.find((r) => r.key === u.mariana.id)?.overdue).toBe(1)
    expect(dash.weeklyTrend).toHaveLength(8)
    expect(dash.weeklyTrend.at(-1)).toMatchObject({ week: '2026-W36', created: 7, completed: 1 })
    expect(dash.needsAttention[0]?.id).toBe(overdue.id)
    expect(dash.needsAttention[0]?.attentionReasons).toContain('OVERDUE_HIGH_PRIORITY')
    expect(dash.needsAttention.every((i) => i.id !== done.id)).toBe(true)
    expect(dash.captureQuality).toMatchObject({
      detected: 2,
      withTranscript: 1,
      withSmartNotes: 1,
      noArtifact: 1,
      externalHostUnavailable: 0,
    })
    expect(dash.recentMeetings).toHaveLength(4)
    // MEMBER sólo ve lo suyo.
    const mine = await getDashboard(ctx, principalOf(u.mariana), {})
    expect(mine.kpis.totalOpen).toBe(3)
    expect(mine.byPerson.map((r) => r.key)).toEqual([u.mariana.id])
  })

  it('listActionItems implementa las vistas y ordena por atención', async () => {
    const { overdue, noDate } = await seedScenario()
    const director = principalOf(u.andres)
    const all = await listActionItems(ctx, director, { view: 'all' })
    expect(all.total).toBe(6)
    expect(all.items[0]?.id).toBe(overdue.id)
    expect(ActionItemDtoSchema.safeParse(all.items[0]).success).toBe(true)
    expect(
      (await listActionItems(ctx, director, { view: 'overdue' })).items.map((i) => i.id),
    ).toEqual([overdue.id])
    expect((await listActionItems(ctx, director, { view: 'completed' })).total).toBe(1)
    expect(
      (await listActionItems(ctx, director, { view: 'noDueDate' })).items.some(
        (i) => i.id === noDate.id,
      ),
    ).toBe(true)
    expect(
      (await listActionItems(ctx, director, { view: 'thisWeek' })).items.map((i) => i.title),
    ).toContain('Enviar cotización')
    expect((await listActionItems(ctx, director, { view: 'proposed' })).total).toBe(2)
    expect((await listActionItems(ctx, principalOf(u.mariana), { view: 'mine' })).total).toBe(3)
    const team = await listActionItems(
      ctx,
      principalOf(u.lucia, { teamUserIds: [u.mariana.id], managedAreaIds: [u.areas.juridico.id] }),
      { view: 'team' },
    )
    expect(team.total).toBe(5)
    const paged = await listActionItems(ctx, director, {
      view: 'all',
      sort: 'dueDate',
      page: 2,
      pageSize: 2,
    })
    expect(paged).toMatchObject({ page: 2, pageSize: 2, total: 6 })
    expect(paged.items).toHaveLength(2)
    const app = createApplication(ctx)
    expect((await app.actionItems.list(director, { view: 'blocked' })).total).toBe(0)
  })
})

describe('proyección a Sheets', () => {
  it('genera Pendientes/Reuniones con UUID como clave y hace upsert idempotente', async () => {
    await seedScenario()
    const dry = await syncTasksToGoogleSheets(ctx, principalOf(u.andres), { dryRun: true })
    expect(SheetsSyncResultSchema.safeParse(dry).success).toBe(true)
    expect(dry.preview.pendientes.columns).toEqual([...PENDIENTES_COLUMNS])
    expect(dry.preview.reuniones.columns).toEqual([...REUNIONES_COLUMNS])
    expect(dry.preview.pendientes.columns[0]).toBe('UUID')
    expect(dry.preview.pendientes.rows[0]?.['UUID']).toMatch(/^[0-9a-f-]{36}$/)
    expect(
      dry.preview.pendientes.rows.find((r) => r['Actividad'] === 'Entregar reporte fiscal'),
    ).toMatchObject({
      Vencido: 'Sí',
      Responsable: 'Mariana Solís',
      Área: 'Operaciones y Proyectos',
      'Fecha compromiso': '2026-08-30',
    })
    expect(
      dry.preview.reuniones.rows.find((r) => r['Reunión'] === 'Seguimiento contrato Cliente Alfa'),
    ).toMatchObject({ Organizador: 'Andrés Escandón', '# Acuerdos': 2, '# Tareas nuevas': 3 })
    expect(dry.pendientes).toEqual({ inserted: 0, updated: 0 })
    expect(ctx.google.sheets.snapshot()).toEqual({})
    const real = await syncTasksToGoogleSheets(ctx, principalOf(u.andres), {})
    expect(real.pendientes).toEqual({ inserted: 7, updated: 0 })
    expect(real.reuniones.inserted).toBe(4)
    const again = await syncTasksToGoogleSheets(ctx, null, {})
    expect(again.pendientes).toEqual({ inserted: 0, updated: 7 })
    const snap = ctx.google.sheets.snapshot()['sheet-demo/Pendientes']
    expect(snap?.rows).toHaveLength(7)
    const s = await ctx.getSettings()
    await ctx.repos.settings.save(
      { ...s, featureFlags: { ...s.featureFlags, SHEETS_SYNC_ENABLED: false } },
      null,
    )
    await expect(syncTasksToGoogleSheets(ctx, principalOf(u.andres), {})).rejects.toMatchObject({
      code: DomainErrorCode.FEATURE_DISABLED,
    })
    await expect(
      syncTasksToGoogleSheets(ctx, principalOf(u.mariana), { dryRun: true }),
    ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN })
  })
})

describe('recordatorios', () => {
  it('agrupa por usuario un correo al día (idempotente) y respeta preferencias/flag', async () => {
    await seedScenario()
    const first = await sendReminders(ctx)
    expect(first).toMatchObject({
      users: 1,
      emailsSent: 1,
      emailsSkipped: 0,
      overdue: 1,
      dueSoon: 1,
      disabled: false,
    })
    const mail = ctx.google.mail.sent[0]
    expect(mail?.to).toEqual([u.mariana.email])
    expect(mail?.subject).toContain('1 tarea(s) vencida(s)')
    expect(mail?.idempotencyKey).toBe(`reminder:${u.mariana.id}:2026-09-03`)
    expect(mail?.text).toContain('Entregar reporte fiscal')
    const second = await sendReminders(ctx)
    expect(second).toMatchObject({ emailsSent: 0, emailsSkipped: 1 })
    ctx.clock.advanceDays(1)
    const third = await sendReminders(ctx)
    expect(third.emailsSent).toBe(1)
    const mariana = (await ctx.repos.users.findById(u.mariana.id))!
    await ctx.repos.users.save({
      ...mariana,
      notificationPreferences: {
        ...mariana.notificationPreferences,
        dueSoon: false,
        overdue: false,
      },
    })
    ctx.clock.advanceDays(1)
    expect((await sendReminders(ctx)).users).toBe(0)
    const s = await ctx.getSettings()
    await ctx.repos.settings.save(
      { ...s, featureFlags: { ...s.featureFlags, GMAIL_NOTIFICATIONS_ENABLED: false } },
      null,
    )
    expect((await sendReminders(ctx)).disabled).toBe(true)
  })
})
