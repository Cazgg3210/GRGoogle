import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ActionItemDetailDto } from '@smlxl/contracts'
import { api, safe } from '@/lib/api.server'
import { PageError } from '@/components/shared/page-error'
import { ActionItemDetail } from './detail'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await safe(api.get<ActionItemDetailDto>(`/action-items/${id}`))
  return { title: result.ok ? `${result.data.externalKey} · ${result.data.title}` : 'Pendiente' }
}

export default async function ActionItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await safe(api.get<ActionItemDetailDto>(`/action-items/${id}`))
  if (!result.ok) {
    if (result.error.status === 404) notFound()
    return <PageError error={result.error} retryHref={`/pendientes/${id}`} />
  }
  return <ActionItemDetail initial={result.data} />
}
