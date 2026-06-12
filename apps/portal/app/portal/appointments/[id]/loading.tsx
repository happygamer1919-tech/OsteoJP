import { Skeleton } from '@osteojp/ui'

export default function AppointmentDetailLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-11 w-24" />
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded" />
    </div>
  )
}
