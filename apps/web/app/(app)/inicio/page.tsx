import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import {
  AlertTriangle,
  CalendarX2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Hourglass,
  Percent,
  Radio,
  Timer,
} from 'lucide-react'
import type { DashboardDto } from '@smlxl/contracts'
import { Button, KpiTile, PageHeader, formatDate } from '@smlxl/ui'
import { api, safe } from '@/lib/api.server'
import { DEFAULT_PERIOD, PERIOD_COOKIE, isPeriodKey, periodLabel, periodRange } from '@/lib/period'
import { first, type SearchParams } from '@/lib/search-params'
import { PageError } from '@/components/shared/page-error'
import { AttentionList } from './attention-list'
import { CaptureQuality } from './capture-quality'
import { KpiTables } from './kpi-tables'
import { WeeklyTrend } from './weekly-trend'
import { RecentMeetings } from './recent-meetings'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Inicio' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const periodCookie = cookieStore.get(PERIOD_COOKIE)?.value
  const period = isPeriodKey(periodCookie) ? periodCookie : DEFAULT_PERIOD
  const range = periodRange(period)
  const areaId = first(sp, 'areaId')
  const projectId = first(sp, 'projectId')
  const result = await safe(
    api.get<DashboardDto>('/dashboard', { query: { ...range, areaId, projectId } }),
  )

  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Panorama" title="Inicio" description={periodLabel(period)} />
        <PageError error={result.error} retryHref="/inicio" />
      </>
    )
  }
  const d = result.data
  const k = d.kpis

  return (
    <>
      <PageHeader
        eyebrow="Panorama"
        title="Inicio"
        description={
          <>
            {periodLabel(period)} · {formatDate(d.period.from)} – {formatDate(d.period.to)}. Los
            KPIs se derivan de fechas y estados; nunca se capturan a mano.
          </>
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/pendientes?view=overdue">Ver vencidos</Link>
          </Button>
        }
      />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        <KpiTile
          label="Total abiertos"
          value={k.totalOpen}
          icon={ClipboardList}
          href="/pendientes"
        />
        <KpiTile
          label="Completadas en período"
          value={k.completedInPeriod}
          icon={CheckCircle2}
          tone="success"
          href="/pendientes?view=completed"
        />
        <KpiTile
          label="En proceso"
          value={k.inProgress}
          icon={Timer}
          tone="info"
          href="/pendientes?status=IN_PROGRESS"
        />
        <KpiTile
          label="Pendientes"
          value={k.pending}
          icon={Hourglass}
          href="/pendientes?status=PENDING"
        />
        <KpiTile
          label="Propuestas de cierre"
          value={k.completionProposed}
          icon={ClipboardCheck}
          tone="signal"
          hint="Esperan aprobación"
          href="/pendientes?view=proposed"
        />
        <KpiTile
          label="% avance"
          value={`${Math.round(k.progressPct)}`}
          suffix="%"
          icon={Percent}
          tone={k.progressPct >= 70 ? 'success' : k.progressPct >= 40 ? 'warning' : 'danger'}
        />
        <KpiTile
          label="Vencidas"
          value={k.overdue}
          icon={AlertTriangle}
          tone={k.overdue > 0 ? 'danger' : 'neutral'}
          href="/pendientes?view=overdue"
        />
        <KpiTile
          label="Sin fecha"
          value={k.noDueDate}
          icon={CalendarX2}
          tone={k.noDueDate > 0 ? 'warning' : 'neutral'}
          href="/pendientes?view=noDueDate"
        />
        <KpiTile
          label="Reuniones procesadas / detectadas"
          value={`${k.meetingsProcessed} / ${k.meetingsDetected}`}
          icon={Radio}
          tone="ai"
          hint={
            k.meetingsDetected > 0
              ? `${Math.round((k.meetingsProcessed / k.meetingsDetected) * 100)}% con análisis`
              : 'Sin reuniones detectadas'
          }
          href="/reuniones"
          className="col-span-2 md:col-span-1"
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AttentionList items={d.needsAttention} />
        <CaptureQuality data={d.captureQuality} />
      </div>

      <div className="mt-6">
        <WeeklyTrend data={d.weeklyTrend} />
      </div>

      <div className="mt-6">
        <KpiTables
          byArea={d.byArea}
          byPerson={d.byPerson}
          areaId={areaId ?? null}
          projectId={projectId ?? null}
          periodLabel={periodLabel(period)}
        />
      </div>

      <div className="mt-6">
        <RecentMeetings meetings={d.recentMeetings} />
      </div>
    </>
  )
}
