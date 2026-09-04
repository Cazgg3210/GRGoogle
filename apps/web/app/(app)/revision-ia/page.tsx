import type { Metadata } from 'next'
import type { AiReviewItemDto } from '@smlxl/contracts'
import { PageHeader } from '@smlxl/ui'
import { api, safe } from '@/lib/api.server'
import type { Page } from '@/lib/api'
import { first, firstInt, type SearchParams } from '@/lib/search-params'
import { PageError } from '@/components/shared/page-error'
import { ReviewList } from './review-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Revisión IA' }

export default async function AiReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const query = {
    page: firstInt(sp, 'page', 1),
    pageSize: firstInt(sp, 'pageSize', 25),
    meetingId: first(sp, 'meetingId'),
  }
  const result = await safe(api.get<Page<AiReviewItemDto>>('/ai-review', { query }))
  return (
    <>
      <PageHeader
        eyebrow="Control humano"
        title="Revisión IA"
        description="Sólo aparecen extracciones con confianza baja, responsable o fecha ambiguos, posibles duplicados, posibles cierres o conflictos. Nada de esto se aplica sin tu decisión."
      />
      {result.ok ? (
        <ReviewList page={result.data} reason={first(sp, 'reason')} meetingId={query.meetingId} />
      ) : (
        <PageError error={result.error} retryHref="/revision-ia" />
      )}
    </>
  )
}
