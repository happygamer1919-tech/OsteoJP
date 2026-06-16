import { GlassPanel, Skeleton } from "@osteojp/ui";

/**
 * Marcações loading (V2-W7, SPEC-v2-agenda §4): glass toolbar chrome + row
 * skeletons inside the glass list container. v2 glass surfaces, static under
 * prefers-reduced-motion (the Skeleton primitive handles that).
 */
export default function MarcacoesLoading() {
  return (
    <main className="space-y-6">
      <div className="space-y-1">
        <Skeleton variant="text" className="h-7 w-40" />
        <Skeleton variant="text" className="h-4 w-72" />
      </div>

      <div className="glass-nav flex flex-wrap items-center gap-3 rounded-v2 px-4 py-3 shadow-v2-float">
        <Skeleton variant="block" className="h-10 w-44" />
        <Skeleton variant="block" className="ml-auto h-10 w-56" />
      </div>

      <GlassPanel>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <Skeleton variant="text" className="w-24" />
              <Skeleton variant="text" className="flex-1" />
              <Skeleton variant="block" className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </GlassPanel>
    </main>
  );
}
