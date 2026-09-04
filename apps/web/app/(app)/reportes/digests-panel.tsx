'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Play } from 'lucide-react'
import type { WeeklyDigestDto } from '@smlxl/contracts'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatDate,
  formatDateTime,
  toLocalDateString,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'

export function DigestsPanel({
  digests,
  canGenerate,
}: {
  digests: WeeklyDigestDto[]
  canGenerate: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [weekOf, setWeekOf] = React.useState(toLocalDateString())
  const generate = useApiMutation<WeeklyDigestDto, string>({
    mutationFn: (date) =>
      clientApi.post<WeeklyDigestDto>('/reports/weekly/generate', { weekOf: date }),
    successMessage: (d) => `Digest ${d.weekLabel} generado (v${d.version})`,
    invalidate: [qk.digests],
    onSuccess: (d) => {
      setOpen(false)
      router.push(`/reportes/${d.id}`)
    },
  })
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Digest semanal</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada generación crea una versión nueva; el envío queda registrado con destinatarios.
          </p>
        </div>
        {canGenerate ? (
          <Button onClick={() => setOpen(true)}>
            <Play />
            Generar ahora
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {digests.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              compact
              icon={FileText}
              title="Aún no hay digests"
              description="Genera el primero para la semana en curso o una anterior."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Semana</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>Audiencia</TableHead>
                <TableHead>Generado</TableHead>
                <TableHead>Envío</TableHead>
                <TableHead className="text-right">Versión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {digests.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link
                      href={`/reportes/${d.id}`}
                      className="font-mono text-sm font-medium text-info-700 hover:underline"
                    >
                      {d.weekLabel}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(d.weekStart)} – {formatDate(d.weekEnd)}
                  </TableCell>
                  <TableCell>
                    <Badge>{d.audience}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDateTime(d.generatedAt)}
                  </TableCell>
                  <TableCell>
                    {d.sentAt ? (
                      <span className="text-xs">
                        <Badge tone="success">Enviado</Badge>{' '}
                        <span className="text-muted-foreground">
                          {formatDateTime(d.sentAt)} · {d.recipientEmails.length} dest.
                        </span>
                      </span>
                    ) : (
                      <Badge tone="neutral">Sin enviar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">v{d.version}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Generar digest</DialogTitle>
            <DialogDescription>
              Elige cualquier fecha dentro de la semana deseada; la semana ISO se calcula
              automáticamente.
            </DialogDescription>
          </DialogHeader>
          <Field label="Semana de" htmlFor="dg-week">
            <Input
              id="dg-week"
              type="date"
              value={weekOf}
              onChange={(e) => setWeekOf(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={generate.isPending}
              onClick={() => generate.mutate(weekOf)}
              disabled={!weekOf}
            >
              Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
