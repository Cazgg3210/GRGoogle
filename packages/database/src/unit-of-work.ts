import type { Repositories, UnitOfWork } from '@smlxl/domain'
import type { Prisma, PrismaClient } from './generated/client/index.js'
import { createRepositories, type PrismaRepositories, type RepositoryDefaults } from './repositories/index.js'

export interface UnitOfWorkOptions {
  /** Máximo de espera para adquirir la conexión (ms). */
  maxWait?: number
  /** Duración máxima de la transacción (ms). */
  timeout?: number
  isolationLevel?: Prisma.TransactionIsolationLevel
}

const DEFAULT_OPTIONS: Required<Pick<UnitOfWorkOptions, 'maxWait' | 'timeout'>> = {
  maxWait: 15_000,
  timeout: 15_000,
}

/**
 * Unidad de trabajo sobre `$transaction` interactiva. Los repositorios que
 * recibe `fn` están ligados al cliente transaccional: si `fn` lanza, se
 * revierte todo.
 */
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly client: PrismaClient,
    private readonly defaults: RepositoryDefaults,
    private readonly options: UnitOfWorkOptions = {},
  ) {}

  run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.runWithPrisma((repos) => fn(repos))
  }

  /** Variante con los tipos concretos de Prisma y acceso al `tx` (para scripts internos). */
  runWithPrisma<T>(fn: (repos: PrismaRepositories, tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx) => fn(createRepositories(tx, this.defaults), tx),
      {
        maxWait: this.options.maxWait ?? DEFAULT_OPTIONS.maxWait,
        timeout: this.options.timeout ?? DEFAULT_OPTIONS.timeout,
        ...(this.options.isolationLevel ? { isolationLevel: this.options.isolationLevel } : {}),
      },
    )
  }
}
