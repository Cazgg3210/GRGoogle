import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getAppSession } from '@/lib/api.server'
import { visibleNavItems } from '@/lib/permissions'
import { DEFAULT_PERIOD, PERIOD_COOKIE, isPeriodKey } from '@/lib/period'
import { SessionProvider } from '@/components/session-context'
import { AppShell } from '@/components/app-shell/app-shell'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession()
  if (!session) redirect('/login')
  const cookieStore = await cookies()
  const periodCookie = cookieStore.get(PERIOD_COOKIE)?.value
  const period = isPeriodKey(periodCookie) ? periodCookie : DEFAULT_PERIOD
  const nav = visibleNavItems(session.permissions).map(({ href, label }) => ({ href, label }))

  return (
    <SessionProvider
      value={{
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        permissions: session.permissions,
        devBypass: session.devBypass,
        verified: session.verified,
      }}
    >
      <AppShell nav={nav} period={period}>
        {children}
      </AppShell>
    </SessionProvider>
  )
}
