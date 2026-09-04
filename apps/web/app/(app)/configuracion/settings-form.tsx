'use client'

import * as React from 'react'
import Link from 'next/link'
import type { PlatformSettingsDto } from '@smlxl/contracts'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfidenceIndicator,
  FEATURE_FLAG_META,
  Field,
  InlineNotice,
  Input,
  Switch,
  Textarea,
  cn,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'

type Flags = PlatformSettingsDto['featureFlags']

export function SettingsForm({ initial }: { initial: PlatformSettingsDto }) {
  const [s, setS] = React.useState<PlatformSettingsDto>(initial)
  const [emails, setEmails] = React.useState(initial.monitoredUserEmails.join('\n'))
  React.useEffect(() => {
    setS(initial)
    setEmails(initial.monitoredUserEmails.join('\n'))
  }, [initial])

  const save = useApiMutation<PlatformSettingsDto, PlatformSettingsDto>({
    mutationFn: (body) => clientApi.put<PlatformSettingsDto>('/admin/settings', body),
    successMessage: 'Configuración guardada',
    invalidate: [qk.settings, qk.googleStatus],
    onSuccess: (d) => {
      setS(d)
      setEmails(d.monitoredUserEmails.join('\n'))
    },
  })

  const thresholdsInvalid = !(s.confidenceThresholds.proposal < s.confidenceThresholds.autoAccept)
  const emailList = emails
    .split(/[\n,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const badEmails = emailList.filter((e) => !e.endsWith(`@${s.companyDomain}`))
  const dirty = JSON.stringify({ ...s, monitoredUserEmails: emailList }) !== JSON.stringify(initial)

  const setFlag = (k: keyof Flags, v: boolean) =>
    setS((c) => ({ ...c, featureFlags: { ...c.featureFlags, [k]: v } }))

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Feature flags</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Toda automatización puede deshabilitarse. Apagar un flag no borra datos; sólo detiene
              la integración.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(Object.keys(s.featureFlags) as Array<keyof Flags>).map((k) => {
              const meta = FEATURE_FLAG_META[k]
              const on = s.featureFlags[k]
              return (
                <label
                  key={k}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-md border p-3 transition-colors',
                    on ? 'border-success-200 bg-success-50/50' : 'border-border',
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium">{meta?.label ?? k}</span>
                    <span className="block text-xs text-muted-foreground">{meta?.description}</span>
                    <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                      {k}
                    </span>
                  </span>
                  <Switch
                    checked={on}
                    onCheckedChange={(v) => setFlag(k, v)}
                    aria-label={meta?.label ?? k}
                  />
                </label>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Umbrales de confianza IA</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              ≥ auto-aceptar: se crea como Pendiente. ≥ propuesta y &lt; auto-aceptar: se crea como
              Propuesto. &lt; propuesta: va a Revisión IA.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Umbral de propuesta" htmlFor="th-proposal" hint="0 – 1">
                <Input
                  id="th-proposal"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={s.confidenceThresholds.proposal}
                  onChange={(e) =>
                    setS((c) => ({
                      ...c,
                      confidenceThresholds: {
                        ...c.confidenceThresholds,
                        proposal: Number(e.target.value),
                      },
                    }))
                  }
                  aria-invalid={thresholdsInvalid}
                />
              </Field>
              <Field
                label="Umbral de auto-aceptación"
                htmlFor="th-auto"
                hint="0 – 1, debe ser mayor que el de propuesta"
              >
                <Input
                  id="th-auto"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={s.confidenceThresholds.autoAccept}
                  onChange={(e) =>
                    setS((c) => ({
                      ...c,
                      confidenceThresholds: {
                        ...c.confidenceThresholds,
                        autoAccept: Number(e.target.value),
                      },
                    }))
                  }
                  aria-invalid={thresholdsInvalid}
                />
              </Field>
            </div>
            {thresholdsInvalid ? (
              <InlineNotice tone="danger">
                El umbral de propuesta debe ser menor que el de auto-aceptación.
              </InlineNotice>
            ) : null}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span>Ejemplo de bandas:</span>
              <ConfidenceIndicator
                value={0.95}
                thresholds={s.confidenceThresholds}
                variant="inline"
              />
              <ConfidenceIndicator
                value={(s.confidenceThresholds.proposal + s.confidenceThresholds.autoAccept) / 2}
                thresholds={s.confidenceThresholds}
                variant="inline"
              />
              <ConfidenceIndicator
                value={Math.max(0, s.confidenceThresholds.proposal - 0.1)}
                thresholds={s.confidenceThresholds}
                variant="inline"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Empresa y captura</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Zona horaria" htmlFor="cf-tz">
              <Input
                id="cf-tz"
                value={s.companyTimezone}
                onChange={(e) => setS((c) => ({ ...c, companyTimezone: e.target.value }))}
              />
            </Field>
            <Field
              label="Dominio corporativo"
              htmlFor="cf-domain"
              hint="Sólo cuentas de este dominio pueden iniciar sesión."
            >
              <Input
                id="cf-domain"
                value={s.companyDomain}
                onChange={(e) => setS((c) => ({ ...c, companyDomain: e.target.value }))}
              />
            </Field>
            <Field
              label="Retención de transcripciones crudas (días)"
              htmlFor="cf-ret"
              hint="Vacío = sin borrado automático. La evidencia de cada compromiso se conserva siempre."
            >
              <Input
                id="cf-ret"
                type="number"
                min={1}
                value={s.rawTranscriptRetentionDays ?? ''}
                onChange={(e) =>
                  setS((c) => ({
                    ...c,
                    rawTranscriptRetentionDays: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </Field>
            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Auto-captura de reuniones</span>
                <span className="block text-xs text-muted-foreground">
                  Detectar reuniones de las cuentas monitoreadas sin intervención manual.
                </span>
              </span>
              <Switch
                checked={s.autoCaptureEnabled}
                onCheckedChange={(v) => setS((c) => ({ ...c, autoCaptureEnabled: v }))}
              />
            </label>
            <Field
              label="Cuentas monitoreadas"
              htmlFor="cf-emails"
              hint="Un correo por línea. Cada una recibe suscripción de eventos de Meet y sincronización de Calendar."
              error={badEmails.length ? `Fuera del dominio: ${badEmails.join(', ')}` : undefined}
            >
              <Textarea
                id="cf-emails"
                rows={8}
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              El digest semanal se configura en{' '}
              <Link href="/reportes" className="text-info-700 hover:underline">
                Reportes
              </Link>
              .
            </p>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setS(initial)
              setEmails(initial.monitoredUserEmails.join('\n'))
            }}
            disabled={!dirty || save.isPending}
          >
            Descartar
          </Button>
          <Button
            onClick={() => save.mutate({ ...s, monitoredUserEmails: emailList })}
            loading={save.isPending}
            disabled={thresholdsInvalid || badEmails.length > 0 || !dirty}
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  )
}
