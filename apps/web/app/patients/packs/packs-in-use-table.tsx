import Link from "next/link";
import { StatusBadge, type AppointmentTone } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import { formatEurosShort, type PackInUseView } from "@/lib/packs/in-use";
import {
  formatCalendarDate,
  formatSignedEuros,
  type PackPaymentState,
  type PackPaymentSummary,
} from "@/lib/packs/payments";

/**
 * The "Packs em uso" table. Fisiozero's columns, in Fisiozero's order, in
 * OsteoJP's table shape (UI-STYLE: a <table> in an overflow-x-auto wrapper,
 * inside the page's GlassPanel). The header and cell classes are local: the
 * admin ones (`adminTh`, `adminTd`) with the headers in capitals, as Fisiozero
 * prints them, and the two counts right-aligned.
 *
 * PRESENTATIONAL AND SERVER-RENDERED. The session list opens with a native
 * <details> in the NOME PACK cell, so it needs no JavaScript and works by
 * keyboard. Every date is formatted HERE, on the server, in Europe/Lisbon: a
 * date formatted in the browser follows the browser's zone.
 *
 * PAGAMENTO (pack payments, owner answers of 2026-11-05). When the page hands
 * over `payments` (the viewer holds `pack_payments:read` AND the pending
 * migration is applied), each row shows its state as a badge with its word
 * ("Recebido", "Por receber", "Preço por indicar": colour is never the only
 * cue), what is still owed, how many lines lack a Stylus document, and a link
 * to the pacote's payment page; "Recebido: X€" sits under the pacote and
 * "Pagou a dd/mm/aaaa" under the patient, as on Fisiozero.
 *
 * WITHOUT `payments` THE CELLS STAY EMPTY, on purpose: a therapist sees no
 * amounts (P4), and before the sitting nothing is recorded, so there is
 * nothing true to put there. A pacote with no stated price NEVER reads "Por
 * receber" computed from the catalogue.
 */

const th = "py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-v2-text-secondary";
const td = "py-3 pr-4 align-top text-sm text-v2-text-primary";

const DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Lisbon",
};
const DATE_TIME: Intl.DateTimeFormatOptions = {
  ...DATE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

export function formatPackDate(d: Date): string {
  return d.toLocaleDateString("pt-PT", DATE);
}

export function formatPackDateTime(d: Date): string {
  return d.toLocaleString("pt-PT", DATE_TIME).replace(",", "");
}

export function packTitle(v: Pick<PackInUseView, "packName" | "packPriceCents">): string {
  return `${v.packName} • ${formatEurosShort(v.packPriceCents)}€`;
}

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

function PaymentCell({ instanceId, p }: { instanceId: string; p: PackPaymentSummary }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge tone={PAY_TONE[p.state]}>
        <span data-pay-state={p.state}>{PAY_LABEL[p.state]}</span>
      </StatusBadge>
      {p.state === "due" && p.outstandingCents !== null && (
        <span className="text-xs tabular-nums text-v2-text-secondary">
          {s["packsInUse.outstanding"].replace("{amount}", formatEurosShort(p.outstandingCents))}
        </span>
      )}
      {p.linesWithoutStylusRef > 0 && (
        <span className="text-xs text-warning-700" data-testid="packs-in-use-no-stylus">
          {s["packsInUse.noStylusRef"].replace("{n}", String(p.linesWithoutStylusRef))}
        </span>
      )}
      <Link
        href={`/patients/packs/${instanceId}/pagamentos`}
        className="text-xs text-accent-2-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {s["packsInUse.paymentsLink"]}
      </Link>
    </div>
  );
}

export function PacksInUseTable({
  rows,
  payments = null,
}: {
  rows: PackInUseView[];
  /** Per instance; null when the viewer sees no amounts or the schema is not there yet. */
  payments?: ReadonlyMap<string, PackPaymentSummary> | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="packs-in-use-table">
        <thead>
          <tr className="border-b border-v2-border">
            <th scope="col" className={th}>{s["packsInUse.colPatient"]}</th>
            <th scope="col" className={th}>{s["packsInUse.colPack"]}</th>
            <th scope="col" className={th}>{s["packsInUse.colStarted"]}</th>
            <th scope="col" className={th}>{s["packsInUse.colPayment"]}</th>
            <th scope="col" className={`${th} text-right`}>{s["packsInUse.colReserved"]}</th>
            <th scope="col" className={`${th} text-right`}>{s["packsInUse.colFree"]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const pay = payments?.get(v.instanceId) ?? null;
            return (
            <tr key={v.instanceId} className="border-b border-v2-border" data-testid="packs-in-use-row">
              <td className={td}>
                <Link
                  href={`/patients/${v.patientId}`}
                  className="font-medium text-v2-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {v.patientName}
                </Link>
                {pay?.lastPaidOn && (
                  <p className="mt-1 text-xs text-v2-text-secondary tabular-nums" data-testid="packs-in-use-paid-on">
                    {s["packsInUse.paidOn"].replace("{date}", formatCalendarDate(pay.lastPaidOn))}
                  </p>
                )}
              </td>
              <td className={td}>
                <details>
                  <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
                    {packTitle(v)}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1 text-xs text-v2-text-secondary">
                    {v.legacyConsumed > 0 && (
                      <p>
                        {s["packsInUse.legacySessions"].replace("{n}", String(v.legacyConsumed))}
                      </p>
                    )}
                    {v.sessions.length > 0 ? (
                      <ol start={v.legacyConsumed + 1} className="list-decimal pl-5 tabular-nums">
                        {v.sessions.map((x) => (
                          <li key={x.appointmentId}>{formatPackDateTime(x.startsAt)}</li>
                        ))}
                      </ol>
                    ) : (
                      v.legacyConsumed === 0 && <p>{s["packsInUse.noSessions"]}</p>
                    )}
                    <p className="font-medium text-v2-text-primary">
                      {s["packsInUse.doneAndUpcoming"]
                        .replace("{done}", String(v.done))
                        .replace("{upcoming}", String(v.upcoming))}
                    </p>
                  </div>
                </details>
                {pay && (
                  <p className="mt-1 text-xs text-v2-text-secondary tabular-nums" data-testid="packs-in-use-received">
                    {s["packsInUse.received"].replace("{amount}", formatSignedEuros(pay.receivedCents))}
                  </p>
                )}
              </td>
              <td className={`${td} tabular-nums`}>{formatPackDate(v.purchasedAt)}</td>
              <td className={td} data-testid="packs-in-use-payment">
                {pay && <PaymentCell instanceId={v.instanceId} p={pay} />}
              </td>
              <td className={`${td} text-right font-semibold tabular-nums`}>{v.reserved}</td>
              <td className={`${td} text-right font-semibold tabular-nums`}>{v.free}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
