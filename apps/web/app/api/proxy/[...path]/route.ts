import { NextResponse, type NextRequest } from 'next/server'
import { getApiToken } from '@smlxl/auth/next'
import { auth } from '@/auth'
import { API_BASE_URL, env } from '@/env'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Proxy delgado hacia la API interna: reenvía método, query y body agregando
 * `Authorization` desde la sesión. Sin lógica de negocio.
 */
async function forward(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const session = await auth()
  const token = getApiToken(session)
  if (!session?.user || !token) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: 'Sesión requerida' }, { status: 401 })
  }
  const { path } = await ctx.params
  const target = `${API_BASE_URL}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', req.headers.get('accept') ?? 'application/json')
  const contentType = req.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)
  if (env.AUTH_DEV_BYPASS) headers.set('x-dev-user-email', session.user.email)
  const correlation = req.headers.get('x-correlation-id')
  if (correlation) headers.set('x-correlation-id', correlation)

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return NextResponse.json(
      { code: 'NETWORK_ERROR', message: 'No se pudo conectar con la API de la plataforma' },
      { status: 502 },
    )
  }

  const resHeaders = new Headers()
  const upstreamType = upstream.headers.get('content-type')
  if (upstreamType) resHeaders.set('Content-Type', upstreamType)
  const upstreamCorrelation = upstream.headers.get('x-correlation-id')
  if (upstreamCorrelation) resHeaders.set('x-correlation-id', upstreamCorrelation)
  resHeaders.set('Cache-Control', 'no-store')

  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}

export const GET = forward
export const POST = forward
export const PATCH = forward
export const PUT = forward
export const DELETE = forward
