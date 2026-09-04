import type { FeatureFlags } from '@smlxl/domain'
import type { Prisma } from '../generated/client/index.js'
import type { MapperContext } from '../mappers/common.js'

/**
 * Cliente Prisma o cliente transaccional. Todos los repositorios reciben este
 * tipo para poder usarse dentro de `$transaction` (ver PrismaUnitOfWork).
 */
export type Db = Prisma.TransactionClient

/** Defaults de entorno que la capa de persistencia necesita (zona horaria, flags). */
export interface RepositoryDefaults {
  featureFlags: FeatureFlags
  companyTimezone: string
  companyDomain: string
}

export abstract class BaseRepository {
  protected readonly ctx: MapperContext

  constructor(
    protected readonly db: Db,
    protected readonly defaults: RepositoryDefaults,
  ) {
    this.ctx = { timeZone: defaults.companyTimezone }
  }
}

export function pageSkip(page: { page: number; pageSize: number }): { skip: number; take: number } {
  const pageSize = Math.max(1, Math.min(page.pageSize, 500))
  const pageNumber = Math.max(1, page.page)
  return { skip: (pageNumber - 1) * pageSize, take: pageSize }
}
