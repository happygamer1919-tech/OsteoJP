import { Skeleton, SkeletonText } from '@osteojp/ui'

export default function DocumentsLoading() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <SkeletonText lines={4} />
      <Skeleton className="mt-4 h-4 w-2/3" />
    </div>
  )
}
