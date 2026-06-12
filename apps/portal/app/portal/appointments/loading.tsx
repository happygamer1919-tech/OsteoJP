import { Skeleton } from '@osteojp/ui'

// Mirrors the segmented control + a few appointment rows (SPEC-portal §6 states).
export default function AppointmentsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-full rounded-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
