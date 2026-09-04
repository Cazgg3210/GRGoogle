import { Skeleton } from '@smlxl/ui'

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-8 w-full max-w-3xl" />
      <div className="rounded-lg border border-border bg-surface p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-8 w-full" />
        ))}
      </div>
    </div>
  )
}
