import Link from 'next/link'
import { Info, Radio } from 'lucide-react'
import type { DashboardDto } from '@smlxl/contracts'
import { Card, CardContent, CardHeader, CardTitle, InlineNotice, cn, formatNumber } from '@smlxl/ui'

type CQ = DashboardDto['captureQuality']

const ROWS: Array<{ key: keyof CQ; label: string; tone: string; href?: string; help: string }> = [
  {
    key: 'withTranscript',
    label: 'Con transcript',
    tone: 'bg-success-500',
    help: 'Google publicó transcripción y se ingirió.',
  },
  {
    key: 'withSmartNotes',
    label: 'Con Smart Notes',
    tone: 'bg-success-400',
    help: 'Google publicó notas automáticas.',
  },
  {
    key: 'transcriptOnly',
    label: 'Procesadas sólo con transcript',
    tone: 'bg-info-500',
    help: 'Sin notas; el análisis usó únicamente la transcripción.',
  },
  {
    key: 'noArtifact',
    label: 'Sin artefacto',
    tone: 'bg-warning-500',
    href: '/reuniones?processingStatus=WAITING_FOR_ARTIFACTS',
    help: 'Reunión detectada pero Google no generó transcript ni notas.',
  },
  {
    key: 'externalHostUnavailable',
    label: 'Host externo / no accesible',
    tone: 'bg-signal-500',
    help: 'Organizador fuera del dominio: no se puede garantizar el artefacto.',
  },
  {
    key: 'apiErrors',
    label: 'Errores de API',
    tone: 'bg-danger-500',
    href: '/reuniones?processingStatus=FAILED',
    help: 'Fallos de Google o de IA al obtener/procesar.',
  },
]

export function CaptureQuality({ data }: { data: CQ }) {
  const detected = Math.max(1, data.detected)
  return (
    <Card className="border-ink-200 bg-gradient-to-b from-surface to-ink-50/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="inline-flex items-center gap-2">
            <Radio className="size-4 text-ai-600" />
            Calidad de captura
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuántas de las reuniones detectadas produjeron material analizable.
          </p>
        </div>
        <div className="text-right">
          <p className="display-num text-3xl leading-none text-ink-950">
            {formatNumber(data.detected)}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">detectadas</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2.5">
          {ROWS.map((r) => {
            const v = data[r.key]
            const pct = Math.round((v / detected) * 100)
            const label = r.href ? (
              <Link href={r.href} className="hover:underline">
                {r.label}
              </Link>
            ) : (
              r.label
            )
            return (
              <li key={r.key} title={r.help}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-foreground">{label}</span>
                  <span className="font-mono text-xs tabular text-muted-foreground">
                    <span className="text-foreground">{formatNumber(v)}</span> · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-200">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-700', r.tone)}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
        <InlineNotice tone="neutral" icon={Info} className="mt-1">
          “Todas las reuniones” no significa que Google haya producido artefactos para el 100%. Las
          reuniones organizadas por un host externo no garantizan transcripción ni notas, aunque
          participen cuentas monitoreadas.
        </InlineNotice>
      </CardContent>
    </Card>
  )
}
