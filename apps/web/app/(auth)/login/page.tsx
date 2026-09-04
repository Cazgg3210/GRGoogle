import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { UserDto } from '@smlxl/contracts'
import { mintApiToken } from '@smlxl/auth'
import { InlineNotice } from '@smlxl/ui'
import { AlertTriangle } from 'lucide-react'
import { auth, devBypassEnabled, googleLoginEnabled } from '@/auth'
import { env } from '@/env'
import { bootstrapApi } from '@/lib/api.server'
import { first, type SearchParams } from '@/lib/search-params'
import { GoogleButton } from '@/components/login/google-button'
import { DevUserPicker } from '@/components/login/dev-user-picker'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Iniciar sesión' }

const ERROR_TEXT: Record<string, string> = {
  AccessDenied: `Tu cuenta no está autorizada. Sólo usuarios activos con correo @${env.GOOGLE_WORKSPACE_DOMAIN} pueden entrar.`,
  CredentialsSignin: 'No se encontró un usuario activo con ese correo.',
  OAuthAccountNotLinked: 'La cuenta de Google no coincide con el usuario registrado.',
  Configuration: 'La autenticación no está configurada correctamente. Contacta a administración.',
  GoogleNotConfigured: 'El inicio de sesión con Google no está configurado en este entorno.',
}

async function loadDemoUsers(): Promise<{ users: UserDto[]; error: string | null }> {
  try {
    const email = env.AUTH_DEV_BOOTSTRAP_EMAIL
    const token = await mintApiToken({ sub: email, email, role: 'MEMBER', name: 'bootstrap' }, env.AUTH_SECRET, 120)
    const users = await bootstrapApi(email, token).get<UserDto[]>('/team/users')
    return { users: users.filter((u) => u.active), error: null }
  } catch {
    return { users: [], error: 'La API no respondió; escribe un correo corporativo para entrar como MEMBER.' }
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth()
  if (session?.user) redirect('/inicio')
  const sp = await searchParams
  const callbackUrl = first(sp, 'callbackUrl') ?? '/inicio'
  const errorKey = first(sp, 'error')
  const errorText = errorKey ? (ERROR_TEXT[errorKey] ?? 'No se pudo iniciar sesión. Inténtalo de nuevo.') : null
  const demo = devBypassEnabled ? await loadDemoUsers() : null

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <section className="relative hidden overflow-hidden bg-ink-950 text-paper-50 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.35) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at 30% 20%, black 20%, transparent 70%)',
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-sm bg-signal-500 font-display text-2xl leading-none">S</span>
          <span className="font-display text-2xl tracking-tight">SMLXL</span>
          <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">Meeting Intelligence</span>
        </div>
        <div className="relative max-w-xl animate-fade-up">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-signal-300">Reuniones → compromisos → seguimiento</p>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight xl:text-6xl">
            Cada compromiso,
            <br />
            <em className="text-signal-200">con evidencia.</em>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-ink-200">
            La plataforma escucha las reuniones de Google Meet, propone acuerdos y pendientes, y deja que una persona
            decida. Nada se cierra sin aprobación humana.
          </p>
        </div>
        <dl className="relative grid grid-cols-3 gap-6 border-t border-ink-800 pt-6 text-sm">
          <div>
            <dt className="text-ink-400">Evidencia</dt>
            <dd className="mt-1 text-paper-100">Frase, speaker y minuto de cada extracción.</dd>
          </div>
          <div>
            <dt className="text-ink-400">Control</dt>
            <dd className="mt-1 text-paper-100">La IA propone; la gestora o el gerente aprueban.</dd>
          </div>
          <div>
            <dt className="text-ink-400">Auditoría</dt>
            <dd className="mt-1 text-paper-100">Toda mutación sensible queda registrada.</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md animate-fade-up">
          <div className="mb-8 lg:hidden">
            <span className="font-display text-3xl tracking-tight text-ink-950">SMLXL</span>
          </div>
          <h2 className="font-display text-3xl tracking-tight text-ink-950">Iniciar sesión</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Acceso exclusivo para cuentas <span className="font-medium text-foreground">@{env.GOOGLE_WORKSPACE_DOMAIN}</span> autorizadas.
          </p>

          {errorText ? (
            <InlineNotice tone="danger" icon={AlertTriangle} className="mt-6">
              {errorText}
            </InlineNotice>
          ) : null}

          <div className="mt-8 flex flex-col gap-6">
            <GoogleButton enabled={googleLoginEnabled} callbackUrl={callbackUrl} />
            {demo ? (
              <>
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  Acceso de desarrollo
                  <span className="h-px flex-1 bg-border" />
                </div>
                <DevUserPicker users={demo.users} loadError={demo.error} callbackUrl={callbackUrl} domain={env.GOOGLE_WORKSPACE_DOMAIN} />
              </>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
