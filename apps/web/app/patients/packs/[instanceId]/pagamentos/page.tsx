import { EmptyState, GlassPanel, StatusBadge, type AppointmentTone } from "@osteojp/ui";
import { can } from "@osteojp/auth";
import { Package } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { formatEurosShort } from "@/lib/packs/in-use";
import { recordPackPaymentAction } from "@/lib/packs/payment-actions";
import {
  PACK_KIND_KEYS,
  PACK_METHOD_KEYS,
  PACK_PAYMENT_METHODS,
  STYLUS_REF_MAX,
  formatCalendarDate,
  formatSignedEuros,
  lisbonDate,
  packPaymentErrorKey,
  type PackPaymentState,
} from "@/lib/packs/payments";
import { getPackPaymentDetail, listPaymentLocations } from "@/lib/packs/payments-read";

export const dynamic = "force-dynamic";

/**
 * "Pagamentos do pack": one pacote's money (owner answers of 2026-11-05 to the
 * U4 b design note). The agreed price, today's catalogue price BESIDE it, what
 * was received and what is still to receive, every line in date order, and the
 * form that records the next one.
 *
 * WHO: `pack_payments:read` opens it (owner, admin, reception); a therapist is
 * sent back to Packs em uso (P4: no amounts). `pack_payments:record` sees the
 * form; the correcao option shows only with `pack_payments:correct` (owner,
 * admin). The write and, under it, the pending migration's policies decide
 * again; this page is the courtesy.
 *
 * NOT FISCAL, said on the page: the document is issued in Stylus first, and
 * its reference is copied here (S1, S2, P3). The words "Fatura", "Recibo" and
 * "Faturado" name only the Stylus documents, never a line here.
 *
 * SERVER-RENDERED, NO JAVASCRIPT. The form is a plain post to a server action,
 * which answers with a redirect back here carrying `?ok=` or `?erro=`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const th = "py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-v2-text-secondary";
const td = "py-2 pr-4 align-top text-sm text-v2-text-primary";
const field =
  "w-full rounded-md border border-v2-border bg-surface px-3 py-2 text-sm text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const label = "flex flex-col gap-1 text-sm text-v2-text-primary";
const hint = "text-xs text-v2-text-secondary";

const PAY_TONE: Record<PackPaymentState, AppointmentTone> = {
  paid: "confirmed",
  due: "pending",
  unpriced: "cancelled",
};
const PAY_LABEL: Record<PackPaymentState, string> = {
  paid: s["packsInUse.payStatePaid"],
  due: s["packsInUse.payStateDue"],
  unpriced: s["packsInUse.payStateUnpriced"],
};

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PackPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ instanceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "pack_payments:read")) redirect("/patients/packs");

  const { instanceId } = await params;
  const sp = await searchParams;
  const back = (
    <p className="mt-1 text-sm text-v2-text-secondary">
      <Link
        href="/patients/packs"
        className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {s["packsPay.back"]}
      </Link>
    </p>
  );

  const detail = UUID.test(instanceId) ? await getPackPaymentDetail(ctx, instanceId) : null;
  if (detail === "unavailable" || detail === null) {
    const unavailable = detail === "unavailable";
    return (
      <main className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-v2-text-primary">{s["packsPay.title"]}</h1>
          {back}
        </div>
        <GlassPanel>
          <EmptyState
            icon={Package}
            title={unavailable ? s["packsPay.unavailableTitle"] : s["packsPay.notFoundTitle"]}
            description={unavailable ? s["packsPay.unavailableBody"] : s["packsPay.notFoundBody"]}
          />
        </GlassPanel>
      </main>
    );
  }

  const canRecord = can(ctx.role, "pack_payments:record");
  const canCorrect = can(ctx.role, "pack_payments:correct");
  const locations = canRecord ? await listPaymentLocations(ctx) : [];
  const errKey = packPaymentErrorKey(first(sp.erro));
  const ok = first(sp.ok);
  const okText = ok === "registado" ? s["packsPay.okRegistado"] : ok === "vendido" ? s["packsPay.okVendido"] : null;
  const p = detail.summary;
  const hasPrice = p.agreedPriceCents !== null;
  const today = lisbonDate(new Date());

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-v2-text-primary">{s["packsPay.title"]}</h1>
        {back}
      </div>

      {errKey && (
        <p role="alert" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-700" data-testid="pack-pay-error">
          {s[errKey]}
        </p>
      )}
      {okText && (
        <p role="status" className="rounded-md bg-v2-green-100 px-3 py-2 text-sm text-v2-green-800" data-testid="pack-pay-ok">
          {okText}
        </p>
      )}

      <p className="text-sm text-v2-text-secondary" data-testid="pack-pay-not-fiscal">
        {s["packsPay.notFiscal"]}
      </p>

      <GlassPanel>
        <dl className="grid grid-cols-1 gap-3 p-6 text-sm sm:grid-cols-2" data-testid="pack-pay-summary">
          <div>
            <dt className={hint}>{s["packsPay.patient"]}</dt>
            <dd>
              <Link
                href={`/patients/${detail.patientId}`}
                className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {detail.patientName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className={hint}>{s["packsPay.pack"]}</dt>
            <dd className="font-medium">{detail.packName}</dd>
          </div>
          <div>
            <dt className={hint}>{s["packsPay.summaryAgreed"]}</dt>
            <dd className="tabular-nums" data-testid="pack-pay-agreed">
              {hasPrice ? `${formatEurosShort(p.agreedPriceCents!)}€` : s["packsInUse.payStateUnpriced"]}
            </dd>
          </div>
          <div>
            <dt className={hint}>{s["packsPay.summaryCatalog"]}</dt>
            <dd className="tabular-nums">{formatEurosShort(detail.catalogPriceCents)}€</dd>
          </div>
          {p.switchAmountCents !== null && (
            <div>
              <dt className={hint}>{s["packsPay.summarySwitch"]}</dt>
              <dd className="tabular-nums">{formatEurosShort(p.switchAmountCents)}€</dd>
            </div>
          )}
          <div>
            <dt className={hint}>{s["packsPay.summaryReceived"]}</dt>
            <dd className="tabular-nums" data-testid="pack-pay-received">
              {formatSignedEuros(p.receivedCents)}€
            </dd>
          </div>
          <div>
            <dt className={hint}>{s["packsPay.summaryOutstanding"]}</dt>
            <dd className="flex flex-wrap items-center gap-2 tabular-nums">
              <StatusBadge tone={PAY_TONE[p.state]}>
                <span data-pay-state={p.state}>{PAY_LABEL[p.state]}</span>
              </StatusBadge>
              {p.state === "due" && p.outstandingCents !== null && <span>{formatEurosShort(p.outstandingCents)}€</span>}
            </dd>
          </div>
        </dl>
      </GlassPanel>

      <GlassPanel>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold text-v2-text-primary">{s["packsPay.linesTitle"]}</h2>
          {detail.lines.length === 0 ? (
            <p className="text-sm text-v2-text-secondary">{s["packsPay.linesEmpty"]}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="pack-pay-lines">
                <thead>
                  <tr className="border-b border-v2-border">
                    <th scope="col" className={th}>{s["packsPay.colDate"]}</th>
                    <th scope="col" className={th}>{s["packsPay.colKind"]}</th>
                    <th scope="col" className={`${th} text-right`}>{s["packsPay.colAmount"]}</th>
                    <th scope="col" className={th}>{s["packsPay.colMethod"]}</th>
                    <th scope="col" className={th}>{s["packsPay.colLocation"]}</th>
                    <th scope="col" className={th}>{s["packsPay.colStylus"]}</th>
                    <th scope="col" className={th}>{s["packsPay.colReason"]}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l) => (
                    <tr key={l.id} className="border-b border-v2-border" data-testid="pack-pay-line">
                      <td className={`${td} tabular-nums`}>{formatCalendarDate(l.receivedOn)}</td>
                      <td className={td}>{s[PACK_KIND_KEYS[l.kind]]}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatSignedEuros(l.amountCents)}€</td>
                      <td className={td}>{l.method ? s[PACK_METHOD_KEYS[l.method]] : ""}</td>
                      <td className={td}>{l.locationName ?? ""}</td>
                      <td className={td}>
                        {l.stylusRef ?? (l.kind === "correcao" ? "" : (
                          <span className="text-warning-700">{s["packsPay.noStylus"]}</span>
                        ))}
                      </td>
                      <td className={`${td} whitespace-pre-wrap`}>{l.reason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </GlassPanel>

      {canRecord && (
        <GlassPanel>
          <form action={recordPackPaymentAction} className="flex flex-col gap-4 p-6" data-testid="pack-pay-form">
            <h2 className="text-lg font-semibold text-v2-text-primary">{s["packsPay.formTitle"]}</h2>
            <input type="hidden" name="instanceId" value={detail.instanceId} />
            <input type="hidden" name="instanceHasPrice" value={hasPrice ? "1" : "0"} />

            {!hasPrice && (
              <label className={label}>
                {s["packsPay.fieldAgreed"]}
                <span className="flex flex-wrap items-center gap-3">
                  {/* P2: typed, never pre-filled; today's catalogue price sits beside it. */}
                  <input name="agreedPrice" inputMode="decimal" autoComplete="off" className={`${field} max-w-40`} />
                  <span className={hint} data-testid="pack-pay-catalog-beside">
                    {s["packsPay.catalogBeside"].replace("{amount}", formatEurosShort(detail.catalogPriceCents))}
                  </span>
                </span>
                <span className={hint}>{s["packsPay.fieldAgreedHint"]}</span>
              </label>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={label}>
                {s["packsPay.fieldKind"]}
                <select name="kind" className={field} defaultValue="pagamento">
                  <option value="pagamento">{s["packsPay.kindPagamento"]}</option>
                  <option value="reembolso">{s["packsPay.kindReembolso"]}</option>
                  {canCorrect && <option value="correcao">{s["packsPay.kindCorrecao"]}</option>}
                </select>
              </label>
              <label className={label}>
                {s["packsPay.fieldAmount"]}
                <input name="amount" inputMode="decimal" autoComplete="off" required className={field} />
                <span className={hint}>{s["packsPay.amountHint"]}</span>
              </label>
              {canCorrect && (
                <label className={label}>
                  {s["packsPay.fieldDirection"]}
                  <select name="direction" className={field} defaultValue="mais">
                    <option value="mais">{s["packsPay.directionMais"]}</option>
                    <option value="menos">{s["packsPay.directionMenos"]}</option>
                  </select>
                </label>
              )}
              <label className={label}>
                {s["packsPay.fieldDate"]}
                <input type="date" name="receivedOn" defaultValue={today} max={today} required className={field} />
              </label>
              <label className={label}>
                {s["packsPay.fieldMethod"]}
                <select name="method" className={field} defaultValue="">
                  <option value="">{s["packsPay.fieldMethodNone"]}</option>
                  {PACK_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {s[PACK_METHOD_KEYS[m]]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                {s["packsPay.fieldLocation"]}
                <select name="locationId" className={field} defaultValue={locations.length === 1 ? locations[0]!.id : ""} required>
                  {locations.length !== 1 && <option value="" />}
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                {s["packsPay.fieldStylus"]}
                <input name="stylusRef" maxLength={STYLUS_REF_MAX} autoComplete="off" className={field} />
                <span className={hint}>{s["packsPay.fieldStylusHint"]}</span>
              </label>
            </div>
            <label className={label}>
              {s["packsPay.fieldReason"]}
              <textarea name="reason" rows={2} className={field} />
            </label>
            <div>
              <button
                type="submit"
                className="rounded-md bg-accent-2-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                {s["packsPay.submit"]}
              </button>
            </div>
          </form>
        </GlassPanel>
      )}
    </main>
  );
}
