import { PrismaClient } from './generated/client/index.js'

/**
 * Cliente Prisma. Sólo registra warn/error para no volcar SQL con datos de
 * transcripciones en los logs (§28). `url` permite instanciar clientes de
 * prueba apuntando a otra base sin tocar `process.env`.
 */
export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({
    log: ['warn', 'error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  })
}

let defaultClient: PrismaClient | undefined

/** Singleton perezoso: se crea en el primer acceso con DATABASE_URL del entorno. */
export function getPrismaClient(): PrismaClient {
  if (!defaultClient) defaultClient = createPrismaClient()
  return defaultClient
}

/** Alias cómodo para código que sólo necesita "el" cliente. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    const value = Reflect.get(client, prop, receiver) as unknown
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
})

export type { PrismaClient }
