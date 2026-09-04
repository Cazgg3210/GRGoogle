'use client'

import * as React from 'react'
import { Sheet as SheetIcon, RefreshCw } from 'lucide-react'
import type { SheetsSyncResultDto } from '@smlxl/contracts'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  InlineNotice,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  SegmentedList,
  SegmentedTrigger,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

function PreviewTable({ table }: { table: { columns: string[]; rows: Array<Record<string, unknown>> } }) {
  if (table.rows.length === 0) return <EmptyState compact title="Sin filas" />
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-border scrollbar-thin">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {table.columns.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((r, i) => (
            <TableRow key={i}>
              {table.columns.map((c) => (
                <TableCell key={c} className="max-w-[260px] truncate text-xs" title={cell(r[c])}>
                  {cell(r[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function SheetsPanel({ compact }: { compact?: boolean }) {
  const [result, setResult] = React.useState<SheetsSyncResultDto | null>(null)
  const [wasDry, setWasDry] = React.useState(true)
  const [confirm, setConfirm] = React.useState(false)
  const [tab, setTab] = React.useState<'pendientes' | 'reuniones'>('pendientes')
  const sync = useApiMutation<SheetsSyncResultDto, boolean>({
    mutationFn: (dryRun) => clientApi.post<SheetsSyncResultDto>('/integrations/google/sheets/sync', { dryRun }),
    successMessage: (d, dryRun) =>
      dryRun ? 'Vista previa generada (sin escribir en la hoja)' : `Sincronizado: ${d.pendientes.inserted + d.reuniones.inserted} nuevas, ${d.pendientes.updated + d.reuniones.updated} actualizadas`,
    refresh: false,
    onSuccess: (d, dryRun) => {
      setResult(d)
      setWasDry(dryRun)
      setConfirm(false)
    },
  })
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="inline-flex items-center gap-2">
            <SheetIcon className="size-4 text-success-600" />
            Google Sheets
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Exporta pendientes y reuniones a la hoja de seguimiento. Cada fila se identifica por clave, nunca por posición.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => sync.mutate(true)} loading={sync.isPending && sync.variables === true}>
            Vista previa
          </Button>
          <Button size="sm" onClick={() => setConfirm(true)} loading={sync.isPending && sync.variables === false}>
            <RefreshCw />
            Sincronizar
          </Button>
        </div>
      </CardHeader>
      {result ? (
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={wasDry ? 'info' : 'success'}>{wasDry ? 'Dry-run' : 'Escrito en la hoja'}</Badge>
            <span>
              Pendientes: <span className="font-mono">{result.pendientes.inserted}</span> nuevas · <span className="font-mono">{result.pendientes.updated}</span> actualizadas
            </span>
            <span>
              Reuniones: <span className="font-mono">{result.reuniones.inserted}</span> nuevas · <span className="font-mono">{result.reuniones.updated}</span> actualizadas
            </span>
            {result.spreadsheetId ? (
              <a href={`https://docs.google.com/spreadsheets/d/${result.spreadsheetId}`} target="_blank" rel="noreferrer" className="ml-auto text-info-700 hover:underline">
                Abrir hoja
              </a>
            ) : (
              <span className="ml-auto text-muted-foreground">Sin GOOGLE_SHEETS_SPREADSHEET_ID (modo fake)</span>
            )}
          </div>
          {!compact ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'pendientes' | 'reuniones')}>
              <SegmentedList>
                <SegmentedTrigger value="pendientes">Pendientes ({result.preview.pendientes.rows.length})</SegmentedTrigger>
                <SegmentedTrigger value="reuniones">Reuniones ({result.preview.reuniones.rows.length})</SegmentedTrigger>
              </SegmentedList>
              <div className="mt-3">{tab === 'pendientes' ? <PreviewTable table={result.preview.pendientes} /> : <PreviewTable table={result.preview.reuniones} />}</div>
            </Tabs>
          ) : null}
        </CardContent>
      ) : (
        <CardContent>
          <InlineNotice tone="neutral">Genera una vista previa para ver exactamente qué filas se insertarían o actualizarían antes de sincronizar.</InlineNotice>
        </CardContent>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sincronizar a Google Sheets"
        description="Se escribirán/actualizarán filas en la hoja configurada. Requiere SHEETS_SYNC_ENABLED; en modo fake sólo se simula."
        confirmLabel="Sincronizar"
        loading={sync.isPending}
        onConfirm={() => sync.mutate(false)}
      />
    </Card>
  )
}
