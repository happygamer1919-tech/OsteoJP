import { Skeleton } from "@osteojp/ui";

/** Agenda loading (SPEC §4): toolbar + grid chrome, 4 skeleton blocks per column. */
export default function AgendaLoading() {
  return (
    <main>
      <div className="-mx-6 -mt-8 mb-6 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <Skeleton variant="text" className="h-7 w-24" />
        <Skeleton variant="block" className="h-10 w-44 rounded-full" />
        <Skeleton variant="block" className="h-10 w-44" />
        <Skeleton variant="block" className="ml-auto h-10 w-36" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid gap-2 p-3" style={{ gridTemplateColumns: "64px repeat(5, minmax(0,1fr))" }}>
          <div aria-hidden="true" />
          {Array.from({ length: 5 }).map((_, c) => (
            <div key={c} className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, r) => (
                <Skeleton key={r} variant="block" className="h-16 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
