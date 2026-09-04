'use client'

import * as React from 'react'
import type { AreaDto, UserDto, WeeklyDigestConfigDto } from '@smlxl/contracts'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  InlineNotice,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  formatDateTime,
  formatWeekday,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'

const DAYS = [5, 6, 0, 1, 2, 3, 4]

export function DigestConfigForm({
  initial,
  users,
  areas,
  readOnly,
}: {
  initial: WeeklyDigestConfigDto
  users: UserDto[]
  areas: AreaDto[]
  readOnly: boolean
}) {
  const [cfg, setCfg] = React.useState<WeeklyDigestConfigDto>(initial)
  React.useEffect(() => setCfg(initial), [initial])
  const save = useApiMutation<WeeklyDigestConfigDto, WeeklyDigestConfigDto>({
    mutationFn: (c) => {
      const { nextRunAt: _next, ...body } = c
      return clientApi.put<WeeklyDigestConfigDto>('/reports/weekly/config', body)
    },
    successMessage: 'Configuración del digest guardada',
    invalidate: [qk.digestConfig],
    onSuccess: (d) => setCfg(d),
  })
  const set = <K extends keyof WeeklyDigestConfigDto>(key: K, value: WeeklyDigestConfigDto[K]) =>
    setCfg((c) => ({ ...c, [key]: value }))
  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  const allAreas = cfg.includeAreaIds === null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración del digest</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Próximo envío:{' '}
          <span className="font-medium text-foreground">
            {cfg.nextRunAt ? formatDateTime(cfg.nextRunAt) : 'no programado'}
          </span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {readOnly ? (
          <InlineNotice tone="neutral">
            Sólo lectura: se requiere permiso de configuración para editar.
          </InlineNotice>
        ) : null}
        <fieldset disabled={readOnly} className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Digest habilitado</p>
              <p className="text-xs text-muted-foreground">
                Además del flag WEEKLY_DIGEST_ENABLED.
              </p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Día" htmlFor="dc-day" hint="Viernes o sábado recomendado.">
              <Select
                value={String(cfg.dayOfWeek)}
                onValueChange={(v) => set('dayOfWeek', Number(v))}
              >
                <SelectTrigger id="dc-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {formatWeekday(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Hora local" htmlFor="dc-time">
              <Input
                id="dc-time"
                type="time"
                value={cfg.localTime}
                onChange={(e) => set('localTime', e.target.value)}
              />
            </Field>
            <Field label="Zona horaria" htmlFor="dc-tz">
              <Input
                id="dc-tz"
                value={cfg.timezone}
                onChange={(e) => set('timezone', e.target.value)}
                placeholder="America/Mexico_City"
              />
            </Field>
          </div>

          <Field
            label="Destinatarios"
            hint="Normalmente gerente + gestora. Se toman del directorio; sin correos hardcodeados."
          >
            <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 scrollbar-thin">
              {users.filter((u) => u.active).length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  No se pudo cargar el directorio.
                </p>
              ) : (
                users
                  .filter((u) => u.active)
                  .map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-paper-100"
                    >
                      <Checkbox
                        checked={cfg.recipientUserIds.includes(u.id)}
                        onCheckedChange={() =>
                          set('recipientUserIds', toggleId(cfg.recipientUserIds, u.id))
                        }
                      />
                      <span className="flex-1 truncate">{u.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                    </label>
                  ))
              )}
            </div>
          </Field>

          <Field label="Áreas incluidas">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allAreas}
                onCheckedChange={(v) => set('includeAreaIds', v ? null : [])}
              />
              Todas las áreas
            </label>
            {!allAreas ? (
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-border p-2">
                {areas
                  .filter((a) => a.active)
                  .map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(cfg.includeAreaIds ?? []).includes(a.id)}
                        onCheckedChange={() =>
                          set('includeAreaIds', toggleId(cfg.includeAreaIds ?? [], a.id))
                        }
                      />
                      {a.name}
                    </label>
                  ))}
              </div>
            ) : null}
          </Field>

          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              Incluir tareas de externos
              <Switch
                checked={cfg.includeExternalTasks}
                onCheckedChange={(v) => set('includeExternalTasks', v)}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              Adjuntar hoja de seguimiento
              <Switch
                checked={cfg.attachSpreadsheet}
                onCheckedChange={(v) => set('attachSpreadsheet', v)}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              Enviar por correo (Gmail)
              <Switch checked={cfg.sendEmail} onCheckedChange={(v) => set('sendEmail', v)} />
            </label>
          </div>
        </fieldset>
        {!readOnly ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCfg(initial)} disabled={save.isPending}>
              Descartar
            </Button>
            <Button onClick={() => save.mutate(cfg)} loading={save.isPending}>
              Guardar configuración
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
