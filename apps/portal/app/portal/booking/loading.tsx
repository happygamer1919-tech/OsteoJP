import { Skeleton } from '@osteojp/ui'

export default function BookingLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-0.5 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" className="w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
