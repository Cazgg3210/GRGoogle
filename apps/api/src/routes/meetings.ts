import { z } from 'zod'
import {
  ActionItemDtoSchema,
  AiReviewItemDtoSchema,
  AuditEntryDtoSchema,
  ManualMeetingBodySchema,
  MeetingDetailSchema,
  MeetingListItemSchema,
  MeetingListQuerySchema,
  ReprocessResponseSchema,
  TranscriptSegmentDtoSchema,
  UpdateMeetingBodySchema,
  pageSchema,
} from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import { requireAnyPermission, requirePermission, requirePrincipal } from '../plugins/auth.js'
import { IdParams, authenticated, type RouteDeps } from './common.js'

const TranscriptResponseSchema = z.object({
  transcripts: z.array(
    z.object({
      id: z.string(),
      sourceType: z.string(),
      languageCode: z.string().nullable(),
      segments: z.array(TranscriptSegmentDtoSchema),
    }),
  ),
})

export function registerMeetingRoutes(app: AppServer, deps: RouteDeps): void {
  const { application } = deps
  const tags = ['reuniones']

  app.get(
    '/api/v1/meetings',
    { schema: { tags, querystring: MeetingListQuerySchema, response: { 200: pageSchema(MeetingListItemSchema) } }, preHandler: requirePermission(Permission.MEETING_READ) },
    async (request) => application.meetings.listMeetings(requirePrincipal(request), request.query),
  )

  app.post(
    '/api/v1/meetings/manual',
    { schema: { tags, body: ManualMeetingBodySchema, response: { 201: MeetingDetailSchema } }, preHandler: requirePermission(Permission.ACTION_ITEM_CREATE) },
    async (request, reply) => {
      const principal = requirePrincipal(request)
      const { meetingId } = await application.meetings.createManualMeeting(principal, request.body)
      return reply.status(201).send(await application.meetings.getMeetingDetail(principal, meetingId))
    },
  )

  app.get(
    '/api/v1/meetings/:id',
    { schema: { tags, params: IdParams, response: { 200: MeetingDetailSchema } }, preHandler: authenticated },
    async (request) => application.meetings.getMeetingDetail(requirePrincipal(request), request.params.id),
  )

  app.patch(
    '/api/v1/meetings/:id',
    {
      schema: { tags, params: IdParams, body: UpdateMeetingBodySchema, response: { 200: MeetingDetailSchema } },
      preHandler: requireAnyPermission(Permission.MEETING_SET_CONFIDENTIALITY, Permission.MEETING_EXCLUDE),
    },
    async (request) => {
      const principal = requirePrincipal(request)
      await application.meetings.updateMeeting(principal, request.params.id, request.body)
      return application.meetings.getMeetingDetail(principal, request.params.id)
    },
  )

  app.post(
    '/api/v1/meetings/:id/reprocess',
    { schema: { tags, params: IdParams, response: { 200: ReprocessResponseSchema } }, preHandler: requirePermission(Permission.MEETING_REPROCESS) },
    async (request) => {
      const { jobId } = await application.meetings.reprocessMeeting(requirePrincipal(request), request.params.id)
      return { queued: true as const, jobId }
    },
  )

  app.get(
    '/api/v1/meetings/:id/transcript',
    { schema: { tags, params: IdParams, response: { 200: TranscriptResponseSchema } }, preHandler: requirePermission(Permission.MEETING_READ_TRANSCRIPT) },
    async (request) => application.meetings.getMeetingTranscript(requirePrincipal(request), request.params.id),
  )

  app.get(
    '/api/v1/meetings/:id/action-items',
    { schema: { tags, params: IdParams, response: { 200: z.array(ActionItemDtoSchema) } }, preHandler: authenticated },
    async (request) => application.meetings.listActionItemsByMeeting(requirePrincipal(request), request.params.id),
  )

  app.get(
    '/api/v1/meetings/:id/review-items',
    { schema: { tags, params: IdParams, response: { 200: z.array(AiReviewItemDtoSchema) } }, preHandler: authenticated },
    async (request) => application.meetings.listReviewItemsByMeeting(requirePrincipal(request), request.params.id),
  )

  app.get(
    '/api/v1/meetings/:id/audit',
    { schema: { tags, params: IdParams, response: { 200: z.array(AuditEntryDtoSchema) } }, preHandler: authenticated },
    async (request) => application.meetings.listMeetingAudit(requirePrincipal(request), request.params.id),
  )
}
