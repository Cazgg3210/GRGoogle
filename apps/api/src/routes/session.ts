import { NotificationCountsSchema, SessionDtoSchema } from '@smlxl/contracts'
import type { AppServer } from '../server.js'
import { requirePrincipal } from '../plugins/auth.js'
import type { RouteDeps } from './common.js'

/** GET /session y GET /notifications/counts: sólo requieren autenticación. */
export function registerSessionRoutes(app: AppServer, deps: RouteDeps): void {
  app.get('/api/v1/session', { schema: { tags: ['sesión'], response: { 200: SessionDtoSchema } } }, async (request) => {
    return deps.application.session.get(requirePrincipal(request))
  })

  app.get('/api/v1/notifications/counts', { schema: { tags: ['sesión'], response: { 200: NotificationCountsSchema } } }, async (request) => {
    return deps.application.notifications.getCounts(requirePrincipal(request))
  })
}
