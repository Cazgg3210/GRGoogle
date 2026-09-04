import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { WeeklyDigestDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import { api, getAppSession, safe } from '@/lib/api.server'
import { hasPermission } from '@/lib/permissions'
import { PageError } from '@/components/shared/page-error'
import { DigestDetail } from './digest-detail'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const r = await safe(api.get<WeeklyDigestDto>(`/reports/weekly/${id}`))
  return { title: r.ok ? `Digest ${r.data.weekLabel}` : 'Digest' }
}

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [session, r] = await Promise.all([getAppSession(), safe(api.get<WeeklyDigestDto>(`/reports/weekly/${id}`))])
  if (!r.ok) {
    if (r.error.status === 404) notFound()
    return <PageError error={r.error} retryHref={`/reportes/${id}`} />
  }
  return <DigestDetail digest={r.data} canSend={hasPermission(session?.permissions ?? [], Permission.DIGEST_SEND)} />
}
