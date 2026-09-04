import { z } from 'zod'
import type { FastifyRequest } from 'fastify'
import { IdSchema } from '@smlxl/contracts'
import type { Env } from '@smlxl/config'
import type { AppContext, Application } from '@smlxl/application'
import { requirePrincipal } from '../plugins/auth.js'

/** Dependencias inyectables para las rutas: la aplicación ya compuesta (§8.2) y utilidades de operación. */
export interface RouteDeps {
  application: Application
  ctx: AppContext
  env: Env
  version: string
  checkDatabase: () => Promise<boolean>
  /** Conteos por cola para /admin/jobs (pg-boss). Opcional en tests. */
  jobStats?: () => Promise<
    Array<{ name: string; created: number; active: number; completed: number; failed: number }>
  >
}

export const IdParams = z.object({ id: IdSchema })

/** preHandler: sólo exige autenticación (el alcance lo decide el caso de uso). */
export async function authenticated(request: FastifyRequest): Promise<void> {
  requirePrincipal(request)
}
