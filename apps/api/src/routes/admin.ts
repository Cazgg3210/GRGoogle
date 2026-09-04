import { z } from 'zod'
import {
  AreaDtoSchema,
  AuditEntryDtoSchema,
  AuditQuerySchema,
  JobQueueStatsSchema,
  PlatformSettingsDtoSchema,
  ProjectDtoSchema,
  UpdatePlatformSettingsBodySchema,
  UpdateUserBodySchema,
  UpsertAreaBodySchema,
  UpsertProjectBodySchema,
  UserDtoSchema,
  pageSchema,
} from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import { requirePermission, requirePrincipal } from '../plugins/auth.js'
import { IdParams, type RouteDeps } from './common.js'

export function registerAdminRoutes(app: AppServer, deps: RouteDeps): void {
  const { application } = deps
  const tags = ['administración']
  const users = requirePermission(Permission.USER_MANAGE)
  const catalogs = requirePermission(Permission.CATALOG_MANAGE)
  const config = requirePermission(Permission.CONFIG_MANAGE)

  app.get('/api/v1/admin/users', { schema: { tags, response: { 200: z.array(UserDtoSchema) } }, preHandler: users }, async () => application.admin.listUsers())
  app.patch('/api/v1/admin/users/:id', { schema: { tags, params: IdParams, body: UpdateUserBodySchema, response: { 200: UserDtoSchema } }, preHandler: users }, async (request) =>
    application.admin.updateUser(requirePrincipal(request), request.params.id, request.body),
  )

  app.get('/api/v1/admin/areas', { schema: { tags, response: { 200: z.array(AreaDtoSchema) } }, preHandler: catalogs }, async () => application.admin.listAreas(false))
  app.post('/api/v1/admin/areas', { schema: { tags, body: UpsertAreaBodySchema, response: { 201: AreaDtoSchema } }, preHandler: catalogs }, async (request, reply) =>
    reply.status(201).send(await application.admin.upsertArea(requirePrincipal(request), request.body)),
  )
  app.patch('/api/v1/admin/areas/:id', { schema: { tags, params: IdParams, body: UpsertAreaBodySchema, response: { 200: AreaDtoSchema } }, preHandler: catalogs }, async (request) =>
    application.admin.upsertArea(requirePrincipal(request), request.body, request.params.id),
  )

  app.get('/api/v1/admin/projects', { schema: { tags, response: { 200: z.array(ProjectDtoSchema) } }, preHandler: catalogs }, async () => application.admin.listProjects(false))
  app.post('/api/v1/admin/projects', { schema: { tags, body: UpsertProjectBodySchema, response: { 201: ProjectDtoSchema } }, preHandler: catalogs }, async (request, reply) =>
    reply.status(201).send(await application.admin.upsertProject(requirePrincipal(request), request.body)),
  )
  app.patch('/api/v1/admin/projects/:id', { schema: { tags, params: IdParams, body: UpsertProjectBodySchema, response: { 200: ProjectDtoSchema } }, preHandler: catalogs }, async (request) =>
    application.admin.upsertProject(requirePrincipal(request), request.body, request.params.id),
  )

  app.get('/api/v1/admin/settings', { schema: { tags, response: { 200: PlatformSettingsDtoSchema } }, preHandler: config }, async (request) =>
    application.admin.getPlatformSettings(requirePrincipal(request)),
  )
  app.put('/api/v1/admin/settings', { schema: { tags, body: UpdatePlatformSettingsBodySchema, response: { 200: PlatformSettingsDtoSchema } }, preHandler: config }, async (request) =>
    application.admin.updatePlatformSettings(requirePrincipal(request), request.body),
  )

  app.get(
    '/api/v1/admin/audit',
    { schema: { tags, querystring: AuditQuerySchema, response: { 200: pageSchema(AuditEntryDtoSchema) } }, preHandler: requirePermission(Permission.AUDIT_READ) },
    async (request) => application.admin.listAuditEntries(requirePrincipal(request), request.query),
  )

  app.get('/api/v1/admin/jobs', { schema: { tags, response: { 200: JobQueueStatsSchema } }, preHandler: requirePermission(Permission.INTEGRATION_MANAGE) }, async () => {
    const queues = deps.jobStats ? await deps.jobStats() : []
    return { queues: queues.map((q) => ({ name: q.name, created: q.created, active: q.active, completed: q.completed, failed: q.failed })) }
  })
}
