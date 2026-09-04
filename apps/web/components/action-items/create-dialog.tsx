'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { ActionItemDetailDto } from '@smlxl/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { ActionItemForm, type ActionItemFormSubmit } from './action-item-form'

export function CreateActionItemDialog({
  meetingId,
  trigger,
}: {
  meetingId?: string | null
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const create = useApiMutation<ActionItemDetailDto, ActionItemFormSubmit>({
    mutationFn: (values) =>
      clientApi.post<ActionItemDetailDto>('/action-items', {
        ...values,
        meetingId: meetingId ?? null,
      }),
    successMessage: (d) => `Pendiente ${d.externalKey} creado`,
    invalidate: [['action-items'], ['dashboard']],
    onSuccess: (d) => {
      setOpen(false)
      router.push(`/pendientes/${d.id}`)
    },
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <div onClick={() => setOpen(true)}>{trigger}</div>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus />
          Nuevo pendiente
        </Button>
      )}
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nuevo pendiente</DialogTitle>
          <DialogDescription>
            Se crea como “Pendiente” con origen manual{meetingId ? ' vinculado a esta reunión' : ''}
            . La IA no lo modificará sin revisión.
          </DialogDescription>
        </DialogHeader>
        <ActionItemForm
          onSubmit={(v) => create.mutate(v)}
          onCancel={() => setOpen(false)}
          loading={create.isPending}
          submitLabel="Crear pendiente"
        />
      </DialogContent>
    </Dialog>
  )
}
