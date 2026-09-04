import { z } from 'zod'
import {
  ErrorResponseSchema,
  GoogleStatusDtoSchema,
  IdSchema,
  SheetsSyncResultSchema,
} from '@smlxl/contracts'
import { JobNames, googleMode } from '@smlxl/config'
import { enqueueJob } from '@smlxl/application'
import { DomainErrorCode, Permission } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import { requirePermission, requirePrincipal } from '../plugins/auth.js'
import type { RouteDeps } from './common.js'

const SheetsSyncBody = z.object({ dryRun: z.boolean().optional() }).optional()
const SimulateBody = z.object({ meetingId: IdSchema.optional() }).optional()

export function registerIntegrationRoutes(app: AppServer, deps: RouteDeps): void {
  const { application, ctx, env } = deps
  const tags = ['integraciones']
  const manage = requirePermission(Permission.INTEGRATION_MANAGE)

  app.get(
    '/api/v1/integrations/google/status',
    { schema: { tags, response: { 200: GoogleStatusDtoSchema } }, preHandler: manage },
    async (request) => application.google.getGoogleStatus(requirePrincipal(request)),
  )

  app.post(
    '/api/v1/integrations/google/subscriptions/sync',
    { schema: { tags, response: { 200: GoogleStatusDtoSchema } }, preHandler: manage },
    async (request) => {
      const principal = requirePrincipal(request)
      const result = await application.google.ensureWorkspaceSubscriptions()
      request.log.info({ ...result, userId: principal.id }, 'suscripciones Workspace sincronizadas')
      return application.google.getGoogleStatus(principal)
    },
  )

  app.post(
    '/api/v1/integrations/google/calendar/sync',
    {
      schema: { tags, response: { 200: z.object({ queued: z.literal(true) }) } },
      preHandler: manage,
    },
    async (request) => {
      await enqueueJob(
        ctx,
        JobNames.CALENDAR_INCREMENTAL_SYNC,
        {},
        { singletonKey: 'calendar-sync:manual', correlationId: request.id },
      )
      return { queued: true as const }
    },
  )

  app.post(
    '/api/v1/integrations/google/sheets/sync',
    {
      schema: { tags, body: SheetsSyncBody, response: { 200: SheetsSyncResultSchema } },
      preHandler: requirePermission(Permission.SHEETS_SYNC),
    },
    async (request) =>
      application.sheets.syncTasksToGoogleSheets(requirePrincipal(request), {
        dryRun: request.body?.dryRun ?? false,
      }),
  )

  app.post(
    '/api/v1/integrations/simulate/meeting-ended',
    {
      schema: {
        tags,
        body: SimulateBody,
        response: {
          200: z.object({ queued: z.literal(true), meetingId: z.string() }),
          409: ErrorResponseSchema,
        },
      },
      preHandler: manage,
    },
    async (request, reply) => {
      if (googleMode(env) !== 'FAKE') {
        return reply.status(409).send({
          code: DomainErrorCode.FEATURE_DISABLED,
          message: 'La simulación sólo está disponible en modo FAKE de Google',
          details: { mode: 'REAL' },
          correlationId: request.id,
        })
      }
      const result = await application.google.simulateMeetingEnded(
        requirePrincipal(request),
        request.body?.meetingId ? { meetingId: request.body.meetingId } : {},
      )
      return reply.status(200).send({ queued: true as const, meetingId: result.meetingId })
    },
  )
}
