'use client'

import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ManualMeetingBodySchema, type MeetingDetailDto } from '@smlxl/contracts'
import {
  Button,
  CONFIDENTIALITY_LABELS,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { useApiMutation } from '@/lib/use-api-mutation'

const FormSchema = z.object({
  title: z.string().min(3, 'Mínimo 3 caracteres').max(300),
  startAt: z.string().min(1, 'Indica fecha y hora'),
  endAt: z.string().optional(),
  organizerEmail: z.string().email('Correo inválido').optional().or(z.literal('')),
  participantEmails: z.string().optional(),
  transcriptText: z
    .string()
    .min(20, 'La transcripción debe tener al menos 20 caracteres')
    .max(500000),
  smartNotesText: z.string().max(100000).optional(),
  confidentialityLevel: z.enum(['NORMAL', 'RESTRICTED', 'LEGAL', 'EXECUTIVE']).default('NORMAL'),
})
type FormValues = z.input<typeof FormSchema>

/** datetime-local (hora local del navegador) → ISO con offset. */
function localToIso(value: string): string {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export function ManualMeetingForm() {
  const router = useRouter()
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: '',
      startAt: '',
      endAt: '',
      organizerEmail: '',
      participantEmails: '',
      transcriptText: '',
      smartNotesText: '',
      confidentialityLevel: 'NORMAL',
    },
  })
  const create = useApiMutation<MeetingDetailDto, z.infer<typeof ManualMeetingBodySchema>>({
    mutationFn: (body) => clientApi.post<MeetingDetailDto>('/meetings/manual', body),
    successMessage: 'Reunión importada; el análisis se ejecuta en segundo plano',
    invalidate: [['meetings'], ['dashboard']],
    onSuccess: (m) => router.push(`/reuniones/${m.id}`),
  })
  const { register, handleSubmit, control, formState } = form
  const errors = formState.errors

  return (
    <Card className="max-w-4xl">
      <CardContent className="pt-5">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={handleSubmit((v) => {
            const parsed = ManualMeetingBodySchema.safeParse({
              title: v.title.trim(),
              startAt: localToIso(v.startAt),
              endAt: v.endAt ? localToIso(v.endAt) : null,
              organizerEmail: v.organizerEmail ? v.organizerEmail.trim() : undefined,
              participantEmails: (v.participantEmails ?? '')
                .split(/[,\n;]/)
                .map((s) => s.trim())
                .filter(Boolean),
              transcriptText: v.transcriptText,
              smartNotesText: v.smartNotesText?.trim() ? v.smartNotesText : null,
              confidentialityLevel: v.confidentialityLevel ?? 'NORMAL',
            })
            if (!parsed.success) {
              const issue = parsed.error.issues[0]
              toast.error('Datos inválidos', {
                description: issue ? `${issue.path.join('.')}: ${issue.message}` : undefined,
              })
              return
            }
            create.mutate(parsed.data)
          })}
        >
          <Field label="Título" htmlFor="m-title" required error={errors.title?.message}>
            <Input
              id="m-title"
              {...register('title')}
              placeholder="Seguimiento contrato Cliente Alfa"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Inicio" htmlFor="m-start" required error={errors.startAt?.message}>
              <Input id="m-start" type="datetime-local" {...register('startAt')} />
            </Field>
            <Field label="Fin" htmlFor="m-end" error={errors.endAt?.message}>
              <Input id="m-end" type="datetime-local" {...register('endAt')} />
            </Field>
            <Field label="Confidencialidad" htmlFor="m-conf">
              <Controller
                control={control}
                name="confidentialityLevel"
                render={({ field }) => (
                  <Select value={field.value ?? 'NORMAL'} onValueChange={field.onChange}>
                    <SelectTrigger id="m-conf">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(CONFIDENTIALITY_LABELS) as Array<
                          keyof typeof CONFIDENTIALITY_LABELS
                        >
                      ).map((k) => (
                        <SelectItem key={k} value={k}>
                          {CONFIDENTIALITY_LABELS[k].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Correo del organizador"
              htmlFor="m-org"
              error={errors.organizerEmail?.message}
              hint="Si es externo al dominio, la reunión se marca como host externo."
            >
              <Input
                id="m-org"
                type="email"
                {...register('organizerEmail')}
                placeholder="gestora@smlxl.mx"
              />
            </Field>
            <Field
              label="Participantes"
              htmlFor="m-part"
              hint="Correos separados por coma o salto de línea."
            >
              <Textarea
                id="m-part"
                rows={2}
                {...register('participantEmails')}
                placeholder="carlos@smlxl.mx, andres@smlxl.mx"
              />
            </Field>
          </div>
          <Field
            label="Transcripción"
            htmlFor="m-transcript"
            required
            error={errors.transcriptText?.message}
            hint="Formato libre. Recomendado: una línea por intervención “Nombre: texto”. Se conservará como evidencia."
          >
            <Textarea
              id="m-transcript"
              rows={14}
              className="font-mono text-xs"
              {...register('transcriptText')}
              placeholder={
                'Carlos Martínez: Yo envío la carta el próximo martes.\nAndrés López: Perfecto, entonces queda pendiente…'
              }
            />
          </Field>
          <Field
            label="Smart Notes (opcional)"
            htmlFor="m-notes"
            error={errors.smartNotesText?.message}
          >
            <Textarea id="m-notes" rows={5} {...register('smartNotesText')} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Importar y analizar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
