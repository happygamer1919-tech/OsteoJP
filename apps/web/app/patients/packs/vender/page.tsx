import { EmptyState, GlassPanel } from "@osteojp/ui";
import { can } from "@osteojp/auth";
import { Package } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { formatEurosShort } from "@/lib/packs/in-use";
import { sellPackAction } from "@/lib/packs/payment-actions";
import { packPaymentErrorKey } from "@/lib/packs/payments";
import {
  getSellPatient,
  listSellablePacks,
  packPaymentsAvailable,
} from "@/lib/packs/payments-read";
import { searchPatients } from "@/lib/patients/queries";
import { SearchBox } from "../../_components/search-box";

export const dynamic = "force-dynamic";

/**
 * "VENDER PACK" (owner P8, 2026-11-05): open a pacote for a patient before
 * their first booking, with the price agreed at the sale.
 *
 * Two steps, server-rendered, no JavaScript:
 *   1. find the patient (`?q=`), with the same search as the booking pickers
 *      (`searchPatients`, the viewer's write scope);
 *   2. with `?patient=<id>`, choose the pacote and TYPE the agreed price. The
 *      catalogue price is printed beside each pacote ("tabela hoje") and never
 *      fills the field (P2).
 * Then the pacote's payment page opens, where the payment is recorded when the
 * money is received.
 *
 * Stylus first (P3, S1): the page says so. Nothing here is a fiscal act.
 *
 * WHO: `pack_payments:record` (owner, admin, reception). Before the pending
 * migration is applied the page says the feature is not available yet.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field =
  "w-full rounded-md border border-v2-border bg-surface px-3 py-2 text-sm text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const label = "flex flex-col gap-1 text-sm text-v2-text-primary";
const hint = "text-xs text-v2-text-secondary";
const link =
  "underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function SellPackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "pack_payments:record") || !can(ctx.role, "patients:read")) redirect("/patients/packs");

  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim();
  const rawPatient = (first(sp.patient) ?? "").trim();
  const errKey = packPaymentErrorKey(first(sp.erro));

  const header = (
    <div>
      <h1 className="text-2xl font-semibold text-v2-text-primary">{s["packsSell.title"]}</h1>
      <p className="mt-1 text-sm text-v2-text-secondary">
        <Link href="/patients/packs" className={link}>
          {s["packsPay.back"]}
        </Link>
      </p>
    </div>
  );

  if (!(await packPaymentsAvailable(ctx))) {
    return (
      <main className="flex flex-col gap-5">
        {header}
        <GlassPanel>
          <EmptyState icon={Package} title={s["packsPay.unavailableTitle"]} description={s["packsPay.unavailableBody"]} />
        </GlassPanel>
      </main>
    );
  }

  const patient = UUID.test(rawPatient) ? await getSellPatient(ctx, rawPatient) : null;
  const found = !patient && q ? await searchPatients(q, { limit: 20 }) : null;

  return (
    <main className="flex flex-col gap-5">
      {header}
      <p className="text-sm text-v2-text-secondary" data-testid="pack-sell-stylus-first">
        {s["packsSell.intro"]}
      </p>
      {errKey && (
        <p role="alert" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-700" data-testid="pack-sell-error">
          {s[errKey]}
        </p>
      )}

      {patient ? (
        <SellForm ctxPatient={patient} packs={await listSellablePacks(ctx)} />
      ) : (
        <GlassPanel>
          <div className="flex flex-col gap-3 p-6">
            <div className="w-full max-w-md">
              <SearchBox initialQuery={q} path="/patients/packs/vender" placeholder={s["packsSell.searchPlaceholder"]} />
            </div>
            {found && <PatientResults found={found} />}
          </div>
        </GlassPanel>
      )}
    </main>
  );
}

function PatientResults({ found }: { found: ReadonlyArray<{ id: string; fullName: string }> }) {
  if (found.length === 0) return <p className="text-sm text-v2-text-secondary">{s["packsSell.noResults"]}</p>;
  return (
    <ul className="flex flex-col gap-1" data-testid="pack-sell-results">
      {found.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 border-b border-v2-border py-2 text-sm">
          <span className="text-v2-text-primary">{p.fullName}</span>
          <Link href={`/patients/packs/vender?patient=${p.id}`} className={`${link} text-accent-2-700`}>
            {s["packsSell.choose"]}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SellForm({
  ctxPatient,
  packs,
}: {
  ctxPatient: { id: string; name: string };
  packs: Awaited<ReturnType<typeof listSellablePacks>>;
}) {
  return (
    <GlassPanel>
      <form action={sellPackAction} className="flex flex-col gap-4 p-6" data-testid="pack-sell-form">
        <input type="hidden" name="patientId" value={ctxPatient.id} />
        <p className="text-sm text-v2-text-primary">
          <span className="font-medium">{s["packsSell.chosen"].replace("{name}", ctxPatient.name)}</span>{" "}
          <Link href="/patients/packs/vender" className={`${link} text-accent-2-700`}>
            {s["packsSell.changePatient"]}
          </Link>
        </p>
        {packs.length === 0 ? (
          <p className="text-sm text-v2-text-secondary">{s["packsSell.noPacks"]}</p>
        ) : (
          <>
            <label className={label}>
              {s["packsSell.fieldPack"]}
              <select name="packId" required className={field} defaultValue="">
                <option value="" />
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {s["packsSell.packOption"]
                      .replace("{name}", p.name)
                      .replace("{n}", String(p.sessionCount))
                      .replace("{amount}", formatEurosShort(p.catalogPriceCents))}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {s["packsPay.fieldAgreed"]}
              {/* P2: typed, never pre-filled from the catalogue. */}
              <input name="agreedPrice" inputMode="decimal" autoComplete="off" required className={`${field} max-w-40`} />
              <span className={hint}>{s["packsPay.fieldAgreedHint"]}</span>
            </label>
            <div>
              <button
                type="submit"
                className="rounded-md bg-accent-2-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                {s["packsSell.submit"]}
              </button>
            </div>
          </>
        )}
      </form>
    </GlassPanel>
  );
}
