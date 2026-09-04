'use client'

import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Textarea,
} from '@smlxl/ui'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  variant = 'default',
  loading,
  onConfirm,
  children,
  reasonLabel,
  reasonRequired,
  reasonPlaceholder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  variant?: 'default' | 'danger' | 'success' | 'accent'
  loading?: boolean
  onConfirm: (reason: string) => void | Promise<void>
  children?: React.ReactNode
  /** Si se define, muestra un textarea de motivo/comentario. */
  reasonLabel?: string
  reasonRequired?: boolean
  reasonPlaceholder?: string
}) {
  const [reason, setReason] = React.useState('')
  React.useEffect(() => {
    if (!open) setReason('')
  }, [open])
  const disabled = Boolean(reasonRequired && reason.trim().length < 3)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {reasonLabel ? (
          <Field label={reasonLabel} htmlFor="confirm-reason" required={reasonRequired}>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
            />
          </Field>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={variant}
            onClick={() => void onConfirm(reason.trim())}
            loading={loading}
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
