import type { WorkspaceEventsPort } from '@smlxl/domain'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import type { NowFn } from './fixtures.js'

interface FakeSubscription {
  name: string
  userEmail: string
  targetResource: string
  eventTypes: string[]
  pubsubTopic: string
  state: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
  expiresAt: Date
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Fake de Workspace Events: crea nombres `subscriptions/fake-*` con expiración +7d. */
export class FakeWorkspaceEventsAdapter implements WorkspaceEventsPort {
  readonly subscriptions = new Map<string, FakeSubscription>()
  private seq = 0
  /** Para tests: emails cuya creación debe fallar. */
  readonly failFor = new Set<string>()

  constructor(private readonly now: NowFn = () => new Date()) {}

  async createUserSubscription(input: {
    userEmail: string
    userResourceName: string
    eventTypes: string[]
    pubsubTopic: string
  }): Promise<{ subscriptionName: string; expiresAt: Date }> {
    if (this.failFor.has(input.userEmail)) {
      throw new DomainError(DomainErrorCode.GOOGLE_PERMISSION_DENIED, `Fake: no se pudo crear suscripción para ${input.userEmail}`)
    }
    this.seq += 1
    const name = `subscriptions/fake-${String(this.seq).padStart(4, '0')}`
    const expiresAt = new Date(this.now().getTime() + TTL_MS)
    this.subscriptions.set(name, {
      name,
      userEmail: input.userEmail,
      targetResource: input.userResourceName,
      eventTypes: [...input.eventTypes],
      pubsubTopic: input.pubsubTopic,
      state: 'ACTIVE',
      expiresAt,
    })
    return { subscriptionName: name, expiresAt }
  }

  async renewSubscription(subscriptionName: string, _asUser?: string): Promise<{ expiresAt: Date }> {
    const sub = this.subscriptions.get(subscriptionName)
    if (!sub || sub.state === 'DELETED') {
      throw new DomainError(DomainErrorCode.GOOGLE_NOT_FOUND, `Suscripción ${subscriptionName} no existe`)
    }
    sub.state = 'ACTIVE'
    sub.expiresAt = new Date(this.now().getTime() + TTL_MS)
    return { expiresAt: sub.expiresAt }
  }

  async deleteSubscription(subscriptionName: string, _asUser?: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionName)
    if (sub) sub.state = 'DELETED'
  }

  async getSubscription(subscriptionName: string, _asUser?: string): Promise<{ state: string; expiresAt: Date } | null> {
    const sub = this.subscriptions.get(subscriptionName)
    if (!sub || sub.state === 'DELETED') return null
    return { state: sub.state, expiresAt: sub.expiresAt }
  }
}
