import type { Metadata } from 'next'
import type { ActionItemDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import { PageHeader } from '@smlxl/ui'
import { api, getAppSession, safe } from '@/lib/api.server'
import type { Page } from '@/lib/api'
import { first, firstInt, oneOf, type SearchParams } from '@/lib/search-params'
import { hasPermission } from '@/lib/permissions'
import { PageError } from '@/components/shared/page-error'
import { CreateActionItemDialog } from '@/components/action-items/create-dialog'
import { PendientesBoard, type PendientesQuery } from './board'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pendientes' }

const VIEWS = ['all', 'mine', 'team', 'overdue', 'thisWeek', 'noDueDate', 'noOwner', 'blocked', 'completed', 'proposed'] as const
const SORTS = ['attention', 'dueDate', 'createdAt', 'updatedAt', 'priority'] as const

export default async function PendientesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getAppSession()
  const query: PendientesQuery = {
    view: oneOf(sp, 'view', VIEWS, 'all'),
    page: firstInt(sp, 'page', 1),
    pageSize: firstInt(sp, 'pageSize', 50),
    sort: oneOf(sp, 'sort', SORTS, 'attention'),
    ownerUserId: first(sp, 'ownerUserId'),
    areaId: first(sp, 'areaId'),
    projectId: first(sp, 'projectId'),
    priority: first(sp, 'priority'),
    status: first(sp, 'status'),
    search: first(sp, 'search'),
  }
  const result = await safe(api.get<Page<ActionItemDto>>('/action-items', { query }))
  const canCreate = hasPermission(session?.permissions ?? [], Permission.ACTION_ITEM_CREATE)

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Pendientes"
        description="Compromisos extraídos de reuniones y capturados manualmente. Los cierres siempre pasan por aprobación humana."
        actions={canCreate ? <CreateActionItemDialog /> : null}
      />
      {result.ok ? (
        <PendientesBoard page={result.data} query={query} />
      ) : (
        <PendientesBoard page={null} query={query} error={<PageError error={result.error} retryHref="/pendientes" />} />
      )}
    </>
  )
}
