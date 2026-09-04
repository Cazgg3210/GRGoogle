import type { DirectoryPort } from '@smlxl/domain'

export interface FakeDirectoryUser {
  googleUserId: string
  email: string
  displayName: string
  suspended: boolean
}

/** Nombre legible a partir del local-part del email: "andres.escandon" → "Andres Escandon". */
export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

/** Fake de Directory a partir de la lista de usuarios monitoreados (settings). */
export class FakeDirectoryAdapter implements DirectoryPort {
  readonly users: FakeDirectoryUser[]

  constructor(
    emails: string[],
    overrides: Partial<Record<string, Partial<FakeDirectoryUser>>> = {},
  ) {
    this.users = emails.map((email, i) => {
      const e = email.toLowerCase()
      return {
        googleUserId: `1000${String(i + 1).padStart(6, '0')}`,
        email: e,
        displayName: displayNameFromEmail(e),
        suspended: false,
        ...(overrides[e] ?? {}),
      }
    })
  }

  async listDomainUsers(domain: string): Promise<FakeDirectoryUser[]> {
    return this.users.filter((u) => u.email.endsWith(`@${domain.toLowerCase()}`))
  }

  async resolveUserResourceName(email: string): Promise<string | null> {
    const u = this.users.find((x) => x.email === email.toLowerCase())
    return u ? `//cloudidentity.googleapis.com/users/${u.googleUserId}` : null
  }

  async getUserEmailById(googleUserId: string): Promise<string | null> {
    return this.users.find((x) => x.googleUserId === googleUserId)?.email ?? null
  }
}
