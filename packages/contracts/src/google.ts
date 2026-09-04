import { z } from 'zod'

/** Envelope de push de Google Cloud Pub/Sub (§13). */
export const PubSubPushEnvelopeSchema = z.object({
  message: z.object({
    data: z.string().optional(),
    messageId: z.string(),
    message_id: z.string().optional(),
    publishTime: z.string().optional(),
    publish_time: z.string().optional(),
    attributes: z.record(z.string()).optional(),
  }),
  subscription: z.string(),
})

/** CloudEvent (atributos) que Google Workspace Events entrega vía Pub/Sub. */
export const WorkspaceCloudEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  subject: z.string().optional(),
  time: z.string().optional(),
  specversion: z.string().optional(),
  datacontenttype: z.string().optional(),
  data: z.unknown().optional(),
})

export type PubSubPushEnvelope = z.infer<typeof PubSubPushEnvelopeSchema>
export type WorkspaceCloudEvent = z.infer<typeof WorkspaceCloudEventSchema>

/** Payload mínimo del data de eventos Meet (sin resource data embebido, §13.2). */
export const MeetEventDataSchema = z.object({
  conferenceRecord: z.object({ name: z.string() }).optional(),
  transcript: z.object({ name: z.string() }).optional(),
  smartNote: z.object({ name: z.string() }).optional(),
})
export type MeetEventData = z.infer<typeof MeetEventDataSchema>
