import { readFileSync } from 'node:fs'
import { JWT } from 'google-auth-library'
import { DomainError, DomainErrorCode } from '@smlxl/domain'

/**
 * Domain-Wide Delegation (§13.4, §27.1): una service account dedicada impersona
 * al usuario correspondiente con scopes mínimos. Nunca se loggean credenciales.
 */
export interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  /** Opcional: id de la llave privada. */
  private_key_id?: string
}

export interface DwdConfig {
  credentials: ServiceAccountCredentials
  /** Sólo se permite impersonar cuentas de este dominio. */
  allowedDomain: string
}

/**
 * Carga credenciales desde `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS`: acepta JSON inline
 * o la ruta a un archivo JSON. Devuelve null si está vacío.
 */
export function loadServiceAccountCredentials(raw: string): ServiceAccountCredentials | null {
  const value = raw.trim()
  if (!value) return null
  let json: string
  if (value.startsWith('{')) json = value
  else {
    try {
      json = readFileSync(value, 'utf8')
    } catch (err) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_ERROR,
        'No se pudo leer el archivo de credenciales de la service account',
        {
          cause: err,
        },
      )
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_ERROR,
      'Credenciales de service account inválidas (JSON)',
      { cause: err },
    )
  }
  const obj = parsed as Partial<ServiceAccountCredentials>
  if (typeof obj.client_email !== 'string' || typeof obj.private_key !== 'string') {
    throw new DomainError(
      DomainErrorCode.VALIDATION_ERROR,
      'Credenciales de service account incompletas (client_email/private_key)',
    )
  }
  const creds: ServiceAccountCredentials = {
    client_email: obj.client_email,
    // Soporta llaves con "\n" escapado (variables de entorno).
    private_key: obj.private_key.replace(/\\n/g, '\n'),
  }
  if (typeof obj.private_key_id === 'string') creds.private_key_id = obj.private_key_id
  return creds
}

export function assertSubjectAllowed(subjectEmail: string, allowedDomain: string): void {
  const email = subjectEmail.trim().toLowerCase()
  const domain = allowedDomain.trim().toLowerCase()
  if (!domain || !email.endsWith(`@${domain}`)) {
    throw new DomainError(
      DomainErrorCode.GOOGLE_PERMISSION_DENIED,
      'Sólo se permite impersonar cuentas del dominio corporativo configurado',
      { details: { subjectDomain: email.split('@')[1] ?? null } },
    )
  }
}

/** Crea un cliente JWT impersonando `subjectEmail` con los scopes indicados (sin caché). */
export function createImpersonatedAuth(
  credentials: ServiceAccountCredentials,
  subjectEmail: string,
  scopes: readonly string[],
  allowedDomain?: string,
): JWT {
  if (allowedDomain !== undefined) assertSubjectAllowed(subjectEmail, allowedDomain)
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [...scopes],
    subject: subjectEmail,
  })
  if (credentials.private_key_id) client.keyId = credentials.private_key_id
  return client
}

/** Fábrica de clientes con caché por (subject, scopes) y guard de dominio. */
export class ImpersonatedAuthFactory {
  private readonly cache = new Map<string, JWT>()

  constructor(private readonly config: DwdConfig) {}

  get serviceAccountEmail(): string {
    return this.config.credentials.client_email
  }

  for(subjectEmail: string, scopes: readonly string[]): JWT {
    assertSubjectAllowed(subjectEmail, this.config.allowedDomain)
    const key = `${subjectEmail.trim().toLowerCase()}|${[...scopes].sort().join(' ')}`
    let client = this.cache.get(key)
    if (!client) {
      client = createImpersonatedAuth(this.config.credentials, subjectEmail, scopes)
      this.cache.set(key, client)
    }
    return client
  }

  /** Para tests: vacía la caché. */
  clear(): void {
    this.cache.clear()
  }
}
