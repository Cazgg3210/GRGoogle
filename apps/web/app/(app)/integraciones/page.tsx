import type { Metadata } from 'next'
import type { GoogleStatusDto } from '@smlxl/contracts'
import { PageHeader } from '@smlxl/ui'
import { api, safe } from '@/lib/api.server'
import { PageError } from '@/components/shared/page-error'
import { IntegrationsPanel } from './integrations-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Integraciones' }

export default async function IntegrationsPage() {
  const status = await safe(api.get<GoogleStatusDto>('/integrations/google/status'))
  return (
    <>
      <PageHeader
        eyebrow="Operación técnica"
        title="Integraciones"
        description="Estado de Google Workspace (eventos de Meet, Calendar, Sheets, Gmail) y consumo de IA. Con los flags apagados la plataforma corre con adapters fake."
      />
      {status.ok ? <IntegrationsPanel initial={status.data} /> : <PageError error={status.error} retryHref="/integraciones" />}
    </>
  )
}
