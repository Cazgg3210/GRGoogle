'use client'

import * as React from 'react'
import Link from 'next/link'
import type { DashboardDto } from '@smlxl/contracts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  SegmentedList,
  SegmentedTrigger,
  cn,
  formatNumber,
} from '@smlxl/ui'
import { useUrlState } from '@/lib/hooks/use-url-state'
import { CatalogSelect } from '@/components/shared/catalog-select'

type Row = DashboardDto['byArea'][number]

function KpiTable({ rows, entity, linkParam }: { rows: Row[]; entity: 'área' | 'persona'; linkParam: 'areaId' | 'ownerUserId' }) {
  if (rows.length === 0) {
    return <EmptyState compact title={`Sin datos por ${entity}`} description="No hay pendientes en el período/filtros seleccionados." />
  }
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      completed: acc.completed + r.completed,
      inProgress: acc.inProgress + r.inProgress,
      pending: acc.pending + r.pending,
      completionProposed: acc.completionProposed + r.completionProposed,
      overdue: acc.overdue + r.overdue,
    }),
    { total: 0, completed: 0, inProgress: 0, pending: 0, completionProposed: 0, overdue: 0 },
  )
  const totalPct = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{entity === 'área' ? 'Departamento' : 'Persona'}</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Completadas</TableHead>
          <TableHead className="text-right">En proceso</TableHead>
          <TableHead className="text-right">Pendientes</TableHead>
          {entity === 'área' ? <TableHead className="text-right">Prop. cierre</TableHead> : null}
          <TableHead className="text-right">Vencidas</TableHead>
          <TableHead className="w-[160px]">% avance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium">
              <Link href={`/pendientes?${linkParam}=${encodeURIComponent(r.key)}`} className="hover:underline">
                {r.label}
              </Link>
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular">{formatNumber(r.total)}</TableCell>
            <TableCell className="text-right font-mono text-xs tabular text-success-700">{formatNumber(r.completed)}</TableCell>
            <TableCell className="text-right font-mono text-xs tabular">{formatNumber(r.inProgress)}</TableCell>
            <TableCell className="text-right font-mono text-xs tabular">{formatNumber(r.pending)}</TableCell>
            {entity === 'área' ? <TableCell className="text-right font-mono text-xs tabular text-signal-700">{formatNumber(r.completionProposed)}</TableCell> : null}
            <TableCell className={cn('text-right font-mono text-xs tabular', r.overdue > 0 && 'font-semibold text-danger-700')}>{formatNumber(r.overdue)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={r.progressPct} tone={r.progressPct >= 70 ? 'success' : r.progressPct >= 40 ? 'warning' : 'danger'} className="flex-1" />
                <span className="w-9 text-right font-mono text-xs tabular">{Math.round(r.progressPct)}%</span>
              </div>
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-surface-muted/60 font-semibold hover:bg-surface-muted/60">
          <TableCell>Total</TableCell>
          <TableCell className="text-right font-mono text-xs tabular">{formatNumber(totals.total)}</TableCell>
          <TableCell className="text-right font-mono text-xs tabular">{formatNumber(totals.completed)}</TableCell>
          <TableCell className="text-right font-mono text-xs tabular">{formatNumber(totals.inProgress)}</TableCell>
          <TableCell className="text-right font-mono text-xs tabular">{formatNumber(totals.pending)}</TableCell>
          {entity === 'área' ? <TableCell className="text-right font-mono text-xs tabular">{formatNumber(totals.completionProposed)}</TableCell> : null}
          <TableCell className="text-right font-mono text-xs tabular">{formatNumber(totals.overdue)}</TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Progress value={totalPct} className="flex-1" />
              <span className="w-9 text-right font-mono text-xs tabular">{totalPct}%</span>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

export function KpiTables({
  byArea,
  byPerson,
  areaId,
  projectId,
  periodLabel,
}: {
  byArea: Row[]
  byPerson: Row[]
  areaId: string | null
  projectId: string | null
  periodLabel: string
}) {
  const url = useUrlState()
  const [tab, setTab] = React.useState<'area' | 'person'>('area')
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>KPI por departamento y por persona</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{periodLabel}. Las áreas provienen del catálogo; “Externos” es una categoría especial.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <CatalogSelect kind="areas" size="sm" value={areaId} onChange={(v) => url.set({ areaId: v })} emptyLabel="Todas las áreas" placeholder="Área" />
          </div>
          <div className="w-48">
            <CatalogSelect kind="projects" size="sm" value={projectId} onChange={(v) => url.set({ projectId: v })} emptyLabel="Todos los proyectos" placeholder="Proyecto" />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'area' | 'person')}>
            <SegmentedList>
              <SegmentedTrigger value="area">Por departamento</SegmentedTrigger>
              <SegmentedTrigger value="person">Por persona</SegmentedTrigger>
            </SegmentedList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {tab === 'area' ? <KpiTable rows={byArea} entity="área" linkParam="areaId" /> : <KpiTable rows={byPerson} entity="persona" linkParam="ownerUserId" />}
      </CardContent>
    </Card>
  )
}
