import {
  AiReviewApproveBodySchema,
  AiReviewItemDtoSchema,
  AiReviewListQuerySchema,
  AiReviewMergeBodySchema,
  AiReviewRejectBodySchema,
  pageSchema,
} from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import { requirePermission, requirePrincipal } from '../plugins/auth.js'
import { IdParams, type RouteDeps } from './common.js'

export function registerAiReviewRoutes(app: AppServer, deps: RouteDeps): void {
  const { application } = deps
  const tags = ['revisión IA']
  const resolve = requirePermission(Permission.AI_REVIEW_RESOLVE)

  app.get(
    '/api/v1/ai-review',
    {
      schema: {
        tags,
        querystring: AiReviewListQuerySchema,
        response: { 200: pageSchema(AiReviewItemDtoSchema) },
      },
      preHandler: resolve,
    },
    async (request) => application.aiReview.list(requirePrincipal(request), request.query),
  )

  app.post(
    '/api/v1/ai-review/:id/approve',
    {
      schema: {
        tags,
        params: IdParams,
        body: AiReviewApproveBodySchema.optional(),
        response: { 200: AiReviewItemDtoSchema },
      },
      preHandler: resolve,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.aiReview.approve(principal, request.params.id, request.body ?? {})
      return application.aiReview.get(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/ai-review/:id/reject',
    {
      schema: {
        tags,
        params: IdParams,
        body: AiReviewRejectBodySchema.optional(),
        response: { 200: AiReviewItemDtoSchema },
      },
      preHandler: resolve,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.aiReview.reject(principal, request.params.id, request.body ?? {})
      return application.aiReview.get(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/ai-review/:id/merge',
    {
      schema: {
        tags,
        params: IdParams,
        body: AiReviewMergeBodySchema,
        response: { 200: AiReviewItemDtoSchema },
      },
      preHandler: resolve,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.aiReview.merge(principal, request.params.id, request.body)
      return application.aiReview.get(principal, request.params.id)
    },
  )
}
