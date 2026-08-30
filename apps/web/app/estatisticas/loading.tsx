import { GlassPanel, Skeleton } from "@osteojp/ui";

/**
 * Estatísticas loading (PERF-02).
 *
 * Covers the whole /estatisticas subtree, including /estatisticas/indicadores —
 * a loading.tsx applies to its segment AND everything nested under it that does
 * not declare its own. Indicadores is the route Sentry reported a statement
 * timeout on today (OSTEOJP-WEB-4), so it is the one that most needs a shell to
 * paint while the server works.
 *
 * Tabs strip + KPI row + two chart placeholders, matching the section's layout.
 */
export default function EstatisticasLoading() {
  return (
    <main className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" className="h-7 w-48" />
        <Skeleton variant="text" className="w-full max-w-2xl" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="block" className="h-9 w-32 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card flex flex-col gap-2 px-4 py-4">
            <Skeleton variant="text" className="h-3 w-28" />
            <Skeleton variant="text" className="h-7 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassPanel>
          <Skeleton variant="block" className="h-56 w-full" />
        </GlassPanel>
        <GlassPanel>
          <Skeleton variant="block" className="h-56 w-full" />
        </GlassPanel>
      </div>
    </main>
  );
}
