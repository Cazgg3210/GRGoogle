import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { JobNames } from '@smlxl/config'
import { createApplication, type AppContext, type Application } from '@smlxl/application'
import { createTestContext, seedDemoUsers, type TestContext } from '@smlxl/application/testing'
import { InMemoryJobQueue } from '@smlxl/jobs'
import { createLogger } from '@smlxl/observability'
import { JobPayloadSchemas, registerJobHandlers } from './handlers.js'
import { CRON, applyDigestSchedule, registerSchedules } from './schedules.js'

const logger = createLogger({ service: 'worker-test', level: 'silent', pretty: false })

let base: TestContext
let ctx: AppContext
let application: Application
let queue: InMemoryJobQueue

beforeEach(async () => {
  base = createTestContext()
  await seedDemoUsers(base)
  queue = new InMemoryJobQueue()
  ctx = { ...base, queue }
  application = createApplication(ctx)
  await registerJobHandlers(queue, application, logger)
})

describe('handlers de jobs', () => {
  it('registra un handler por cada JobNames y cada uno tiene schema de payload', () => {
    for (const name of Object.values(JobNames)) expect(JobPayloadSchemas[name]).toBeDefined()
  })

  it('rechaza payloads inválidos con ZodError', async () => {
    await expect(queue.enqueue(JobNames.FETCH_MEETING_ARTIFACTS, {})).rejects.toBeInstanceOf(ZodError)
    await expect(queue.enqueue(JobNames.SEND_WEEKLY_DIGEST, { digestId: 42 })).rejects.toBeInstanceOf(ZodError)
    await expect(queue.enqueue(JobNames.PROCESS_GOOGLE_EVENT, { event: { id: 'x' } })).rejects.toBeInstanceOf(ZodError)
  })

  it('un fallo de FETCH_MEETING_ARTIFACTS se relanza para que la cola reintente', async () => {
    await expect(queue.enqueue(JobNames.FETCH_MEETING_ARTIFACTS, { meetingId: '00000000-0000-4000-8000-000000000404' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('jobs de cron con payload vacío/undefined se aceptan y respetan feature flags', async () => {
    const settings = await ctx.repos.settings.get()
    await ctx.repos.settings.save({ ...settings, featureFlags: { ...settings.featureFlags, SHEETS_SYNC_ENABLED: false, GMAIL_NOTIFICATIONS_ENABLED: false } }, null)
    await expect(queue.enqueue(JobNames.SEND_DUE_REMINDERS, undefined)).resolves.toBeTruthy()
    await expect(queue.enqueue(JobNames.CLEANUP_EXPIRED_RAW_DATA, {})).resolves.toBeTruthy()
    await expect(queue.enqueue(JobNames.SYNC_GOOGLE_SHEETS, {})).resolves.toBeTruthy()
    await expect(queue.enqueue(JobNames.RECONCILE_ACTION_ITEMS, { meetingId: 'm', processingRunId: 'r' })).resolves.toBeTruthy()
    await expect(queue.enqueue(JobNames.RENEW_GOOGLE_SUBSCRIPTIONS, null)).resolves.toBeTruthy()
    expect(base.state.audit.some((a) => a.action === 'sheets.synced')).toBe(false)
  })

  it('GENERATE_WEEKLY_DIGEST genera el digest y omite el envío si está deshabilitado', async () => {
    const cfg = await ctx.repos.digests.getConfig()
    await ctx.repos.digests.saveConfig({ ...cfg, sendEmail: false })
    await expect(queue.enqueue(JobNames.GENERATE_WEEKLY_DIGEST, { sendAfterGenerate: true })).resolves.toBeTruthy()
    const digests = await ctx.repos.digests.list(5)
    expect(digests).toHaveLength(1)
    expect(digests[0]?.sentAt).toBeNull()
  })

  it('RETRY_FAILED_MEETING_PROCESSING sin reuniones fallidas termina sin error', async () => {
    await expect(queue.enqueue(JobNames.RETRY_FAILED_MEETING_PROCESSING, {})).resolves.toBeTruthy()
  })
})

describe('programación de cron', () => {
  it('registra los cron fijos con la zona horaria de la empresa y omite Calendar si la integración está apagada', async () => {
    const summary = await registerSchedules(queue, application, logger)
    const names = queue.scheduled.map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining([JobNames.RENEW_GOOGLE_SUBSCRIPTIONS, JobNames.SEND_DUE_REMINDERS, JobNames.CLEANUP_EXPIRED_RAW_DATA, JobNames.RETRY_FAILED_MEETING_PROCESSING, JobNames.RECONCILE_MISSING_EVENTS]))
    expect(names).not.toContain(JobNames.CALENDAR_INCREMENTAL_SYNC)
    expect(summary.skipped).toEqual([{ name: JobNames.CALENDAR_INCREMENTAL_SYNC, reason: 'GOOGLE_INTEGRATION_ENABLED=false' }])
    expect(queue.scheduled.find((s) => s.name === JobNames.SEND_DUE_REMINDERS)?.cron).toBe(CRON[JobNames.SEND_DUE_REMINDERS])
    expect(summary.registered.every((r) => r.timezone === 'America/Mexico_City')).toBe(true)
    // El digest se programa a través de la aplicación (ctx.queue) con el cron derivado de la configuración.
    expect(summary.digest.enabled).toBe(true)
    expect(queue.scheduled.find((s) => s.name === JobNames.GENERATE_WEEKLY_DIGEST)?.cron).toBe(summary.digest.cron)
  })

  it('reprograma el digest sólo cuando cambia la configuración', async () => {
    const first = await applyDigestSchedule(queue, application, logger, null)
    const before = queue.scheduled.length
    const same = await applyDigestSchedule(queue, application, logger, first)
    expect(same).toEqual(first)
    expect(queue.scheduled.length).toBe(before)
    const cfg = await ctx.repos.digests.getConfig()
    await ctx.repos.digests.saveConfig({ ...cfg, dayOfWeek: (cfg.dayOfWeek + 1) % 7, localTime: '09:30' })
    const changed = await applyDigestSchedule(queue, application, logger, first)
    expect(changed.cron).not.toBe(first.cron)
    expect(queue.scheduled.at(-1)).toMatchObject({ name: JobNames.GENERATE_WEEKLY_DIGEST, cron: changed.cron })
  })
})
