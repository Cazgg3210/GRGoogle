import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const PUBLIC_PREFIXES = ['/login', '/api/auth', '/_next', '/favicon.ico', '/icon', '/robots.txt']

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p),
  )
}

/** Protege las rutas de la app y el proxy: sin sesión -> /login (o 401 para API). */
export default auth((req) => {
  const { pathname, search } = req.nextUrl
  if (isPublic(pathname)) return NextResponse.next()
  if (req.auth?.user) return NextResponse.next()
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: 'Sesión requerida' }, { status: 401 })
  }
  const url = new URL('/login', req.nextUrl.origin)
  url.searchParams.set('callbackUrl', `${pathname}${search}`)
  return NextResponse.redirect(url)
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
