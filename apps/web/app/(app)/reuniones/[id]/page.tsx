import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ActionItemDto, AiReviewItemDto, MeetingDetailDto } from '@smlxl/contracts'
import { api, safe } from '@/lib/api.server'
import { first, type SearchParams } from '@/lib/search-params'
import { PageError } from '@/components/shared/page-error'
import { MeetingDetailView } from './meeting-detail'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await safe(api.get<MeetingDetailDto>(`/meetings/${id}`))
  return { title: result.ok ? result.data.title : 'Reunión' }
}

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const [detail, actionItems, reviewItems] = await Promise.all([
    safe(api.get<MeetingDetailDto>(`/meetings/${id}`)),
    safe(api.get<ActionItemDto[]>(`/meetings/${id}/action-items`)),
    safe(api.get<AiReviewItemDto[]>(`/meetings/${id}/review-items`)),
  ])
  if (!detail.ok) {
    if (detail.error.status === 404) notFound()
    return <PageError error={detail.error} retryHref={`/reuniones/${id}`} />
  }
  return (
    <MeetingDetailView
      meeting={detail.data}
      actionItems={actionItems.ok ? actionItems.data : []}
      actionItemsError={actionItems.ok ? null : actionItems.error.code}
      reviewItems={reviewItems.ok ? reviewItems.data : []}
      initialTab={first(sp, 'tab')}
    />
  )
}
