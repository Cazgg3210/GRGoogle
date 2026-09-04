import { z } from 'zod'
import {
  GenerateDigestBodySchema,
  UpdateWeeklyDigestConfigBodySchema,
  WeeklyDigestConfigDtoSchema,
  WeeklyDigestDtoSchema,
} from '@smlxl/contracts'
import { toDigestDto } from '@smlxl/application'
import { Permission } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import { requireAnyPermission, requirePermission, requirePrincipal } from '../plugins/auth.js'
import { IdParams, type RouteDeps } from './common.js'

const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(52).default(12) })

export function registerReportRoutes(app: AppServer, deps: RouteDeps): void {
  const { application, ctx } = deps
  const tags = ['reportes']

  app.get(
    '/api/v1/reports/weekly',
    {
      schema: { tags, querystring: ListQuery, response: { 200: z.array(WeeklyDigestDtoSchema) } },
      preHandler: requireAnyPermission(Permission.REPORT_GLOBAL, Permission.REPORT_AREA),
    },
    async (request) =>
      application.reports.listDigests(requirePrincipal(request), request.query.limit),
  )

  app.get(
    '/api/v1/reports/weekly/config',
    {
      schema: { tags, response: { 200: WeeklyDigestConfigDtoSchema } },
      preHandler: requireAnyPermission(Permission.CONFIG_MANAGE, Permission.DIGEST_GENERATE),
    },
    async (request) => application.reports.getDigestConfig(requirePrincipal(request)),
  )

  app.put(
    '/api/v1/reports/weekly/config',
    {
      schema: {
        tags,
        body: UpdateWeeklyDigestConfigBodySchema,
        response: { 200: WeeklyDigestConfigDtoSchema },
      },
      preHandler: requirePermission(Permission.CONFIG_MANAGE),
    },
    async (request) =>
      application.reports.updateDigestConfig(requirePrincipal(request), request.body),
  )

  app.post(
    '/api/v1/reports/weekly/generate',
    {
      schema: {
        tags,
        body: GenerateDigestBodySchema.optional(),
        response: { 201: WeeklyDigestDtoSchema },
      },
      preHandler: requirePermission(Permission.DIGEST_GENERATE),
    },
    async (request, reply) => {
      const digest = await application.reports.generateWeeklyDigest(
        requirePrincipal(request),
        request.body ?? {},
      )
      const settings = await ctx.getSettings()
      return reply.status(201).send(toDigestDto(digest, settings.companyTimezone, true))
    },
  )

  app.get(
    '/api/v1/reports/weekly/:id',
    {
      schema: { tags, params: IdParams, response: { 200: WeeklyDigestDtoSchema } },
      preHandler: requirePermission(Permission.REPORT_GLOBAL),
    },
    async (request) => application.reports.getDigest(requirePrincipal(request), request.params.id),
  )

  app.post(
    '/api/v1/reports/weekly/:id/send',
    {
      schema: { tags, params: IdParams, response: { 200: WeeklyDigestDtoSchema } },
      preHandler: requirePermission(Permission.DIGEST_SEND),
    },
    async (request) => {
      const digest = await application.reports.sendWeeklyDigest(
        requirePrincipal(request),
        request.params.id,
      )
      const settings = await ctx.getSettings()
      return toDigestDto(digest, settings.companyTimezone, true)
    },
  )
}
