import type { Metadata } from 'next'
import type { PlatformSettingsDto } from '@smlxl/contracts'
import { PageHeader } from '@smlxl/ui'
import { api, safe } from '@/lib/api.server'
import { PageError } from '@/components/shared/page-error'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Configuración' }

export default async function SettingsPage() {
  const settings = await safe(api.get<PlatformSettingsDto>('/admin/settings'))
  return (
    <>
      <PageHeader
        eyebrow="Plataforma"
        title="Configuración"
        description="Feature flags, umbrales de confianza IA, zona horaria, retención y cuentas monitoreadas. Los valores de entorno son el default; aquí se sobreescriben en base de datos."
      />
      {settings.ok ? (
        <SettingsForm initial={settings.data} />
      ) : (
        <PageError error={settings.error} retryHref="/configuracion" />
      )}
    </>
  )
}
