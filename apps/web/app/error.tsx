'use client'

import * as React from 'react'
import { ErrorState } from '@smlxl/ui'
import { describeError } from '@/lib/error-messages'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const d = describeError(error)
  React.useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-2xl items-center px-6">
      <ErrorState
        title="Algo salió mal en esta pantalla"
        message={d.message}
        code={d.code}
        correlationId={d.correlationId ?? error.digest}
        onRetry={reset}
        className="w-full"
      />
    </main>
  )
}
