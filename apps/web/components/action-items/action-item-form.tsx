'use client'

import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CreateActionItemBodySchema, type ActionItemDto } from '@smlxl/contracts'
import {
  Button,
  Field,
  Input,
  PRIORITY_LABELS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@smlxl/ui'
import { CatalogSelect } from '@/components/shared/catalog-select'

/** Formulario compartido crear/editar. Valida con el schema del contrato. */
const FormSchema = CreateActionItemBodySchema.omit({ meetingId: true, tags: true }).extend({
  dueDate: z.string().nullable().optional(),
  tags: z.string().optional(),
})
export type ActionItemFormValues = z.input<typeof FormSchema>

export interface ActionItemFormSubmit {
  title: string
  description: string | null
  ownerUserId: string | null
  areaId: string | null
  projectId: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate: string | null
  type: 'ONE_OFF' | 'RECURRING'
  tags: string[]
}

export function ActionItemForm({
  initial,
  onSubmit,
  onCancel,
  loading,
  submitLabel = 'Guardar',
}: {
  initial?: Partial<ActionItemDto>
  onSubmit: (values: ActionItemFormSubmit) => void
  onCancel?: () => void
  loading?: boolean
  submitLabel?: string
}) {
  const form = useForm<ActionItemFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      ownerUserId: initial?.ownerUserId ?? null,
      areaId: initial?.areaId ?? null,
      projectId: initial?.projectId ?? null,
      priority: initial?.priority ?? 'MEDIUM',
      dueDate: initial?.dueDate ?? '',
      type: initial?.type ?? 'ONE_OFF',
      tags: initial?.tags?.join(', ') ?? '',
    },
  })
  const { register, handleSubmit, control, formState } = form
  const errors = formState.errors

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          title: v.title.trim(),
          description: v.description?.trim() ? v.description.trim() : null,
          ownerUserId: v.ownerUserId ?? null,
          areaId: v.areaId ?? null,
          projectId: v.projectId ?? null,
          priority: v.priority ?? 'MEDIUM',
          dueDate: v.dueDate ? v.dueDate : null,
          type: v.type ?? 'ONE_OFF',
          tags: (v.tags ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 20),
        }),
      )}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field label="Título" htmlFor="ai-title" required error={errors.title?.message}>
        <Input id="ai-title" {...register('title')} placeholder="Ej. Enviar carta de intención al Cliente Alfa" aria-invalid={Boolean(errors.title)} />
      </Field>
      <Field label="Descripción" htmlFor="ai-desc" error={errors.description?.message}>
        <Textarea id="ai-desc" rows={3} {...register('description')} placeholder="Contexto, alcance, criterios de terminado…" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsable" htmlFor="ai-owner">
          <Controller
            control={control}
            name="ownerUserId"
            render={({ field }) => <CatalogSelect id="ai-owner" kind="users" value={field.value ?? null} onChange={field.onChange} emptyLabel="Sin responsable" />}
          />
        </Field>
        <Field label="Fecha compromiso" htmlFor="ai-due" hint="Vacío = sin fecha (se mostrará explícitamente)." error={errors.dueDate?.message}>
          <Input id="ai-due" type="date" {...register('dueDate')} />
        </Field>
        <Field label="Prioridad" htmlFor="ai-priority">
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value ?? 'MEDIUM'} onValueChange={field.onChange}>
                <SelectTrigger id="ai-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Tipo" htmlFor="ai-type">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value ?? 'ONE_OFF'} onValueChange={field.onChange}>
                <SelectTrigger id="ai-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONE_OFF">Única</SelectItem>
                  <SelectItem value="RECURRING">Recurrente</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Área" htmlFor="ai-area">
          <Controller control={control} name="areaId" render={({ field }) => <CatalogSelect id="ai-area" kind="areas" value={field.value ?? null} onChange={field.onChange} emptyLabel="Sin área" />} />
        </Field>
        <Field label="Proyecto" htmlFor="ai-project">
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => <CatalogSelect id="ai-project" kind="projects" value={field.value ?? null} onChange={field.onChange} emptyLabel="Sin proyecto" />}
          />
        </Field>
      </div>
      <Field label="Etiquetas" htmlFor="ai-tags" hint="Separadas por coma.">
        <Input id="ai-tags" {...register('tags')} placeholder="contrato, cliente-alfa" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
