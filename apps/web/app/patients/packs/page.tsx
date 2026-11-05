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
import {
  filterPorReceber,
  formatSignedEuros,
  parsePorReceberFilter,
  withPorReceberFilter,
} from "@/lib/packs/payments";
import { readPackPaymentSummaries, readPacksReceivedThisMonth } from "@/lib/packs/payments-read";
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
 *
 * PACK PAYMENTS (owner answers of 2026-11-05). Owner, admin and reception
 * (`pack_payments:read`) see the PAGAMENTO column filled, the "€ POR RECEBER"
 * filter (`?pagamento=por-receber`), "Vender pack", and the month's "Packs
 * recebidos (registo interno, não fiscal)" total, which is shown HERE ONLY and
 * never in Faturação or the Painel (P7). A therapist sees none of it (P4).
 * Before the pending migration is applied every payment read answers null and
 * the page reads as it did: PAGAMENTO empty, "Pagamento: em breve".
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
  const moneyRole = can(ctx.role, "pack_payments:read");
  const payments = moneyRole
    ? await readPackPaymentSummaries(
        ctx,
        page.rows.map((r) => r.instanceId),
      )
    : null;
  const month = payments ? await readPacksReceivedThisMonth(ctx) : null;
  const porReceber = payments !== null && parsePorReceberFilter(first(sp.pagamento));
  const canSell = payments !== null && can(ctx.role, "pack_payments:record");
  // The read returns every row the page shows (bounded, not paginated), so the
  // filter and the sort run here, on the server, over the full list.
  const shown = payments !== null && porReceber ? filterPorReceber(page.rows, payments) : page.rows;
  const rows = sortPacksInUse(shown, sort);

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
        <SortLinks q={q} sort={sort} porReceber={porReceber} />
      </div>

      {payments !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PayFilterLinks q={q} sort={sort} porReceber={porReceber} />
          {canSell && (
            <Link
              href="/patients/packs/vender"
              data-testid="packs-in-use-sell"
              className="rounded-md bg-accent-2-700 px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {s["packsInUse.sell"]}
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-v2-text-primary" data-testid="packs-in-use-count">
          {porReceber
            ? s["packsInUse.countPorReceber"].replace("{n}", String(rows.length))
            : s["packsInUse.count"].replace("{n}", String(totalInUse))}
        </h2>
        {month ? (
          <p className="text-sm text-v2-text-secondary tabular-nums" data-testid="packs-in-use-received-month">
            {s["packsInUse.receivedMonth"]
              .replace("{month}", monthLabel(month.first))
              .replace("{amount}", formatSignedEuros(month.cents))}
          </p>
        ) : (
          payments === null &&
          moneyRole && <p className="text-xs text-v2-text-secondary">{s["packsInUse.paymentSoon"]}</p>
        )}
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
          <PacksInUseTable rows={rows} payments={payments} />
        )}
      </GlassPanel>

      <p className="text-xs text-v2-text-secondary">{s["packsInUse.footnote"]}</p>
      {payments !== null && (
        <p className="text-xs text-v2-text-secondary">{s["packsInUse.footnotePayments"]}</p>
      )}
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
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** "novembro de 2026" from the month's first day, YYYY-MM-01. */
function monthLabel(firstDay: string): string {
  const [y, m] = firstDay.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  });
}

/**
 * "Todos os packs" and "€ POR RECEBER": two plain links, like the sort, the
 * current one marked with aria-current and weight, not colour alone. The
 * search and the sort are kept.
 */
function PayFilterLinks({ q, sort, porReceber }: { q: string; sort: PacksInUseSort; porReceber: boolean }) {
  const opts = [
    { key: "all", on: false, label: s["packsInUse.filterAll"] },
    { key: "por-receber", on: true, label: s["packsInUse.filterPorReceber"] },
  ] as const;
  return (
    <nav aria-label={s["packsInUse.filterLabel"]} data-testid="packs-in-use-pay-filter">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-v2-text-secondary">
        <span>{s["packsInUse.filterLabel"]}:</span>
        {opts.map((o) => {
          const current = o.on === porReceber;
          return (
            <Link
              key={o.key}
              href={withPorReceberFilter(packsSortHref(q, sort), o.on)}
              aria-current={current ? "true" : undefined}
              data-pay-filter={o.key}
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

function SortLinks({ q, sort, porReceber }: { q: string; sort: PacksInUseSort; porReceber: boolean }) {
  return (
    <nav aria-label={s["packsInUse.sortLabel"]} data-testid="packs-in-use-sort">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-v2-text-secondary">
        <span>{s["packsInUse.sortLabel"]}:</span>
        {SORT_OPTIONS.map((o) => {
          const current = o.key === sort;
          return (
            <Link
              key={o.key}
              href={withPorReceberFilter(packsSortHref(q, o.key), porReceber)}
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
