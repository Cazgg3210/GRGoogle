import type { Metadata } from 'next'
import { PageHeader } from '@smlxl/ui'
import { ManualMeetingForm } from './manual-meeting-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Importar reunión' }

export default function NewMeetingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Demo / respaldo"
        title="Importar reunión manualmente"
        description="Pega una transcripción para ejecutar el mismo pipeline (ingesta → análisis IA → reconciliación) sin depender de Google. Útil para demos y para reuniones con host externo."
      />
      <ManualMeetingForm />
    </>
  )
}
