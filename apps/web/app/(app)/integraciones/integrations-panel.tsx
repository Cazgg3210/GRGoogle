'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Activity, CalendarSync, FlaskConical, RefreshCw, Sheet as SheetIcon, Sparkles, Webhook } from 'lucide-react'
import type { GoogleStatusDto, SheetsSyncResultDto } from '@smlxl/contracts'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FEATURE_FLAG_META,
  INBOUND_EVENT_STATUS_LABELS,
  InlineNotice,
  KpiTile,
  RelativeDate,
  SUBSCRIPTION_STATE_LABELS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  formatCurrencyUsd,
  formatDateTime,
  formatNumber,
  labelFor,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'

export function IntegrationsPanel({ initial }: { initial: GoogleStatusDto }) {
  const query = useQuery({
    queryKey: qk.googleStatus,
    queryFn: () => clientApi.get<GoogleStatusDto>('/integrations/google/status'),
    initialData: initial,
    refetchInterval: 30_000,
  })
  const s = query.data
  const [simulated, setSimulated] = React.useState<string | null>(null)

  const syncSubs = useApiMutation<GoogleStatusDto>({
    mutationFn: () => clientApi.post<GoogleStatusDto>('/integrations/google/subscriptions/sync'),
    successMessage: 'Suscripciones sincronizadas',
    invalidate: [qk.googleStatus],
  })
  const syncCal = useApiMutation<{ queued: boolean }>({
    mutationFn: () => clientApi.post('/integrations/google/calendar/sync'),
    successMessage: 'Sincronización de calendarios encolada',
    invalidate: [qk.googleStatus],
  })
  const simulate = useApiMutation<{ queued: boolean; meetingId: string }>({
    mutationFn: () => clientApi.post('/integrations/simulate/meeting-ended', {}),
    successMessage: 'Reunión simulada; el pipeline fake está corriendo',
    invalidate: [qk.googleStatus, ['meetings'], ['dashboard']],
    onSuccess: (r) => setSimulated(r.meetingId),
  })
  const syncSheets = useApiMutation<SheetsSyncResultDto>({
    mutationFn: () => clientApi.post<SheetsSyncResultDto>('/integrations/google/sheets/sync', { dryRun: false }),
    successMessage: (d) => `Sheets: ${d.pendientes.inserted + d.reuniones.inserted} nuevas, ${d.pendientes.updated + d.reuniones.updated} actualizadas`,
    refresh: false,
  })

  const fake = s.mode === 'FAKE'

  return (
    <div className="flex flex-col gap-6">
      <div className={cn('flex flex-wrap items-center gap-4 rounded-xl border p-5', fake ? 'border-warning-300 bg-warning-50' : 'border-success-300 bg-success-50')}>
        <span className={cn('flex size-10 items-center justify-center rounded-md', fake ? 'bg-warning-200 text-warning-900' : 'bg-success-200 text-success-900')}>
          {fake ? <FlaskConical className="size-5" /> : <Activity className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{fake ? 'Modo FAKE: sin llamadas reales a Google' : 'Modo REAL: conectado a Google Workspace'}</p>
          <p className="text-xs text-muted-foreground">
            {fake
              ? 'Los adapters simulan eventos, artefactos y análisis. Activa GOOGLE_INTEGRATION_ENABLED con credenciales para pasar a real.'
              : 'Los eventos de Meet llegan por Pub/Sub; los artefactos se leen con la cuenta de servicio delegada.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => syncSubs.mutate()} loading={syncSubs.isPending}>
            <Webhook />
            Sincronizar suscripciones
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncCal.mutate()} loading={syncCal.isPending}>
            <CalendarSync />
            Sincronizar calendarios
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncSheets.mutate()} loading={syncSheets.isPending}>
            <SheetIcon />
            Sincronizar Sheets
          </Button>
          {fake ? (
            <Button size="sm" variant="accent" onClick={() => simulate.mutate()} loading={simulate.isPending}>
              <FlaskConical />
              Simular reunión terminada
            </Button>
          ) : null}
        </div>
      </div>

      {simulated ? (
        <InlineNotice tone="ai" icon={Sparkles} title="Reunión simulada creada">
          <Link href={`/reuniones/${simulated}`} className="underline">
            Abrir la reunión producida
          </Link>{' '}
          — el análisis fake tarda unos segundos; refresca la página de la reunión.
        </InlineNotice>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {(Object.keys(s.flags) as Array<keyof GoogleStatusDto['flags']>).map((flag) => {
          const on = s.flags[flag]
          const meta = FEATURE_FLAG_META[flag]
          return (
            <div key={flag} className={cn('rounded-lg border px-3 py-2.5', on ? 'border-success-200 bg-success-50/60' : 'border-border bg-surface')} title={meta?.description}>
              <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{meta?.label ?? flag}</p>
              <p className="mt-1">
                <Badge tone={on ? 'success' : 'neutral'} dot>
                  {on ? 'Activo' : 'Apagado'}
                </Badge>
              </p>
            </div>
          )
        })}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile label="Ejecuciones IA" value={s.aiUsage.runs} icon={Sparkles} tone="ai" />
        <KpiTile label="Tokens entrada" value={formatNumber(s.aiUsage.inputTokens)} />
        <KpiTile label="Tokens salida" value={formatNumber(s.aiUsage.outputTokens)} />
        <KpiTile label="Costo estimado" value={formatCurrencyUsd(s.aiUsage.estimatedCostUsd)} />
        <KpiTile label="Fallos IA" value={s.aiUsage.failures} tone={s.aiUsage.failures > 0 ? 'danger' : 'neutral'} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Suscripciones de Workspace Events</CardTitle>
            <span className="text-xs text-muted-foreground">Una por cuenta monitoreada; se renuevan automáticamente.</span>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {s.subscriptions.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact title="Sin suscripciones" description="Usa “Sincronizar suscripciones” para crearlas para los usuarios monitoreados." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Usuario</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead>Última renovación</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.subscriptions.map((sub) => {
                    const meta = labelFor(SUBSCRIPTION_STATE_LABELS, sub.state)
                    const expiring = new Date(sub.expiresAt).getTime() - Date.now() < 24 * 3600_000
                    return (
                      <TableRow key={sub.subscriptionName}>
                        <TableCell className="text-sm">
                          {sub.userEmail}
                          <span className="block truncate font-mono text-[10px] text-muted-foreground" title={sub.subscriptionName}>
                            {sub.subscriptionName}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className={cn('text-xs', expiring && 'font-semibold text-warning-800')}>
                          <RelativeDate value={sub.expiresAt} withTime />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sub.lastRenewedAt ? formatDateTime(sub.lastRenewedAt) : '—'}</TableCell>
                        <TableCell className="font-mono text-[11px] text-danger-700">{sub.lastErrorCode ?? ''}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="xs" onClick={() => syncSubs.mutate()} loading={syncSubs.isPending}>
                            <RefreshCw />
                            Renovar
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cursores de Calendar</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {s.calendarCursors.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact title="Sin cursores" description="Aparecen tras la primera sincronización de calendarios." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Usuario</TableHead>
                    <TableHead>Calendario</TableHead>
                    <TableHead>Incremental</TableHead>
                    <TableHead>Completa</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.calendarCursors.map((c) => (
                    <TableRow key={`${c.userEmail}-${c.calendarId}`}>
                      <TableCell className="text-sm">{c.userEmail}</TableCell>
                      <TableCell className="font-mono text-xs">{c.calendarId}</TableCell>
                      <TableCell className="text-xs">
                        <RelativeDate value={c.lastIncrementalSyncAt} withTime />
                      </TableCell>
                      <TableCell className="text-xs">
                        <RelativeDate value={c.lastFullSyncAt} withTime />
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-danger-700" title={c.lastError ?? undefined}>
                        {c.lastError ?? ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos entrantes recientes (Pub/Sub)</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {s.recentEvents.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState compact title="Sin eventos" description="Los eventos de Meet aparecerán aquí conforme lleguen (o al simular en modo fake)." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Recibido</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Intentos</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.recentEvents.map((e) => {
                  const meta = labelFor(INBOUND_EVENT_STATUS_LABELS, e.processingStatus)
                  return (
                    <TableRow key={e.cloudEventId}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(e.receivedAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{e.type.replace('google.workspace.meet.', '')}</TableCell>
                      <TableCell className="max-w-[160px] truncate font-mono text-[11px] text-muted-foreground" title={e.cloudEventId}>
                        {e.cloudEventId}
                      </TableCell>
                      <TableCell>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{e.attempts}</TableCell>
                      <TableCell className="font-mono text-[11px] text-danger-700">{e.lastErrorCode ?? ''}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
