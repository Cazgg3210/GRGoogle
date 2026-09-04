import { DashboardDtoSchema, PeriodQuerySchema, SearchQuerySchema, SearchResultSchema } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import { requirePermission, requirePrincipal } from '../plugins/auth.js'
import { authenticated, type RouteDeps } from './common.js'

export function registerDashboardRoutes(app: AppServer, deps: RouteDeps): void {
  app.get(
    '/api/v1/dashboard',
    { schema: { tags: ['dashboard'], querystring: PeriodQuerySchema, response: { 200: DashboardDtoSchema } }, preHandler: requirePermission(Permission.ACTION_ITEM_READ) },
    async (request) => deps.application.reports.getDashboard(requirePrincipal(request), request.query),
  )

  app.get(
    '/api/v1/search',
    { schema: { tags: ['búsqueda'], querystring: SearchQuerySchema, response: { 200: SearchResultSchema } }, preHandler: authenticated },
    async (request) => deps.application.reports.searchKnowledge(requirePrincipal(request), request.query.q, request.query.limit),
  )
}
