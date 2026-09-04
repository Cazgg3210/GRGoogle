import { google, type gmail_v1 } from 'googleapis'
import type { MailMessage, MailPort } from '@smlxl/domain'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import { GOOGLE_SCOPES } from '../scopes.js'
import { withGoogleRetry } from '../http/retry.js'
import type { AuthClient, GoogleAdapterDeps } from './shared.js'

/**
 * Gmail API (§17): envío desde el buzón remitente corporativo impersonado.
 * Idempotencia: el adapter consulta/marca `idempotencyKey` en un registro
 * inyectado (`NotificationLog`), nunca reenvía la misma clave.
 */
export interface GmailApiClient {
  users: {
    messages: {
      send(
        params: gmail_v1.Params$Resource$Users$Messages$Send,
        options?: { signal?: AbortSignal },
      ): Promise<{ data: gmail_v1.Schema$Message }>
    }
  }
}

/** Registro de envíos para idempotencia (implementado por la capa de persistencia). */
export interface NotificationLog {
  hasSent(idempotencyKey: string): Promise<string | null>
  markSent(idempotencyKey: string, messageId: string): Promise<void>
}

/** Implementación en memoria (dev/tests). */
export class InMemoryNotificationLog implements NotificationLog {
  readonly sent = new Map<string, string>()
  async hasSent(key: string): Promise<string | null> {
    return this.sent.get(key) ?? null
  }
  async markSent(key: string, messageId: string): Promise<void> {
    this.sent.set(key, messageId)
  }
}

const SCOPES = [GOOGLE_SCOPES.gmail.SEND]

export function base64Url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 2047 (UTF-8, base64) para cabeceras con acentos. */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function wrap76(b64: string): string {
  return b64.replace(/(.{76})/g, '$1\r\n')
}

function sanitizeAddress(addr: string): string {
  return addr.replace(/[\r\n]/g, '').trim()
}

/** Construye el mensaje MIME (RFC 2822, multipart/alternative) y lo devuelve en base64url. */
export function buildMimeMessage(
  message: MailMessage,
  from: string,
  boundary = `smlxl-${Date.now().toString(36)}`,
): {
  raw: string
  mime: string
} {
  const headers: string[] = [
    `From: ${sanitizeAddress(from)}`,
    `To: ${message.to.map(sanitizeAddress).join(', ')}`,
  ]
  if (message.cc && message.cc.length > 0)
    headers.push(`Cc: ${message.cc.map(sanitizeAddress).join(', ')}`)
  if (message.replyTo) headers.push(`Reply-To: ${sanitizeAddress(message.replyTo)}`)
  headers.push(`Subject: ${encodeHeader(message.subject.replace(/[\r\n]/g, ' '))}`)
  headers.push('MIME-Version: 1.0')
  headers.push(`X-SMLXL-Idempotency-Key: ${message.idempotencyKey.replace(/[\r\n]/g, '')}`)
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(message.text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(message.html, 'utf8').toString('base64')),
    `--${boundary}--`,
    '',
  ]
  const mime = `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`
  return { raw: base64Url(mime), mime }
}

export interface GmailAdapterDeps extends GoogleAdapterDeps {
  senderEmail: string
  notificationLog: NotificationLog
  clientFactory?: (auth: AuthClient) => GmailApiClient
}

export class GmailAdapter implements MailPort {
  private readonly clientFactory: (auth: AuthClient) => GmailApiClient

  constructor(private readonly deps: GmailAdapterDeps) {
    this.clientFactory =
      deps.clientFactory ??
      ((auth) => google.gmail({ version: 'v1', auth }) as unknown as GmailApiClient)
    if (!deps.senderEmail) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_ERROR,
        'GmailAdapter requiere GMAIL_SENDER_EMAIL',
      )
    }
  }

  async send(message: MailMessage): Promise<{ messageId: string; skipped: boolean }> {
    if (message.to.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_ERROR, 'El mensaje no tiene destinatarios')
    }
    const already = await this.deps.notificationLog.hasSent(message.idempotencyKey)
    if (already) return { messageId: already, skipped: true }
    const { raw } = buildMimeMessage(message, this.deps.senderEmail)
    const client = this.clientFactory(this.deps.auth.for(this.deps.senderEmail, SCOPES))
    try {
      const res = await withGoogleRetry(
        (signal) => client.users.messages.send({ userId: 'me', requestBody: { raw } }, { signal }),
        { ...this.deps.retry, operation: 'gmail.messages.send' },
      )
      const messageId = res.data.id ?? `unknown-${Date.now()}`
      await this.deps.notificationLog.markSent(message.idempotencyKey, messageId)
      metrics.increment(MetricNames.EMAIL_SENT)
      return { messageId, skipped: false }
    } catch (err) {
      const cause = err instanceof DomainError ? err : undefined
      throw new DomainError(
        DomainErrorCode.EMAIL_SEND_FAILED,
        `No se pudo enviar el correo: ${cause?.message ?? 'error'}`,
        {
          retryable: cause?.retryable ?? false,
          details: { idempotencyKey: message.idempotencyKey, googleCode: cause?.code ?? null },
          cause: err,
        },
      )
    }
  }
}
