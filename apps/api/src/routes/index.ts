import type { AppServer } from '../server.js'
import { registerHealthRoutes } from './health.js'
import { registerSessionRoutes } from './session.js'
import { registerDashboardRoutes } from './dashboard.js'
import { registerMeetingRoutes } from './meetings.js'
import { registerActionItemRoutes } from './action-items.js'
import { registerAiReviewRoutes } from './ai-review.js'
import { registerReportRoutes } from './reports.js'
import { registerTeamRoutes } from './team.js'
import { registerIntegrationRoutes } from './integrations.js'
import { registerWebhookRoutes } from './webhooks.js'
import { registerAdminRoutes } from './admin.js'
import type { RouteDeps } from './common.js'

export type { RouteDeps } from './common.js'

/** Registra todos los endpoints de docs/api/endpoints.md sobre un servidor ya construido. */
export function registerRoutes(app: AppServer, deps: RouteDeps): void {
  registerHealthRoutes(app, { checkDatabase: deps.checkDatabase, version: deps.version })
  registerSessionRoutes(app, deps)
  registerDashboardRoutes(app, deps)
  registerMeetingRoutes(app, deps)
  registerActionItemRoutes(app, deps)
  registerAiReviewRoutes(app, deps)
  registerReportRoutes(app, deps)
  registerTeamRoutes(app, deps)
  registerIntegrationRoutes(app, deps)
  registerWebhookRoutes(app, deps)
  registerAdminRoutes(app, deps)
}
