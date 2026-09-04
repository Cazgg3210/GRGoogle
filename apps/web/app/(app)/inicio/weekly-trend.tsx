'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DashboardDto } from '@smlxl/contracts'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@smlxl/ui'

type Point = DashboardDto['weeklyTrend'][number]

const SERIES = [
  { key: 'created', label: 'Nuevas', color: '#55658a', kind: 'bar' },
  { key: 'completed', label: 'Completadas (aprobadas)', color: '#33824e', kind: 'bar' },
  { key: 'openAtEnd', label: 'Pendientes fin de semana', color: '#17233b', kind: 'line' },
  { key: 'overdueAtEnd', label: 'Vencidas', color: '#b93d36', kind: 'line' },
  { key: 'closeRate', label: 'Tasa de cierre', color: '#bf5a29', kind: 'rate' },
] as const

export function WeeklyTrend({ data }: { data: Point[] }) {
  const rows = data.map((p) => ({
    ...p,
    closeRatePct: Math.round(p.closeRate * (p.closeRate <= 1 ? 100 : 1)),
  }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tendencia semanal</CardTitle>
        <p className="text-xs text-muted-foreground">
          Semanas ISO calculadas desde fechas. Barras: nuevas y completadas; líneas: pendientes y
          vencidas al cierre de semana; tasa de cierre en eje derecho.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            compact
            title="Sin semanas en el período"
            description="Amplía el periodo para ver la tendencia."
          />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#e2ddd1" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="week"
                  tickLine={false}
                  axisLine={{ stroke: '#e2ddd1' }}
                  interval="preserveStartEnd"
                />
                <YAxis yAxisId="count" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(23,35,59,0.05)' }}
                  formatter={(value: number, name: string) => {
                    const s = SERIES.find((x) => x.label === name)
                    return s?.kind === 'rate' ? [`${value}%`, name] : [value, name]
                  }}
                  labelFormatter={(label: string, payload) => {
                    const p = payload?.[0]?.payload as Point | undefined
                    return p ? `${label} · semana del ${p.weekStart}` : label
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 8 }} />
                <Bar
                  yAxisId="count"
                  dataKey="created"
                  name="Nuevas"
                  fill="#55658a"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="count"
                  dataKey="completed"
                  name="Completadas (aprobadas)"
                  fill="#33824e"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="openAtEnd"
                  name="Pendientes fin de semana"
                  stroke="#17233b"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="overdueAtEnd"
                  name="Vencidas"
                  stroke="#b93d36"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="closeRatePct"
                  name="Tasa de cierre"
                  stroke="#bf5a29"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
