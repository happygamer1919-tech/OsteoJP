import { GlassKpiCard, GlassPanel } from "@osteojp/ui";

/**
 * Dashboard loading state (SPEC-v2-dashboard §7): greeting + KPI skeletons and
 * panel placeholders, on the v2 glass system. The pulse collapses under
 * prefers-reduced-motion via the global theme rule.
 */
export default function DashboardLoading() {
  return (
    <main className="flex flex-col gap-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <span className="h-12 w-72 animate-pulse rounded-v2 bg-surface-muted" />
        <span className="h-5 w-96 max-w-full animate-pulse rounded bg-surface-muted" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <GlassKpiCard key={i} label="" value="" loading />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassPanel title="">
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-10 w-full animate-pulse rounded bg-surface-muted" />
            ))}
          </div>
        </GlassPanel>
        <GlassPanel title="">
          <span className="block h-40 w-full animate-pulse rounded-md bg-surface-muted" />
        </GlassPanel>
      </div>
    </main>
  );
}
