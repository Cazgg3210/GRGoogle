import { randomUUID } from 'node:crypto'
import type { Clock, IdGenerator } from '@smlxl/domain'

export { createPrismaClient, getPrismaClient, prisma, type PrismaClient } from './client.js'
export { Prisma } from './generated/client/index.js'
export * from './repositories/index.js'
export { PrismaUnitOfWork, type UnitOfWorkOptions } from './unit-of-work.js'
export * as mappers from './mappers/index.js'
export { dateOnlyFromDb, dateOnlyToDb, jsonSafe, type MapperContext } from './mappers/common.js'

/** Reloj real del sistema (puerto `Clock`). */
export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}

/** Generador de UUID v4 (puerto `IdGenerator`). */
export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID()
  }
}
