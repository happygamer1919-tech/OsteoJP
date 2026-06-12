import { Skeleton, SkeletonTable } from "@osteojp/ui";

/** Dashboard loading state (SPEC §3): KPI skeletons + a 5-row SkeletonTable. */
export default function DashboardLoading() {
  return (
    <main>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Skeleton variant="text" className="h-8 w-48" />
        <Skeleton variant="block" className="h-10 w-64" />
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-6">
          <Skeleton variant="text" className="mb-2 w-24" />
          <Skeleton variant="block" className="h-8 w-16" />
        </div>
      </div>
      <Skeleton variant="text" className="mb-4 h-7 w-32" />
      <div className="rounded-lg border border-border bg-surface p-4">
        <SkeletonTable rows={5} cols={4} />
      </div>
    </main>
  );
}
