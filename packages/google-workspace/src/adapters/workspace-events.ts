import { google, type workspaceevents_v1 } from 'googleapis'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import type { WorkspaceEventsPort } from '@smlxl/domain'
import { GOOGLE_SCOPES } from '../scopes.js'
import { withGoogleRetry } from '../http/retry.js'
import { protoDuration, toDate, type AuthClient, type GoogleAdapterDeps } from './shared.js'

/**
 * Google Workspace Events API v1 (§13.2): una suscripción por usuario monitoreado,
 * target `//cloudidentity.googleapis.com/users/{id}`, payload sin resource data,
 * TTL máximo (7 días documentados). Renovación vía `patch` con updateMask=ttl.
 */
export interface WorkspaceEventsApiClient {
  subscriptions: {
    create(
      params: workspaceevents_v1.Params$Resource$Subscriptions$Create,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: workspaceevents_v1.Schema$Operation }>
    patch(
      params: workspaceevents_v1.Params$Resource$Subscriptions$Patch,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: workspaceevents_v1.Schema$Operation }>
    delete(
      params: workspaceevents_v1.Params$Resource$Subscriptions$Delete,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: workspaceevents_v1.Schema$Operation }>
    get(
      params: workspaceevents_v1.Params$Resource$Subscriptions$Get,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: workspaceevents_v1.Schema$Subscription }>
    reactivate(
      params: workspaceevents_v1.Params$Resource$Subscriptions$Reactivate,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: workspaceevents_v1.Schema$Operation }>
  }
  operations: {
    get(
      params: workspaceevents_v1.Params$Resource$Operations$Get,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: workspaceevents_v1.Schema$Operation }>
  }
}

/** TTL máximo documentado para suscripciones sin resource data: 7 días. */
export const MAX_SUBSCRIPTION_TTL_SECONDS = 7 * 24 * 60 * 60
const SCOPES = [
  GOOGLE_SCOPES.workspaceEvents.MEET_SPACE_READONLY,
  GOOGLE_SCOPES.workspaceEvents.MEET_SPACE_CREATED,
]

export interface WorkspaceEventsAdapterDeps extends GoogleAdapterDeps {
  clientFactory?: (auth: AuthClient) => WorkspaceEventsApiClient
  sleep?: (ms: number) => Promise<void>
}

export class GoogleWorkspaceEventsAdapter implements WorkspaceEventsPort {
  private readonly clientFactory: (auth: AuthClient) => WorkspaceEventsApiClient
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly deps: WorkspaceEventsAdapterDeps) {
    this.clientFactory =
      deps.clientFactory ??
      ((auth) =>
        google.workspaceevents({ version: 'v1', auth }) as unknown as WorkspaceEventsApiClient)
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  private client(asUser: string): WorkspaceEventsApiClient {
    return this.clientFactory(this.deps.auth.for(asUser, SCOPES))
  }

  private retryOpts(operation: string) {
    return { ...this.deps.retry, operation }
  }

  /** Espera a que una operación de larga duración termine (máx. ~5 intentos). */
  private async awaitOperation(
    client: WorkspaceEventsApiClient,
    op: workspaceevents_v1.Schema$Operation,
  ): Promise<workspaceevents_v1.Schema$Subscription> {
    let current = op
    for (let i = 0; i < 5 && !current.done; i++) {
      if (!current.name) break
      await this.sleep(500 * (i + 1))
      const res = await withGoogleRetry(
        (signal) => client.operations.get({ name: current.name ?? '' }, { signal }),
        this.retryOpts('workspaceevents.operations.get'),
      )
      current = res.data
    }
    if (current.error) {
      throw new DomainError(
        DomainErrorCode.GOOGLE_UNAVAILABLE,
        `Operación de suscripción falló: ${current.error.message ?? 'desconocido'}`,
        {
          details: { code: current.error.code ?? null },
        },
      )
    }
    return (current.response ?? {}) as workspaceevents_v1.Schema$Subscription
  }

  async createUserSubscription(input: {
    userEmail: string
    userResourceName: string
    eventTypes: string[]
    pubsubTopic: string
  }): Promise<{ subscriptionName: string; expiresAt: Date }> {
    const client = this.client(input.userEmail)
    const res = await withGoogleRetry(
      (signal) =>
        client.subscriptions.create(
          {
            requestBody: {
              targetResource: input.userResourceName,
              eventTypes: input.eventTypes,
              notificationEndpoint: { pubsubTopic: input.pubsubTopic },
              payloadOptions: { includeResource: false },
              ttl: protoDuration(MAX_SUBSCRIPTION_TTL_SECONDS),
            },
          },
          { signal },
        ),
      this.retryOpts('workspaceevents.subscriptions.create'),
    )
    const sub = await this.awaitOperation(client, res.data)
    const name = sub.name ?? (res.data.metadata?.['subscription'] as string | undefined) ?? ''
    if (!name) {
      throw new DomainError(
        DomainErrorCode.GOOGLE_UNAVAILABLE,
        'Google no devolvió el nombre de la suscripción creada',
      )
    }
    return {
      subscriptionName: name,
      expiresAt:
        toDate(sub.expireTime) ?? new Date(Date.now() + MAX_SUBSCRIPTION_TTL_SECONDS * 1000),
    }
  }

  async renewSubscription(subscriptionName: string, asUser: string): Promise<{ expiresAt: Date }> {
    const client = this.client(asUser)
    const existing = await this.getSubscription(subscriptionName, asUser)
    if (existing?.state === 'SUSPENDED') {
      const re = await withGoogleRetry(
        (signal) =>
          client.subscriptions.reactivate({ name: subscriptionName, requestBody: {} }, { signal }),
        this.retryOpts('workspaceevents.subscriptions.reactivate'),
      )
      await this.awaitOperation(client, re.data)
    }
    const res = await withGoogleRetry(
      (signal) =>
        client.subscriptions.patch(
          {
            name: subscriptionName,
            updateMask: 'ttl',
            requestBody: { ttl: protoDuration(MAX_SUBSCRIPTION_TTL_SECONDS) },
          },
          { signal },
        ),
      this.retryOpts('workspaceevents.subscriptions.patch'),
    )
    const sub = await this.awaitOperation(client, res.data)
    return {
      expiresAt:
        toDate(sub.expireTime) ?? new Date(Date.now() + MAX_SUBSCRIPTION_TTL_SECONDS * 1000),
    }
  }

  async deleteSubscription(subscriptionName: string, asUser: string): Promise<void> {
    const client = this.client(asUser)
    const res = await withGoogleRetry(
      (signal) =>
        client.subscriptions.delete({ name: subscriptionName, allowMissing: true }, { signal }),
      this.retryOpts('workspaceevents.subscriptions.delete'),
    )
    await this.awaitOperation(client, res.data)
  }

  async getSubscription(
    subscriptionName: string,
    asUser: string,
  ): Promise<{ state: string; expiresAt: Date } | null> {
    try {
      const res = await withGoogleRetry(
        (signal) => this.client(asUser).subscriptions.get({ name: subscriptionName }, { signal }),
        this.retryOpts('workspaceevents.subscriptions.get'),
      )
      return {
        state: res.data.state ?? 'UNKNOWN',
        expiresAt: toDate(res.data.expireTime) ?? new Date(0),
      }
    } catch (err) {
      if (err instanceof DomainError && err.code === DomainErrorCode.GOOGLE_NOT_FOUND) return null
      throw err
    }
  }
}
