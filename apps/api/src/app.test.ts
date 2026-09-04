import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApplication, type AppContext } from '@smlxl/application'
import { createTestContext, seedDemoUsers, type SeededUsers, type TestContext } from '@smlxl/application/testing'
import { mintApiToken } from '@smlxl/auth/token'
import { createFakeConferenceEndedEvent, loadDefaultFixtures } from '@smlxl/google-workspace'
import { InMemoryJobQueue } from '@smlxl/jobs'
import { ActionItemStatus, type ActionItem } from '@smlxl/domain'
import type { Env } from '@smlxl/config'
import { buildServer, type AppServer } from './server.js'
import { registerRoutes } from './routes/index.js'
import { cloudEventFromPubSub } from './routes/webhooks.js'

const SECRET = 'test-secret-1234'
const PUSH_TOKEN = 'push-token-abc'

interface TestApp {
  app: AppServer
  base: TestContext
  ctx: AppContext
  queue: InMemoryJobQueue
  users: SeededUsers
}

/** Servidor completo sobre repos en memoria + cola en memoria (sin pg-boss ni Postgres). */
async function buildTestApp(env: Partial<Record<keyof Env, string | boolean | number>> = {}): Promise<TestApp> {
  const base = createTestContext({ env: { AUTH_DEV_BYPASS: true, AUTH_SECRET: SECRET, GOOGLE_PUBSUB_PUSH_TOKEN: PUSH_TOKEN, ...env } })
  const users = await seedDemoUsers(base)
  const queue = new InMemoryJobQueue({ manual: true })
  const ctx: AppContext = { ...base, queue }
  const application = createApplication(ctx)
  const app = await buildServer({ env: ctx.env, logger: ctx.logger, users: ctx.repos.users })
  registerRoutes(app, { application, ctx, env: ctx.env, version: 'test', checkDatabase: async () => true, jobStats: async () => [{ name: 'q', created: 1, active: 0, completed: 0, failed: 0 }] })
  await app.ready()
  return { app, base, ctx, queue, users }
}

const asUser = (email: string) => ({ 'x-dev-user-email': email })

function pubsubBody(event: unknown, mode: 'structured' | 'binary' = 'structured') {
  if (mode === 'structured') {
    return { message: { messageId: 'm-1', data: Buffer.from(JSON.stringify(event)).toString('base64') }, subscription: 'projects/p/subscriptions/s' }
  }
  const e = event as { id: string; type: string; source: string; subject?: string; time?: string; data?: unknown }
  return {
    message: {
      messageId: 'm-2',
      data: Buffer.from(JSON.stringify(e.data ?? {})).toString('base64'),
      attributes: { 'ce-id': e.id, 'ce-type': e.type, 'ce-source': e.source, ...(e.subject ? { 'ce-subject': e.subject } : {}), ...(e.time ? { 'ce-time': e.time } : {}) },
    },
    subscription: 'projects/p/subscriptions/s',
  }
}

let t: TestApp

beforeAll(async () => {
  t = await buildTestApp()
})

afterAll(async () => {
  await t.app.close()
})

describe('autenticación y sesión', () => {
  it('401 sin credenciales, con formato ErrorResponse', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/session' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED', message: expect.any(String), correlationId: expect.any(String) })
  })

  it('401 con correo desconocido en bypass', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/session', headers: asUser('nadie@smlxl.mx') })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHORIZED')
  })

  it('bypass por header resuelve el usuario por email y devuelve permisos efectivos', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/session', headers: asUser(t.users.andres.email) })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user).toMatchObject({ id: t.users.andres.id, email: t.users.andres.email, role: 'DIRECTOR', areaName: 'Dirección General' })
    expect(body.permissions).toContain('MEETING_REPROCESS')
    expect(body.permissions).not.toContain('USER_MANAGE')
  })

  it('JWT válido (sub = email, como el token de arranque de la web) autentica; token inválido → 401', async () => {
    const token = await mintApiToken({ sub: t.users.mariana.email, email: t.users.mariana.email, role: 'MEMBER', name: 'Mariana' }, SECRET)
    const ok = await t.app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${token}` } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().user.role).toBe('MEMBER')
    const bad = await t.app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: 'Bearer not-a-jwt' } })
    expect(bad.statusCode).toBe(401)
    const wrongSecret = await mintApiToken({ sub: 'x', email: t.users.mariana.email, role: 'MEMBER', name: 'M' }, 'otro-secreto-123')
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${wrongSecret}` } })).statusCode).toBe(401)
  })

  it('/health es público y /openapi.json expone las rutas', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/health' })).json()).toMatchObject({ status: 'ok', db: 'up', version: 'test' })
    const spec = (await t.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json()
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/api/v1/session', '/api/v1/meetings/{id}', '/api/v1/webhooks/google/pubsub', '/api/v1/admin/jobs']))
  })
})

describe('RBAC y formato de errores', () => {
  it('MEMBER recibe 403 en rutas de administración; ADMIN 200', async () => {
    const forbidden = await t.app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: asUser(t.users.mariana.email) })
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json()).toMatchObject({ code: 'FORBIDDEN', correlationId: expect.any(String) })
    const ok = await t.app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: asUser(t.users.admin.email) })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toHaveLength(4)
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/admin/jobs', headers: asUser(t.users.admin.email) })).json()).toEqual({ queues: [{ name: 'q', created: 1, active: 0, completed: 0, failed: 0 }] })
  })

  it('404 de dominio, 422 de validación y 404 de ruta usan ErrorResponseSchema', async () => {
    const notFound = await t.app.inject({ method: 'GET', url: '/api/v1/meetings/00000000-0000-4000-8000-000000009999', headers: asUser(t.users.andres.email) })
    expect(notFound.statusCode).toBe(404)
    expect(notFound.json()).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'Meeting' } })
    const invalid = await t.app.inject({ method: 'GET', url: '/api/v1/action-items?page=0', headers: asUser(t.users.andres.email) })
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json()).toMatchObject({ code: 'VALIDATION_ERROR', details: { issues: expect.any(Array) } })
    const missing = await t.app.inject({ method: 'GET', url: '/api/v1/nope', headers: asUser(t.users.andres.email) })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().code).toBe('NOT_FOUND')
  })

  it('el correlationId del header se propaga a la respuesta de error', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/session', headers: { 'x-correlation-id': 'corr-123' } })
    expect(res.json().correlationId).toBe('corr-123')
  })
})

describe('webhook Pub/Sub', () => {
  const record = loadDefaultFixtures().conferenceRecords[0]!
  const event = createFakeConferenceEndedEvent(record.name, { id: 'evt-pubsub-1' })

  it('rechaza sin token o con token incorrecto', async () => {
    expect((await t.app.inject({ method: 'POST', url: '/api/v1/webhooks/google/pubsub', payload: pubsubBody(event) })).statusCode).toBe(401)
    expect((await t.app.inject({ method: 'POST', url: '/api/v1/webhooks/google/pubsub?token=wrong', payload: pubsubBody(event) })).statusCode).toBe(401)
  })

  it('rechaza siempre cuando GOOGLE_PUBSUB_PUSH_TOKEN está vacío', async () => {
    const other = await buildTestApp({ GOOGLE_PUBSUB_PUSH_TOKEN: '' })
    const res = await other.app.inject({ method: 'POST', url: '/api/v1/webhooks/google/pubsub?token=', payload: pubsubBody(event) })
    expect(res.statusCode).toBe(401)
    await other.app.close()
  })

  it('procesa el evento (204), es idempotente ante duplicados (204) y crea la reunión', async () => {
    const first = await t.app.inject({ method: 'POST', url: `/api/v1/webhooks/google/pubsub?token=${PUSH_TOKEN}`, payload: pubsubBody(event) })
    expect(first.statusCode).toBe(204)
    const second = await t.app.inject({ method: 'POST', url: `/api/v1/webhooks/google/pubsub?token=${PUSH_TOKEN}`, payload: pubsubBody(event, 'binary') })
    expect(second.statusCode).toBe(204)
    const stored = await t.ctx.repos.inboundEvents.findByCloudEventId('evt-pubsub-1')
    expect(stored).toMatchObject({ processingStatus: 'PROCESSED', attempts: 1 })
    const meeting = await t.ctx.repos.meetings.findByConferenceRecordId(record.name)
    expect(meeting).not.toBeNull()
    expect(t.queue.enqueued.some((j) => j.name === 'fetch-meeting-artifacts')).toBe(true)
  })

  it('mensajes sin CloudEvent interpretable se confirman con 204', async () => {
    const res = await t.app.inject({ method: 'POST', url: `/api/v1/webhooks/google/pubsub?token=${PUSH_TOKEN}`, payload: { message: { messageId: 'm-x', data: Buffer.from('no json').toString('base64') }, subscription: 's' } })
    expect(res.statusCode).toBe(204)
  })

  it('decodifica binary y structured content mode', () => {
    expect(cloudEventFromPubSub(pubsubBody(event))).toMatchObject({ id: 'evt-pubsub-1', type: event.type })
    expect(cloudEventFromPubSub(pubsubBody(event, 'binary'))).toMatchObject({ id: 'evt-pubsub-1', type: event.type, source: event.source })
  })
})

describe('flujo de action items por HTTP', () => {
  it('crear → proponer cierre → aprobar; MEMBER no puede aprobar', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/v1/action-items',
      headers: asUser(t.users.andres.email),
      payload: { title: 'Enviar contrato firmado', ownerUserId: t.users.lucia.id, dueDate: '2026-09-10', priority: 'HIGH' },
    })
    expect(created.statusCode).toBe(201)
    const item = created.json()
    expect(item).toMatchObject({ status: 'PENDING', ownerUserId: t.users.lucia.id, externalKey: 'ACT-000001', allowedTransitions: expect.any(Array) })

    const proposed = await t.app.inject({ method: 'POST', url: `/api/v1/action-items/${item.id}/complete`, headers: asUser(t.users.lucia.email), payload: { reason: 'Contrato enviado y confirmado' } })
    expect(proposed.statusCode).toBe(200)
    expect(proposed.json()).toMatchObject({ status: 'COMPLETION_PROPOSED', pendingProposalId: expect.any(String) })
    const proposalId = proposed.json().pendingProposalId as string

    const denied = await t.app.inject({ method: 'POST', url: `/api/v1/action-items/${item.id}/proposals/${proposalId}/approve`, headers: asUser(t.users.mariana.email), payload: {} })
    expect(denied.statusCode).toBe(403)

    const counts = await t.app.inject({ method: 'GET', url: '/api/v1/notifications/counts', headers: asUser(t.users.andres.email) })
    expect(counts.json()).toEqual({ pendingAiReview: 0, pendingCompletionProposals: 1 })

    const approved = await t.app.inject({ method: 'POST', url: `/api/v1/action-items/${item.id}/proposals/${proposalId}/approve`, headers: asUser(t.users.andres.email), payload: { comment: 'ok' } })
    expect(approved.statusCode).toBe(200)
    expect(approved.json()).toMatchObject({ status: 'COMPLETED', pendingProposalId: null })
    expect(await t.ctx.repos.completionProposals.findById(proposalId)).toMatchObject({ status: 'APPROVED', reviewComment: 'ok', reviewedByUserId: t.users.andres.id })

    const comment = await t.app.inject({ method: 'POST', url: `/api/v1/action-items/${item.id}/comments`, headers: asUser(t.users.lucia.email), payload: { body: 'Gracias' } })
    expect(comment.statusCode).toBe(201)
    expect(comment.json()).toMatchObject({ body: 'Gracias', authorName: 'Lucía Ferrer' })

    const list = await t.app.inject({ method: 'GET', url: '/api/v1/action-items?view=completed', headers: asUser(t.users.andres.email) })
    expect(list.json()).toMatchObject({ total: 1, items: [{ id: item.id }] })
  })
})

describe('revisión IA por HTTP', () => {
  it('lista (con filtro reason) y aprueba una propuesta', async () => {
    const now = t.base.clock.now()
    const meetingId = t.base.ids.next()
    const proposedId = t.base.ids.next()
    const proposed: ActionItem = {
      id: proposedId, externalKey: 'ACT-IA0001', title: 'Tarea IA', description: null, type: 'ONE_OFF', ownerUserId: null, externalAssigneeId: null, ownerTextOriginal: 'Carlos', collaboratorUserIds: [], areaId: null, projectId: null,
      createdFromMeetingId: meetingId, latestMeetingId: meetingId, status: ActionItemStatus.PROPOSED, priority: 'MEDIUM', dueDate: null, dueDateTextOriginal: null, dateConfidence: null, startDate: null, completedAt: null, cancelledAt: null,
      confidence: 0.75, requiresReview: true, sourceEvidence: [], recurrence: null, parentActionItemId: null, blocker: null, tags: [], migrationTrust: 'PLATFORM', legacyId: null, lastMentionedAt: null, createdAt: now, updatedAt: now,
    }
    await t.ctx.repos.actionItems.save(proposed)
    const review = await t.ctx.repos.aiReview.save({
      id: t.base.ids.next(), meetingId, processingRunId: 'run', reasons: ['LOW_CONFIDENCE'], reconcileDecision: 'CREATE_NEW', candidateActionItemId: null, candidateScore: null, proposedActionItemId: proposedId,
      extracted: { title: 'Tarea IA', owner: null, dueDate: null, priority: null, statusHint: 'NEW', evidence: [{ text: 'x' }], confidence: 0.75 },
      suggestedOwnerUserId: null, suggestedOwnerConfidence: null, suggestedDueDate: null, suggestedDueDateConfidence: null, status: 'PENDING', resolvedByUserId: null, resolvedAt: null, resolutionNote: null, createdAt: now,
    })

    expect((await t.app.inject({ method: 'GET', url: '/api/v1/ai-review', headers: asUser(t.users.mariana.email) })).statusCode).toBe(403)
    const all = await t.app.inject({ method: 'GET', url: '/api/v1/ai-review', headers: asUser(t.users.andres.email) })
    expect(all.statusCode).toBe(200)
    expect(all.json()).toMatchObject({ total: 1, items: [{ id: review.id, reasons: ['LOW_CONFIDENCE'] }] })
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/ai-review?reason=POSSIBLE_COMPLETION', headers: asUser(t.users.andres.email) })).json().total).toBe(0)
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/ai-review?reason=LOW_CONFIDENCE', headers: asUser(t.users.andres.email) })).json().total).toBe(1)
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/notifications/counts', headers: asUser(t.users.andres.email) })).json().pendingAiReview).toBe(1)

    const approved = await t.app.inject({ method: 'POST', url: `/api/v1/ai-review/${review.id}/approve`, headers: asUser(t.users.andres.email), payload: { ownerUserId: t.users.lucia.id, dueDate: '2026-09-12' } })
    expect(approved.statusCode).toBe(200)
    expect(approved.json()).toMatchObject({ id: review.id, status: 'APPROVED' })
    const detail = await t.app.inject({ method: 'GET', url: `/api/v1/action-items/${proposedId}`, headers: asUser(t.users.andres.email) })
    expect(detail.json()).toMatchObject({ status: 'PENDING', ownerUserId: t.users.lucia.id, requiresReview: false, dueDate: '2026-09-12' })
  })
})

describe('integraciones', () => {
  it('simulate/meeting-ended ejecuta el pipeline FAKE y la reunión queda analizada', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/integrations/simulate/meeting-ended', headers: asUser(t.users.admin.email), payload: {} })
    expect(res.statusCode).toBe(200)
    const { meetingId } = res.json()
    const detail = await t.app.inject({ method: 'GET', url: `/api/v1/meetings/${meetingId}`, headers: asUser(t.users.admin.email) })
    expect(detail.statusCode).toBe(200)
    expect(['ANALYZED', 'REVIEW_REQUIRED', 'COMPLETED']).toContain(detail.json().processingStatus)
    const transcript = await t.app.inject({ method: 'GET', url: `/api/v1/meetings/${meetingId}/transcript`, headers: asUser(t.users.admin.email) })
    expect(transcript.statusCode).toBe(200)
    expect(transcript.json().transcripts.length).toBeGreaterThan(0)
    const status = await t.app.inject({ method: 'GET', url: '/api/v1/integrations/google/status', headers: asUser(t.users.admin.email) })
    expect(status.json().mode).toBe('FAKE')
  })

  it('simulate responde 409 FEATURE_DISABLED fuera del modo FAKE', async () => {
    const real = await buildTestApp({ GOOGLE_INTEGRATION_ENABLED: true, GOOGLE_SERVICE_ACCOUNT_EMAIL: 'svc@smlxl.mx' })
    const res = await real.app.inject({ method: 'POST', url: '/api/v1/integrations/simulate/meeting-ended', headers: asUser(real.users.admin.email), payload: {} })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('FEATURE_DISABLED')
    await real.app.close()
  })

  it('calendar/sync encola CALENDAR_INCREMENTAL_SYNC y sheets/sync dryRun devuelve la vista previa', async () => {
    const cal = await t.app.inject({ method: 'POST', url: '/api/v1/integrations/google/calendar/sync', headers: asUser(t.users.admin.email) })
    expect(cal.json()).toEqual({ queued: true })
    expect(t.queue.enqueued.some((j) => j.name === 'calendar-incremental-sync')).toBe(true)
    const sheets = await t.app.inject({ method: 'POST', url: '/api/v1/integrations/google/sheets/sync', headers: asUser(t.users.admin.email), payload: { dryRun: true } })
    expect(sheets.statusCode).toBe(200)
    expect(sheets.json().preview.pendientes.columns.length).toBeGreaterThan(0)
  })

  it('catálogos de equipo incluyen responsables externos', async () => {
    await t.ctx.repos.externalAssignees.save({ id: t.base.ids.next(), displayName: 'Proveedor Beta', company: 'Beta SA', email: null, phone: null, source: 'MANUAL', active: true })
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/team/external-assignees', headers: asUser(t.users.mariana.email) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toContainEqual({ id: expect.any(String), displayName: 'Proveedor Beta', company: 'Beta SA', email: null, active: true })
    expect(res.json().every((a: { active: boolean }) => a.active)).toBe(true)
  })
})
