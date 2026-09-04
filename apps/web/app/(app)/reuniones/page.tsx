import type { Metadata } from 'next'
import Link from 'next/link'
import { Upload } from 'lucide-react'
import type { MeetingListItemDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import { Button, PageHeader } from '@smlxl/ui'
import { api, getAppSession, safe } from '@/lib/api.server'
import type { Page } from '@/lib/api'
import { first, firstBool, firstInt, type SearchParams } from '@/lib/search-params'
import { hasPermission } from '@/lib/permissions'
import { PageError } from '@/components/shared/page-error'
import { MeetingsTable, type MeetingsQuery } from './meetings-table'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reuniones' }

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getAppSession()
  const query: MeetingsQuery = {
    page: firstInt(sp, 'page', 1),
    pageSize: firstInt(sp, 'pageSize', 25),
    from: first(sp, 'from'),
    to: first(sp, 'to'),
    organizerUserId: first(sp, 'organizerUserId'),
    areaId: first(sp, 'areaId'),
    participantUserId: first(sp, 'participantUserId'),
    processed: firstBool(sp, 'processed'),
    withActionItems: firstBool(sp, 'withActionItems'),
    confidentiality: first(sp, 'confidentiality'),
    processingStatus: first(sp, 'processingStatus'),
    search: first(sp, 'search'),
  }
  const result = await safe(api.get<Page<MeetingListItemDto>>('/meetings', { query }))
  const canImport = hasPermission(session?.permissions ?? [], Permission.ACTION_ITEM_CREATE)

  return (
    <>
      <PageHeader
        eyebrow="Fuente de verdad"
        title="Reuniones"
        description="Reuniones detectadas en las cuentas monitoreadas, con el estado de sus artefactos y del análisis IA."
        actions={
          canImport ? (
            <Button variant="outline" asChild>
              <Link href="/reuniones/nueva">
                <Upload />
                Importar manualmente
              </Link>
            </Button>
          ) : null
        }
      />
      {result.ok ? <MeetingsTable page={result.data} query={query} /> : <MeetingsTable page={null} query={query} error={<PageError error={result.error} retryHref="/reuniones" />} />}
    </>
  )
}
