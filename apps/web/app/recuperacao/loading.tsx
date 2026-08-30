import { GlassPanel, Skeleton } from "@osteojp/ui";

/**
 * Recuperação loading (PERF-02).
 *
 * WHY THIS FILE EXISTS AT ALL, because a skeleton looks like polish and this one
 * is not. Without a loading boundary there is no streamed shell: the App Router
 * holds the previous screen and paints nothing until the whole RSC response
 * arrives. Before migration 0068 that response took 127 SECONDS on production,
 * and the owner reported it as "other sections become unclickable" — the
 * application had not frozen, it was waiting, and nothing on screen said so.
 *
 * 0068 fixed the wait (127,170 ms -> 171 ms). This fixes the SILENCE, and the
 * two are separate defects: a fast page with no boundary still paints nothing
 * while it works, and the next slow query on this route would present exactly
 * the same way.
 *
 * Two sections, mirroring page.tsx: the candidate list and the Postponed block.
 */
export default function RecuperacaoLoading() {
  return (
    <div className="flex flex-col gap-8 p-6" aria-busy="true">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton variant="text" className="h-7 w-56" />
          <Skeleton variant="text" className="w-full max-w-3xl" />
          <Skeleton variant="text" className="h-3 w-80 max-w-full" />
        </div>
        <GlassPanel>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton variant="text" className="w-48" />
                <Skeleton variant="text" className="w-32" />
                <Skeleton variant="text" className="hidden flex-1 sm:block" />
                <Skeleton variant="block" className="h-8 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton variant="text" className="h-5 w-40" />
          <Skeleton variant="text" className="w-full max-w-3xl" />
        </div>
        <GlassPanel>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton variant="text" className="w-48" />
                <Skeleton variant="text" className="w-28" />
                <Skeleton variant="block" className="ml-auto h-8 w-28 rounded-full" />
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>
    </div>
  );
}
