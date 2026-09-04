import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { PubSubPushEnvelopeSchema, WorkspaceCloudEventSchema, type ErrorResponseDto, type PubSubPushEnvelope, type WorkspaceCloudEvent } from '@smlxl/contracts'
import { DomainError, DomainErrorCode, isDomainError } from '@smlxl/domain'
import type { AppServer } from '../server.js'
import type { RouteDeps } from './common.js'

const TokenQuery = z.object({ token: z.string().optional() })

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!expected || !provided) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

function decodeData(data: string | undefined): unknown {
  if (!data) return undefined
  try {
    const text = Buffer.from(data, 'base64').toString('utf8').trim()
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

/**
 * Convierte el envelope de Pub/Sub en un CloudEvent (§13). Soporta binary
 * content mode (atributos `ce-*` + data) y structured mode (CloudEvent completo
 * en `message.data`). Devuelve null si no es interpretable.
 */
export function cloudEventFromPubSub(envelope: PubSubPushEnvelope): WorkspaceCloudEvent | null {
  const attrs = envelope.message.attributes ?? {}
  const data = decodeData(envelope.message.data)
  const candidate: unknown =
    attrs['ce-type'] && attrs['ce-source']
      ? {
          id: attrs['ce-id'] ?? envelope.message.messageId,
          type: attrs['ce-type'],
          source: attrs['ce-source'],
          subject: attrs['ce-subject'],
          time: attrs['ce-time'] ?? envelope.message.publishTime ?? envelope.message.publish_time,
          specversion: attrs['ce-specversion'],
          datacontenttype: attrs['ce-datacontenttype'],
          data,
        }
      : data
  const parsed = WorkspaceCloudEventSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

/**
 * POST /webhooks/google/pubsub: autenticado por `?token=` (§13.4). Siempre 204
 * cuando el evento se registró (incluidos duplicados y fallos no reintentables);
 * 500 sólo ante errores transitorios para que Pub/Sub reintente la entrega.
 */
export function registerWebhookRoutes(app: AppServer, deps: RouteDeps): void {
  app.post(
    '/api/v1/webhooks/google/pubsub',
    { schema: { tags: ['webhooks'], security: [], querystring: TokenQuery, body: PubSubPushEnvelopeSchema } },
    async (request, reply) => {
      if (!tokenMatches(request.query.token, deps.env.GOOGLE_PUBSUB_PUSH_TOKEN)) {
        throw new DomainError(DomainErrorCode.UNAUTHORIZED, 'Token de push inválido')
      }
      const event = cloudEventFromPubSub(request.body)
      if (!event) {
        request.log.warn({ messageId: request.body.message.messageId }, 'mensaje Pub/Sub sin CloudEvent interpretable; se descarta')
        return reply.status(204).send()
      }
      try {
        const result = await deps.application.google.processInboundGoogleEvent(event, { correlationId: request.id })
        request.log.info({ googleEventId: event.id, type: event.type, duplicate: result.duplicate, status: result.status, meetingId: result.meetingId }, 'evento Google recibido')
        return reply.status(204).send()
      } catch (err) {
        if (isDomainError(err) && !err.retryable) {
          request.log.warn({ googleEventId: event.id, errorCode: err.code }, 'evento Google falló de forma no reintentable; se confirma la entrega')
          return reply.status(204).send()
        }
        request.log.error({ err, googleEventId: event.id }, 'evento Google falló; se solicita reintento a Pub/Sub')
        const body: ErrorResponseDto = { code: isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR, message: 'Error transitorio procesando el evento', correlationId: request.id }
        return reply.status(500).send(body)
      }
    },
  )
}
