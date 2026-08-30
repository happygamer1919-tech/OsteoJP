import { GlassPanel, Skeleton, SkeletonTable } from "@osteojp/ui";

/**
 * Utentes loading (PERF-02).
 *
 * Mirrors the real layout of page.tsx so nothing jumps on load: the stat strip,
 * the filter bar, then the table. `SkeletonTable` is the ui primitive's own
 * rows×cols helper rather than a hand-rolled grid, so the row height stays in
 * step with the Table component if either changes.
 *
 * Seven columns, matching UX-01: patient number, name, NIF, phone, location,
 * last visit, next appointment.
 */
export default function PatientsLoading() {
  return (
    <main className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton variant="text" className="h-7 w-40" />
        <Skeleton variant="block" className="ml-auto h-10 w-36" />
      </div>

      {/* stat strip - four compact numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card flex flex-col gap-2 px-4 py-3">
            <Skeleton variant="text" className="h-3 w-24" />
            <Skeleton variant="text" className="h-6 w-16" />
          </div>
        ))}
      </div>

      {/* filter bar - search, location select, upcoming toggle */}
      <div className="glass-nav flex flex-wrap items-center gap-3 rounded-v2 px-4 py-3">
        <Skeleton variant="block" className="h-10 w-full max-w-sm" />
        <Skeleton variant="block" className="h-10 w-48" />
        <Skeleton variant="block" className="h-10 w-44" />
      </div>

      <GlassPanel>
        <SkeletonTable rows={12} cols={7} />
      </GlassPanel>
    </main>
  );
}
