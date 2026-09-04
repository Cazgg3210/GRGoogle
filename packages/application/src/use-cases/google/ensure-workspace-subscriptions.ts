import { googleMode } from '@smlxl/config'
import { ALL_GOOGLE_MEET_EVENT_TYPES, DomainError, DomainErrorCode, SubscriptionState, isDomainError, type GoogleWorkspaceSubscription } from '@smlxl/domain'
import type { AppContext } from '../../context.js'
import { audit } from '../../shared.js'

/**
 * Suscripciones Workspace Events por usuario monitoreado (§13.2): crear si
 * falta, renovar cuando `expiresAt - now < 48h`. Un fallo nunca aborta el loop.
 */
export interface EnsureSubscriptionsResult {
  users: number
  created: number
  renewed: number
  unchanged: number
  errors: Array<{ userEmail: string; code: string }>
}

const RENEW_THRESHOLD_MS = 48 * 60 * 60 * 1000

export async function ensureWorkspaceSubscriptions(ctx: AppContext): Promise<EnsureSubscriptionsResult> {
  const settings = await ctx.getSettings()
  const result: EnsureSubscriptionsResult = { users: 0, created: 0, renewed: 0, unchanged: 0, errors: [] }
  // En modo REAL la automatización debe poder deshabilitarse (§45.13); en FAKE siempre se simula.
  if (googleMode(ctx.env) === 'REAL' && !settings.featureFlags.GOOGLE_MEET_EVENTS_ENABLED) {
    ctx.logger.info('GOOGLE_MEET_EVENTS_ENABLED desactivado; no se gestionan suscripciones')
    return result
  }
  const topic = ctx.env.GOOGLE_PUBSUB_TOPIC || 'projects/fake/topics/smlxl-meet-events'
  const users = await ctx.repos.users.list({ active: true, monitored: true })
  const now = ctx.clock.now()
  for (const user of users) {
    result.users += 1
    const existing = await ctx.repos.googleSubscriptions.findByUser(user.id)
    try {
      const needsCreate =
        !existing ||
        existing.state === SubscriptionState.DELETED ||
        existing.state === SubscriptionState.EXPIRED ||
        existing.state === SubscriptionState.ERROR ||
        existing.expiresAt.getTime() <= now.getTime()
      if (needsCreate) {
        const resourceName = await ctx.directory.resolveUserResourceName(user.email)
        if (!resourceName) {
          throw new DomainError(DomainErrorCode.GOOGLE_NOT_FOUND, `Usuario ${user.email} no encontrado en Directory`)
        }
        const created = await ctx.workspaceEvents.createUserSubscription({
          userEmail: user.email,
          userResourceName: resourceName,
          eventTypes: [...ALL_GOOGLE_MEET_EVENT_TYPES],
          pubsubTopic: topic,
        })
        const sub: GoogleWorkspaceSubscription = {
          id: existing?.id ?? ctx.ids.next(),
          monitoredUserId: user.id,
          monitoredUserEmail: user.email,
          googleSubscriptionName: created.subscriptionName,
          targetResource: resourceName,
          eventTypes: [...ALL_GOOGLE_MEET_EVENT_TYPES],
          expiresAt: created.expiresAt,
          state: SubscriptionState.ACTIVE,
          lastRenewedAt: now,
          lastErrorCode: null,
          lastErrorAt: null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        await ctx.uow.run(async (repos) => {
          await repos.googleSubscriptions.save(sub)
          await audit(repos, ctx, { actorType: 'SYSTEM', action: 'google.subscription.created', entity: 'GoogleWorkspaceSubscription', entityId: sub.id, after: { name: sub.googleSubscriptionName, expiresAt: sub.expiresAt } })
        })
        result.created += 1
        continue
      }
      if (existing.expiresAt.getTime() - now.getTime() < RENEW_THRESHOLD_MS) {
        const renewed = await ctx.workspaceEvents.renewSubscription(existing.googleSubscriptionName, user.email)
        await ctx.uow.run(async (repos) => {
          await repos.googleSubscriptions.save({ ...existing, expiresAt: renewed.expiresAt, state: SubscriptionState.ACTIVE, lastRenewedAt: now, lastErrorCode: null, lastErrorAt: null, updatedAt: now })
          await audit(repos, ctx, { actorType: 'SYSTEM', action: 'google.subscription.renewed', entity: 'GoogleWorkspaceSubscription', entityId: existing.id, before: { expiresAt: existing.expiresAt }, after: { expiresAt: renewed.expiresAt } })
        })
        result.renewed += 1
        continue
      }
      result.unchanged += 1
    } catch (err) {
      const code = isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR
      ctx.logger.error({ userId: user.id, errorCode: code }, 'Error gestionando suscripción de Workspace Events')
      result.errors.push({ userEmail: user.email, code })
      if (existing) {
        await ctx.repos.googleSubscriptions.save({ ...existing, state: SubscriptionState.ERROR, lastErrorCode: code, lastErrorAt: now, updatedAt: now })
      } else {
        await ctx.repos.googleSubscriptions.save({
          id: ctx.ids.next(),
          monitoredUserId: user.id,
          monitoredUserEmail: user.email,
          googleSubscriptionName: '',
          targetResource: '',
          eventTypes: [...ALL_GOOGLE_MEET_EVENT_TYPES],
          expiresAt: now,
          state: SubscriptionState.ERROR,
          lastRenewedAt: null,
          lastErrorCode: code,
          lastErrorAt: now,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  }
  return result
}
