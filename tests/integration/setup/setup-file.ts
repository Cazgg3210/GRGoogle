import { afterAll, beforeEach } from 'vitest'

/**
 * Setup por archivo. Cada suite es responsable de limpiar su propio estado
 * (truncate de las tablas que toca) para mantener idempotencia entre corridas.
 * Aquí sólo se fija el reloj de referencia y se registra el cierre ordenado.
 */
process.env.TZ = 'UTC'

beforeEach(() => {
  // Punto único para resetear métricas en memoria u otros singletons si hace falta.
})

afterAll(async () => {
  // Cierre de conexiones Prisma se hace en el helper de BD de cada suite.
})
