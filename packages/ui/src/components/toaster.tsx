'use client'

import { Toaster as Sonner, toast } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group toast !bg-surface !text-foreground !border-border !shadow-pop !rounded-lg !font-sans',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground',
          cancelButton: '!bg-surface-muted !text-foreground',
          success: '!border-success-300',
          error: '!border-danger-300',
          warning: '!border-warning-300',
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
