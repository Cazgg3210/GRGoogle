import type { AppContext } from '../../context.js'
import { audit } from '../../shared.js'

/**
 * Retención (§15, ADR-009): elimina texto bruto de transcripciones con
 * `retainedUntil < now`. Nunca toca datos derivados (resúmenes, decisiones,
 * action items, evidencia).
 */
export async function cleanupExpiredRawData(ctx: AppContext): Promise<{ deleted: number }> {
  const settings = await ctx.getSettings()
  if (settings.rawTranscriptRetentionDays === null) {
    ctx.logger.info('Retención de transcripciones sin límite; no se elimina nada')
    return { deleted: 0 }
  }
  const now = ctx.clock.now()
  const deleted = await ctx.uow.run(async (repos) => {
    const n = await repos.transcripts.deleteRawOlderThan(now)
    if (n > 0) {
      await audit(repos, ctx, {
        actorType: 'SYSTEM',
        action: 'transcripts.raw_purged',
        entity: 'Transcript',
        entityId: 'batch',
        after: { deleted: n, before: now },
      })
    }
    return n
  })
  ctx.logger.info({ deleted }, 'Limpieza de transcripciones expiradas')
  return { deleted }
}
