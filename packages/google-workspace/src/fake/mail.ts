import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MailMessage, MailPort } from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'

export interface FakeSentMail extends MailMessage {
  messageId: string
  sentAt: Date
}

/**
 * Fake de Gmail: guarda los mensajes en `sent[]` (idempotente por clave).
 * Si `FAKE_MAIL_OUT_DIR` está definido, escribe el HTML en esa carpeta para
 * previsualización manual.
 */
export class FakeMailAdapter implements MailPort {
  readonly sent: FakeSentMail[] = []
  private readonly byKey = new Map<string, string>()
  private seq = 0

  constructor(private readonly options: { outDir?: string | null; now?: () => Date } = {}) {}

  async send(message: MailMessage): Promise<{ messageId: string; skipped: boolean }> {
    const existing = this.byKey.get(message.idempotencyKey)
    if (existing) return { messageId: existing, skipped: true }
    this.seq += 1
    const messageId = `fake-mail-${String(this.seq).padStart(5, '0')}`
    this.byKey.set(message.idempotencyKey, messageId)
    this.sent.push({ ...message, messageId, sentAt: (this.options.now ?? (() => new Date()))() })
    metrics.increment(MetricNames.EMAIL_SENT)
    const outDir = this.options.outDir ?? process.env['FAKE_MAIL_OUT_DIR'] ?? null
    if (outDir) {
      try {
        mkdirSync(outDir, { recursive: true })
        const safe = message.idempotencyKey.replace(/[^a-zA-Z0-9_.-]/g, '_')
        writeFileSync(join(outDir, `${safe}.html`), message.html, 'utf8')
      } catch {
        // La escritura es sólo de conveniencia para desarrollo.
      }
    }
    return { messageId, skipped: false }
  }

  clear(): void {
    this.sent.length = 0
    this.byKey.clear()
  }
}
