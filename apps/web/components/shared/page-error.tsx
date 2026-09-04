import { ErrorState } from '@smlxl/ui'
import type { ApiError } from '@/lib/api'
import { describeError } from '@/lib/error-messages'

/** ErrorState para páginas de servidor a partir de un ApiError. */
export function PageError({
  error,
  title,
  compact,
  retryHref,
}: {
  error: ApiError
  title?: string
  compact?: boolean
  retryHref?: string
}) {
  const d = describeError(error)
  return (
    <ErrorState
      title={title ?? d.title}
      message={d.message}
      code={d.code}
      correlationId={d.correlationId}
      compact={compact}
      retryHref={retryHref}
    />
  )
}
