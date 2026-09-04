import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { newCorrelationId, type Logger } from '@smlxl/observability'
import type { Env } from '@smlxl/config'
import type { UserRepository } from '@smlxl/domain'
import { registerErrorHandler } from './plugins/error-handler.js'
import { registerAuth } from './plugins/auth.js'

export interface ServerDeps {
  env: Env
  logger: Logger
  users: UserRepository
}

export type AppServer = FastifyInstance<import('node:http').Server, import('node:http').IncomingMessage, import('node:http').ServerResponse, Logger, ZodTypeProvider>

/**
 * Construye el servidor Fastify con validación Zod, OpenAPI, seguridad básica,
 * autenticación y manejo de errores. Las rutas se registran aparte (routes/).
 */
export async function buildServer(deps: ServerDeps): Promise<AppServer> {
  const app = Fastify({
    loggerInstance: deps.logger,
    genReqId: (req) => (typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'] : newCorrelationId()),
    requestIdHeader: 'x-correlation-id',
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: [deps.env.APP_URL, 'http://localhost:3000'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'x-dev-user-email', 'x-correlation-id'],
  })
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' })

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'SMLXL Meeting Intelligence API', version: '0.1.0', description: 'API interna /api/v1 (ver docs/api/endpoints.md)' },
      servers: [{ url: deps.env.API_URL }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  // Los plugins trabajan sobre la instancia base (sin type provider ni logger tipado).
  const base = app as unknown as FastifyInstance
  registerErrorHandler(base)
  registerAuth(base, { env: deps.env, users: deps.users })

  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ method: request.method, url: request.url, statusCode: reply.statusCode, durationMs: Math.round(reply.elapsedTime), userId: request.principal?.id ?? null }, 'request')
  })

  app.get('/api/v1/openapi.json', { schema: { hide: true } }, async () => app.swagger())

  return app as unknown as AppServer
}
