import { describe, expect, it } from 'vitest'
import type { gmail_v1 } from 'googleapis'
import { ImpersonatedAuthFactory } from '../auth/dwd.js'
import {
  GmailAdapter,
  InMemoryNotificationLog,
  buildMimeMessage,
  encodeHeader,
  type GmailApiClient,
} from './gmail.js'

const auth = new ImpersonatedAuthFactory({
  credentials: {
    client_email: 'sa@proj.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
  },
  allowedDomain: 'smlxl.mx',
})

const message = {
  to: ['lucia@smlxl.mx'],
  cc: ['andres@smlxl.mx'],
  subject: 'Resumen semanal — Compromisos',
  html: '<p>Hola <b>Lucía</b></p>',
  text: 'Hola Lucía',
  idempotencyKey: 'digest:1:v1',
}

describe('buildMimeMessage', () => {
  it('construye multipart/alternative con cabeceras codificadas y base64url', () => {
    const { raw, mime } = buildMimeMessage(message, 'seguimiento@smlxl.mx', 'b0')
    expect(mime).toContain('From: seguimiento@smlxl.mx')
    expect(mime).toContain('To: lucia@smlxl.mx')
    expect(mime).toContain('Cc: andres@smlxl.mx')
    expect(mime).toContain(`Subject: ${encodeHeader(message.subject)}`)
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="b0"')
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"')
    expect(mime).toContain('X-SMLXL-Idempotency-Key: digest:1:v1')
    expect(raw).not.toMatch(/[+/=]/)
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    )
    expect(decoded).toBe(mime)
  })

  it('codifica asuntos con acentos en RFC 2047', () => {
    expect(encodeHeader('Hola')).toBe('Hola')
    expect(encodeHeader('Revisión')).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
  })
})

describe('GmailAdapter', () => {
  function client(sent: gmail_v1.Schema$Message[]): GmailApiClient {
    return {
      users: {
        messages: {
          send: async (params) => {
            sent.push(params.requestBody ?? {})
            return { data: { id: `m${sent.length}` } }
          },
        },
      },
    }
  }

  it('envía impersonando al remitente y respeta la idempotencia', async () => {
    const sent: gmail_v1.Schema$Message[] = []
    const log = new InMemoryNotificationLog()
    const adapter = new GmailAdapter({
      auth,
      senderEmail: 'seguimiento@smlxl.mx',
      notificationLog: log,
      clientFactory: () => client(sent),
    })
    const first = await adapter.send(message)
    expect(first).toEqual({ messageId: 'm1', skipped: false })
    const second = await adapter.send(message)
    expect(second).toEqual({ messageId: 'm1', skipped: true })
    expect(sent).toHaveLength(1)
    expect(typeof sent[0]?.raw).toBe('string')
  })

  it('mapea fallos a EMAIL_SEND_FAILED', async () => {
    const failing: GmailApiClient = {
      users: {
        messages: {
          send: async () => {
            const e = new Error('boom') as Error & { response: { status: number } }
            e.response = { status: 500 }
            throw e
          },
        },
      },
    }
    const adapter = new GmailAdapter({
      auth,
      senderEmail: 'seguimiento@smlxl.mx',
      notificationLog: new InMemoryNotificationLog(),
      clientFactory: () => failing,
      retry: { retries: 0 },
    })
    await expect(adapter.send(message)).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      retryable: true,
    })
  })
})
