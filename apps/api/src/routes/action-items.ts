import { z } from 'zod'
import {
  ActionItemDetailSchema,
  ActionItemDtoSchema,
  ActionItemListQuerySchema,
  CommentBodySchema,
  CommentDtoSchema,
  CreateActionItemBodySchema,
  IdSchema,
  ProposeCompletionBodySchema,
  ReviewProposalBodySchema,
  UpdateActionItemBodySchema,
  pageSchema,
} from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import { requirePermission, requirePrincipal } from '../plugins/auth.js'
import { IdParams, authenticated, type RouteDeps } from './common.js'

const ProposalParams = z.object({ id: IdSchema, proposalId: IdSchema })
const ReopenBodySchema = z.object({ reason: z.string().min(3).max(2000) })

export function registerActionItemRoutes(app: AppServer, deps: RouteDeps): void {
  const { application } = deps
  const tags = ['action-items']

  app.get(
    '/api/v1/action-items',
    {
      schema: {
        tags,
        querystring: ActionItemListQuerySchema,
        response: { 200: pageSchema(ActionItemDtoSchema) },
      },
      preHandler: requirePermission(Permission.ACTION_ITEM_READ),
    },
    async (request) => application.actionItems.list(requirePrincipal(request), request.query),
  )

  app.post(
    '/api/v1/action-items',
    {
      schema: { tags, body: CreateActionItemBodySchema, response: { 201: ActionItemDetailSchema } },
      preHandler: requirePermission(Permission.ACTION_ITEM_CREATE),
    },
    async (request, reply) => {
      const principal = requirePrincipal(request)
      const item = await application.actionItems.create(principal, request.body)
      return reply.status(201).send(await application.actionItems.getDetail(principal, item.id))
    },
  )

  app.get(
    '/api/v1/action-items/:id',
    {
      schema: { tags, params: IdParams, response: { 200: ActionItemDetailSchema } },
      preHandler: authenticated,
    },
    async (request) =>
      application.actionItems.getDetail(requirePrincipal(request), request.params.id),
  )

  app.patch(
    '/api/v1/action-items/:id',
    {
      schema: {
        tags,
        params: IdParams,
        body: UpdateActionItemBodySchema,
        response: { 200: ActionItemDetailSchema },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.actionItems.update(principal, request.params.id, request.body)
      return application.actionItems.getDetail(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/action-items/:id/complete',
    {
      schema: {
        tags,
        params: IdParams,
        body: ProposeCompletionBodySchema,
        response: { 200: ActionItemDetailSchema },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.actionItems.proposeCompletion(
        principal,
        request.params.id,
        request.body.reason,
      )
      return application.actionItems.getDetail(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/action-items/:id/proposals/:proposalId/approve',
    {
      schema: {
        tags,
        params: ProposalParams,
        body: ReviewProposalBodySchema.optional(),
        response: { 200: ActionItemDetailSchema },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.actionItems.approveCompletion(
        principal,
        request.params.id,
        request.params.proposalId,
        request.body ?? {},
      )
      return application.actionItems.getDetail(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/action-items/:id/proposals/:proposalId/reject',
    {
      schema: {
        tags,
        params: ProposalParams,
        body: ReviewProposalBodySchema.optional(),
        response: { 200: ActionItemDetailSchema },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.actionItems.rejectCompletion(
        principal,
        request.params.id,
        request.params.proposalId,
        request.body ?? {},
      )
      return application.actionItems.getDetail(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/action-items/:id/reopen',
    {
      schema: {
        tags,
        params: IdParams,
        body: ReopenBodySchema,
        response: { 200: ActionItemDetailSchema },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.actionItems.reopen(principal, request.params.id, request.body.reason)
      return application.actionItems.getDetail(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/action-items/:id/comments',
    {
      schema: {
        tags,
        params: IdParams,
        body: CommentBodySchema,
        response: { 201: CommentDtoSchema },
      },
      preHandler: authenticated,
    },
    async (request, reply) => {
      const principal = requirePrincipal(request)
      const comment = await application.actionItems.addComment(
        principal,
        request.params.id,
        request.body.body,
      )
      const full = await application.actionItems.getDetail(principal, request.params.id)
      const dto = full.comments.find((c) => c.id === comment.id) ?? {
        id: comment.id,
        authorUserId: comment.authorUserId,
        authorName: null,
        body: comment.body,
        source: comment.source,
        createdAt: comment.createdAt.toISOString(),
      }
      return reply.status(201).send(dto)
    },
  )
}
