import { EmptyState, GlassPanel } from "@osteojp/ui";
import { can } from "@osteojp/auth";
import { Package } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import {
  PACKS_IN_USE_CAPABILITIES,
  PACKS_IN_USE_READ_CAP,
  packsSortHref,
  parsePacksInUseSort,
  sortPacksInUse,
  type PacksInUseSort,
} from "@/lib/packs/in-use";
import { listPacksInUse } from "@/lib/packs/in-use-read";
import { SearchBox } from "../_components/search-box";
import { PacksInUseTable } from "./packs-in-use-table";

export const dynamic = "force-dynamic";

/**
 * "Packs em uso" (Fisiozero parity, owner request 2026-11-02): every pacote
 * that is still running, one row each, patient A to Z by default, or by
 * "Última utilização" (Q15, 2026-11-04) with `?sort=lastUse`.
 *
 * Lives under /patients because Fisiozero keeps it under FICHA DE UTENTE, and
 * OsteoJP's patient area is /patients: the Pacientes entry in the sidebar stays
 * lit here, and the Pacientes page links to it.
 *
 * Who opens it: any role holding `patients:read` and `appointments:read`,
 * which today is every staff role. WHAT each one sees is decided by the
 * database under their own session (lib/packs/in-use-read.ts): a therapist
 * sees the pacotes of the patients they may open, and nothing else. The
 * redirect is the courtesy; the read's own capability check is the boundary.
 */
export default async function PacksInUsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!PACKS_IN_USE_CAPABILITIES.every((c) => can(ctx.role, c))) redirect("/");

  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (raw ?? "").trim();
  const sort = parsePacksInUseSort(Array.isArray(sp.sort) ? sp.sort[0] : sp.sort);

  const page = await listPacksInUse(ctx, q);
  const { totalInUse, truncated } = page;
  // The read returns every row the page shows (bounded, not paginated), so the
  // sort runs here, on the server, over the full list.
  const rows = sortPacksInUse(page.rows, sort);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-v2-text-primary">{s["packsInUse.title"]}</h1>
          <p className="mt-1 text-sm text-v2-text-secondary">
            <Link
              href="/patients"
              className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {s["packsInUse.backToPatients"]}
            </Link>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-md">
          <SearchBox initialQuery={q} path="/patients/packs" placeholder={s["packsInUse.search"]} />
        </div>
        <SortLinks q={q} sort={sort} />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-v2-text-primary" data-testid="packs-in-use-count">
          {s["packsInUse.count"].replace("{n}", String(totalInUse))}
        </h2>
        <p className="text-xs text-v2-text-secondary">{s["packsInUse.paymentSoon"]}</p>
      </div>

      {truncated && (
        <p className="text-sm text-v2-text-secondary" role="status" data-testid="packs-in-use-truncated">
          {s["packsInUse.truncated"].replace("{n}", String(PACKS_IN_USE_READ_CAP))}
        </p>
      )}

      <GlassPanel>
        {rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title={q ? s["packsInUse.noMatchTitle"] : s["packsInUse.emptyTitle"]}
            description={q ? s["packsInUse.noMatchBody"] : s["packsInUse.emptyBody"]}
          />
        ) : (
          <PacksInUseTable rows={rows} />
        )}
      </GlassPanel>

      <p className="text-xs text-v2-text-secondary">{s["packsInUse.footnote"]}</p>
    </main>
  );
}

const SORT_OPTIONS: ReadonlyArray<{ key: PacksInUseSort; label: string }> = [
  { key: "name", label: s["packsInUse.sortName"] },
  { key: "lastUse", label: s["packsInUse.sortLastUse"] },
];

/**
 * Two plain links, server-rendered: no JavaScript, works by keyboard, and the
 * current one is marked with aria-current and weight, not colour alone. The
 * search is kept; the search box keeps `sort` in turn (it rewrites `q` only).
 */
function SortLinks({ q, sort }: { q: string; sort: PacksInUseSort }) {
  return (
    <nav aria-label={s["packsInUse.sortLabel"]} data-testid="packs-in-use-sort">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-v2-text-secondary">
        <span>{s["packsInUse.sortLabel"]}:</span>
        {SORT_OPTIONS.map((o) => {
          const current = o.key === sort;
          return (
            <Link
              key={o.key}
              href={packsSortHref(q, o.key)}
              aria-current={current ? "true" : undefined}
              data-sort={o.key}
              className={
                (current ? "font-semibold text-v2-text-primary underline " : "") +
                "underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              }
            >
              {o.label}
            </Link>
          );
        })}
      </p>
    </nav>
  );
}
