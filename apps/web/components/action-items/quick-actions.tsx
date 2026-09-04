'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowRightLeft,
  Ban,
  CalendarClock,
  CheckCheck,
  ExternalLink,
  Eye,
  Flag,
  MoreHorizontal,
  UserRoundCog,
} from 'lucide-react'
import type { ActionItemDto } from '@smlxl/contracts'
import {
  Permission,
  allowedTransitions,
  canProposeCompletion,
  type ActionItemPriority,
  type ActionItemStatus,
} from '@smlxl/domain'
import {
  ACTION_ITEM_STATUS_LABELS,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Field,
  Input,
  PRIORITY_LABELS,
  Textarea,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'
import { useAppSession } from '@/components/session-context'
import { CatalogSelect } from '@/components/shared/catalog-select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

type DialogKind = null | 'owner' | 'date' | 'blocked' | 'propose' | 'cancel' | 'status'

const PRIORITIES: ActionItemPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export function ActionItemQuickActions({
  item,
  transitions,
  align = 'end',
  onChanged,
  size = 'icon-sm',
  showDetailLink = true,
}: {
  item: ActionItemDto
  /** Si no se pasa (lista), se derivan de la máquina de estados del dominio. */
  transitions?: ActionItemStatus[]
  align?: 'start' | 'end'
  onChanged?: () => void
  size?: 'icon-sm' | 'icon' | 'sm'
  showDetailLink?: boolean
}) {
  const session = useAppSession()
  const canUpdate = session.permissions.includes(Permission.ACTION_ITEM_UPDATE)
  const canReassign = session.permissions.includes(Permission.ACTION_ITEM_REASSIGN)
  const canCancel = session.permissions.includes(Permission.ACTION_ITEM_CANCEL)
  const [dialog, setDialog] = React.useState<DialogKind>(null)
  const [pendingStatus, setPendingStatus] = React.useState<ActionItemStatus | null>(null)

  const invalidate = [
    qk.actionItems(),
    qk.actionItem(item.id),
    qk.notifications,
    ['action-items'],
    ['dashboard'],
  ]

  const patch = useApiMutation<ActionItemDto, Record<string, unknown>>({
    mutationFn: (body) => clientApi.patch<ActionItemDto>(`/action-items/${item.id}`, body),
    successMessage: 'Pendiente actualizado',
    invalidate,
    onSuccess: () => {
      setDialog(null)
      onChanged?.()
    },
  })
  const propose = useApiMutation<ActionItemDto, string>({
    mutationFn: (reason) =>
      clientApi.post<ActionItemDto>(`/action-items/${item.id}/complete`, { reason }),
    successMessage: 'Cierre propuesto; requiere aprobación',
    invalidate,
    onSuccess: () => {
      setDialog(null)
      onChanged?.()
    },
  })

  const allTransitions = (transitions ?? [...allowedTransitions(item.status, 'USER')]).filter(
    (s) => s !== 'COMPLETED' && s !== 'COMPLETION_PROPOSED' && s !== 'BLOCKED' && s !== 'CANCELLED',
  )
  const canBlock = (transitions ?? allowedTransitions(item.status, 'USER')).includes('BLOCKED')
  const canCancelNow =
    canCancel && (transitions ?? allowedTransitions(item.status, 'USER')).includes('CANCELLED')
  const proposable = canProposeCompletion(item.status)
  const closed = item.status === 'COMPLETED' || item.status === 'CANCELLED'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={size}
            aria-label={`Acciones para ${item.externalKey}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
            {size === 'sm' ? 'Acciones' : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-60" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="font-mono normal-case tracking-normal">
            {item.externalKey}
          </DropdownMenuLabel>
          {canUpdate && !closed ? (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={allTransitions.length === 0}>
                  <ArrowRightLeft />
                  Cambiar estado
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {allTransitions.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onSelect={() => {
                        setPendingStatus(s)
                        setDialog('status')
                      }}
                    >
                      {ACTION_ITEM_STATUS_LABELS[s].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {canReassign ? (
                <DropdownMenuItem onSelect={() => setDialog('owner')}>
                  <UserRoundCog />
                  Cambiar responsable
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setDialog('date')}>
                <CalendarClock />
                Cambiar fecha
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Flag />
                  Prioridad
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={item.priority}
                    onValueChange={(v) => patch.mutate({ priority: v })}
                  >
                    {PRIORITIES.map((p) => (
                      <DropdownMenuRadioItem key={p} value={p}>
                        {PRIORITY_LABELS[p].label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {canBlock ? (
                <DropdownMenuItem onSelect={() => setDialog('blocked')}>
                  <Ban />
                  Marcar bloqueado
                </DropdownMenuItem>
              ) : null}
              {proposable ? (
                <DropdownMenuItem onSelect={() => setDialog('propose')}>
                  <CheckCheck />
                  Proponer cierre
                </DropdownMenuItem>
              ) : null}
              {canCancelNow ? (
                <DropdownMenuItem destructive onSelect={() => setDialog('cancel')}>
                  <Ban />
                  Cancelar pendiente
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
            </>
          ) : null}
          {showDetailLink ? (
            <DropdownMenuItem asChild>
              <Link href={`/pendientes/${item.id}`}>
                <Eye />
                Ver detalle
              </Link>
            </DropdownMenuItem>
          ) : null}
          {item.createdFromMeetingId ? (
            <DropdownMenuItem asChild>
              <Link href={`/reuniones/${item.createdFromMeetingId}`}>
                <ExternalLink />
                Abrir reunión origen
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>
              <ExternalLink />
              Sin reunión origen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <OwnerDialog
        open={dialog === 'owner'}
        onOpenChange={(o) => !o && setDialog(null)}
        current={item.ownerUserId}
        loading={patch.isPending}
        onSubmit={(ownerUserId) => patch.mutate({ ownerUserId })}
      />
      <DateDialog
        open={dialog === 'date'}
        onOpenChange={(o) => !o && setDialog(null)}
        current={item.dueDate}
        loading={patch.isPending}
        onSubmit={(dueDate) => patch.mutate({ dueDate })}
      />
      <ConfirmDialog
        open={dialog === 'blocked'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Marcar como bloqueado"
        description="Describe qué impide avanzar; quedará visible en el pendiente y en la lista."
        confirmLabel="Marcar bloqueado"
        variant="danger"
        loading={patch.isPending}
        reasonLabel="Bloqueo"
        reasonRequired
        reasonPlaceholder="Ej. Esperando firma del cliente"
        onConfirm={(reason) =>
          patch.mutate({ status: 'BLOCKED', blocker: reason, statusReason: reason })
        }
      />
      <ConfirmDialog
        open={dialog === 'propose'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Proponer cierre"
        description="El pendiente pasará a “Cierre propuesto”. Una persona con permiso deberá aprobarlo para marcarlo como completado."
        confirmLabel="Proponer cierre"
        variant="accent"
        loading={propose.isPending}
        reasonLabel="Motivo / evidencia"
        reasonRequired
        reasonPlaceholder="Ej. Se envió la carta el 2 de septiembre; adjunto en correo."
        onConfirm={(reason) => propose.mutate(reason)}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Cancelar pendiente"
        description="El pendiente dejará de aparecer en las vistas operativas. Esta acción queda auditada."
        confirmLabel="Cancelar pendiente"
        variant="danger"
        loading={patch.isPending}
        reasonLabel="Motivo"
        reasonRequired
        onConfirm={(reason) => patch.mutate({ status: 'CANCELLED', statusReason: reason })}
      />
      <ConfirmDialog
        open={dialog === 'status' && pendingStatus !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null)
            setPendingStatus(null)
          }
        }}
        title={
          pendingStatus
            ? `Cambiar a “${ACTION_ITEM_STATUS_LABELS[pendingStatus].label}”`
            : 'Cambiar estado'
        }
        description={`Estado actual: ${ACTION_ITEM_STATUS_LABELS[item.status].label}.`}
        confirmLabel="Cambiar estado"
        loading={patch.isPending}
        reasonLabel="Comentario (opcional)"
        onConfirm={(reason) =>
          pendingStatus
            ? patch.mutate({ status: pendingStatus, ...(reason ? { statusReason: reason } : {}) })
            : undefined
        }
      />
    </>
  )
}

function OwnerDialog({
  open,
  onOpenChange,
  current,
  loading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  current: string | null
  loading: boolean
  onSubmit: (ownerUserId: string | null) => void
}) {
  const [value, setValue] = React.useState<string | null>(current)
  React.useEffect(() => {
    if (open) setValue(current)
  }, [open, current])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Cambiar responsable</DialogTitle>
          <DialogDescription>
            El nuevo responsable recibirá notificación si Gmail está habilitado.
          </DialogDescription>
        </DialogHeader>
        <Field label="Responsable" htmlFor="qa-owner">
          <CatalogSelect
            id="qa-owner"
            kind="users"
            value={value}
            onChange={setValue}
            emptyLabel="Sin responsable"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(value)} loading={loading}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DateDialog({
  open,
  onOpenChange,
  current,
  loading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  current: string | null
  loading: boolean
  onSubmit: (dueDate: string | null) => void
}) {
  const [value, setValue] = React.useState(current ?? '')
  React.useEffect(() => {
    if (open) setValue(current ?? '')
  }, [open, current])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Cambiar fecha compromiso</DialogTitle>
          <DialogDescription>
            Deja vacío para dejar el pendiente explícitamente “sin fecha”.
          </DialogDescription>
        </DialogHeader>
        <Field label="Fecha compromiso" htmlFor="qa-date">
          <Input
            id="qa-date"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(value || null)} loading={loading}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReasonTextarea(props: React.ComponentProps<typeof Textarea>) {
  return <Textarea rows={3} {...props} />
}
