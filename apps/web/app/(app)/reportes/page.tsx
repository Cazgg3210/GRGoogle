import type { Metadata } from 'next'
import type { AreaDto, UserDto, WeeklyDigestConfigDto, WeeklyDigestDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import { PageHeader } from '@smlxl/ui'
import { api, getAppSession, safe } from '@/lib/api.server'
import { hasPermission } from '@/lib/permissions'
import { PageError } from '@/components/shared/page-error'
import { DigestsPanel } from './digests-panel'
import { DigestConfigForm } from './digest-config-form'
import { SheetsPanel } from './sheets-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reportes' }

export default async function ReportsPage() {
  const session = await getAppSession()
  const perms = session?.permissions ?? []
  const canConfig =
    hasPermission(perms, Permission.CONFIG_MANAGE) ||
    hasPermission(perms, Permission.DIGEST_GENERATE)
  const canSheets = hasPermission(perms, Permission.SHEETS_SYNC)
  const [digests, config, users, areas] = await Promise.all([
    safe(api.get<WeeklyDigestDto[]>('/reports/weekly', { query: { limit: 20 } })),
    canConfig
      ? safe(api.get<WeeklyDigestConfigDto>('/reports/weekly/config'))
      : Promise.resolve(null),
    safe(api.get<UserDto[]>('/team/users')),
    safe(api.get<AreaDto[]>('/team/areas')),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Dirección"
        title="Reportes"
        description="Digest semanal ejecutivo (generado, revisable y enviado por correo) y sincronización a la hoja de seguimiento en Google Sheets."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          {digests.ok ? (
            <DigestsPanel
              digests={digests.data}
              canGenerate={hasPermission(perms, Permission.DIGEST_GENERATE)}
            />
          ) : (
            <PageError error={digests.error} retryHref="/reportes" />
          )}
          {canSheets ? <SheetsPanel /> : null}
        </div>
        <div>
          {config ? (
            config.ok ? (
              <DigestConfigForm
                initial={config.data}
                users={users.ok ? users.data : []}
                areas={areas.ok ? areas.data : []}
                readOnly={!hasPermission(perms, Permission.CONFIG_MANAGE)}
              />
            ) : (
              <PageError error={config.error} compact />
            )
          ) : null}
        </div>
      </div>
    </>
  )
}
