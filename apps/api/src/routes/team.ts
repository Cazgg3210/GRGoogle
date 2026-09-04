import { z } from 'zod'
import { AreaDtoSchema, ExternalAssigneeDtoSchema, ProjectDtoSchema, UserDtoSchema } from '@smlxl/contracts'
import type { AppServer } from '../server.js'
import { authenticated, type RouteDeps } from './common.js'

/** Catálogos para selectores: cualquier usuario autenticado. */
export function registerTeamRoutes(app: AppServer, deps: RouteDeps): void {
  const { application } = deps
  const tags = ['equipo']

  app.get('/api/v1/team/users', { schema: { tags, response: { 200: z.array(UserDtoSchema) } }, preHandler: authenticated }, async () => application.admin.listUsers())
  app.get('/api/v1/team/areas', { schema: { tags, response: { 200: z.array(AreaDtoSchema) } }, preHandler: authenticated }, async () => application.admin.listAreas(true))
  app.get('/api/v1/team/projects', { schema: { tags, response: { 200: z.array(ProjectDtoSchema) } }, preHandler: authenticated }, async () => application.admin.listProjects(true))
  app.get(
    '/api/v1/team/external-assignees',
    { schema: { tags, response: { 200: z.array(ExternalAssigneeDtoSchema) } }, preHandler: authenticated },
    async () => application.admin.listExternalAssignees(true),
  )
}
