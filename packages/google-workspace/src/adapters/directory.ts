import { google, type admin_directory_v1 } from 'googleapis'
import type { DirectoryPort } from '@smlxl/domain'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import { GOOGLE_SCOPES } from '../scopes.js'
import { withGoogleRetry } from '../http/retry.js'
import { collectPages, type AuthClient, type GoogleAdapterDeps } from './shared.js'

/**
 * Admin SDK Directory (§13.2): listar usuarios del dominio y resolver el
 * resource name de Cloud Identity para las suscripciones de Workspace Events.
 * Requiere impersonar a un administrador (`adminEmail`).
 */
export interface DirectoryApiClient {
  users: {
    list(
      params: admin_directory_v1.Params$Resource$Users$List,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: admin_directory_v1.Schema$Users }>
    get(
      params: admin_directory_v1.Params$Resource$Users$Get,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: admin_directory_v1.Schema$User }>
  }
}

const SCOPES = [GOOGLE_SCOPES.directory.USER_READONLY]
const SELF_SCOPES = [GOOGLE_SCOPES.directory.USERINFO_PROFILE]

/** Cliente mínimo de `oauth2.userinfo.get` (id de Google del usuario impersonado). */
export interface UserinfoApiClient {
  get(): Promise<{ data: { id?: string | null } }>
}

export interface DirectoryAdapterDeps extends GoogleAdapterDeps {
  /** Cuenta administradora que se impersona para leer el directorio. */
  adminEmail: string
  clientFactory?: (auth: AuthClient) => DirectoryApiClient
  userinfoFactory?: (auth: AuthClient) => UserinfoApiClient
}

export function userResourceName(googleUserId: string): string {
  return `//cloudidentity.googleapis.com/users/${googleUserId}`
}

export class GoogleDirectoryAdapter implements DirectoryPort {
  private readonly clientFactory: (auth: AuthClient) => DirectoryApiClient
  private readonly idCache = new Map<string, string | null>()

  constructor(private readonly deps: DirectoryAdapterDeps) {
    this.clientFactory =
      deps.clientFactory ??
      ((auth) => google.admin({ version: 'directory_v1', auth }) as unknown as DirectoryApiClient)
    if (!deps.adminEmail) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_ERROR,
        'GoogleDirectoryAdapter requiere adminEmail para impersonación',
      )
    }
  }

  private client(): DirectoryApiClient {
    return this.clientFactory(this.deps.auth.for(this.deps.adminEmail, SCOPES))
  }

  async listDomainUsers(
    domain: string,
  ): Promise<
    Array<{ googleUserId: string; email: string; displayName: string; suspended: boolean }>
  > {
    const users = await collectPages((pageToken) =>
      withGoogleRetry(
        async (signal) => {
          const res = await this.client().users.list(
            { domain, maxResults: 200, orderBy: 'email', pageToken },
            { signal },
          )
          return { items: res.data.users ?? [], nextPageToken: res.data.nextPageToken }
        },
        { ...this.deps.retry, operation: 'directory.users.list' },
      ),
    )
    return users
      .filter((u) => typeof u.id === 'string' && typeof u.primaryEmail === 'string')
      .map((u) => ({
        googleUserId: u.id as string,
        email: (u.primaryEmail as string).toLowerCase(),
        displayName: u.name?.fullName ?? u.name?.displayName ?? (u.primaryEmail as string),
        suspended: u.suspended === true,
      }))
  }

  async resolveUserResourceName(email: string): Promise<string | null> {
    const id = await this.getUserId(email)
    return id ? userResourceName(id) : null
  }

  /** Resuelve el id de Google de un usuario por email (con caché). */
  async getUserId(email: string): Promise<string | null> {
    const key = email.trim().toLowerCase()
    if (this.idCache.has(key)) return this.idCache.get(key) ?? null
    try {
      const res = await withGoogleRetry(
        (signal) => this.client().users.get({ userKey: key }, { signal }),
        {
          ...this.deps.retry,
          operation: 'directory.users.get',
        },
      )
      const id = res.data.id ?? null
      this.idCache.set(key, id)
      return id
    } catch (err) {
      if (err instanceof DomainError && err.code === DomainErrorCode.GOOGLE_NOT_FOUND) {
        this.idCache.set(key, null)
        return null
      }
      if (err instanceof DomainError && err.code === DomainErrorCode.GOOGLE_PERMISSION_DENIED) {
        // Sin privilegios de administrador: el propio usuario puede leer su id (userinfo.profile).
        const id = await this.getOwnUserId(key)
        if (id) {
          this.idCache.set(key, id)
          return id
        }
      }
      throw err
    }
  }

  /** Id de Google del usuario impersonándolo a él mismo; no requiere Admin SDK ni rol de administrador. */
  private async getOwnUserId(email: string): Promise<string | null> {
    const auth = this.deps.auth.for(email, SELF_SCOPES)
    const client =
      this.deps.userinfoFactory?.(auth) ??
      (google.oauth2({ version: 'v2', auth }).userinfo as unknown as UserinfoApiClient)
    const res = await withGoogleRetry((_signal) => client.get(), {
      ...this.deps.retry,
      operation: 'oauth2.userinfo.get',
    })
    return res.data.id ?? null
  }

  /** Resuelve email primario a partir del id de Google (`users/{id}` en Meet API). */
  async getUserEmailById(googleUserId: string): Promise<string | null> {
    try {
      const res = await withGoogleRetry(
        (signal) => this.client().users.get({ userKey: googleUserId }, { signal }),
        {
          ...this.deps.retry,
          operation: 'directory.users.get',
        },
      )
      return res.data.primaryEmail?.toLowerCase() ?? null
    } catch (err) {
      if (err instanceof DomainError && err.code === DomainErrorCode.GOOGLE_NOT_FOUND) return null
      throw err
    }
  }
}
