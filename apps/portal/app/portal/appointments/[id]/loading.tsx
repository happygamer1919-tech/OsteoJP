import { Skeleton } from '@osteojp/ui'

export default function AppointmentDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-11 w-24" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded" />
    </div>
  )
}
