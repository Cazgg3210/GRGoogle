import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn.js'
import type { Tone } from '../lib/labels.js'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-4 tracking-wide whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-paper-300 bg-paper-100 text-paper-800',
        info: 'border-info-200 bg-info-50 text-info-800',
        success: 'border-success-200 bg-success-50 text-success-800',
        warning: 'border-warning-200 bg-warning-50 text-warning-800',
        danger: 'border-danger-200 bg-danger-50 text-danger-800',
        ai: 'border-ai-200 bg-ai-50 text-ai-800',
        signal: 'border-signal-200 bg-signal-50 text-signal-800',
        solid: 'border-ink-900 bg-ink-900 text-paper-50',
      } satisfies Record<Tone | 'solid', string>,
      size: {
        default: '',
        lg: 'px-2 py-1 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, tone, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden /> : null}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
