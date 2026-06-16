import { Skeleton } from '@osteojp/ui'

// Skeleton mirrors the dashboard blocks (greeting, hero, quick-action grid) so
// content does not jump on load (SPEC-portal §5 states).
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton variant="text" className="w-48" />
      </div>

      <Skeleton className="h-40 w-full rounded-lg" />

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
