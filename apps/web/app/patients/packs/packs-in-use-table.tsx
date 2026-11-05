import Link from "next/link";

import { s } from "@/lib/i18n";
import { formatEurosShort, type PackInUseView } from "@/lib/packs/in-use";

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
 * PAGAMENTO IS A HEADER WITH EMPTY CELLS, on purpose. OsteoJP records no
 * payment against a pacote yet (invoices are per appointment), so there is
 * nothing true to put there. The page says "Pagamento: em breve" once, above
 * the table, instead of a red or green icon that would be invented.
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

/**
 * PACK-FICHA-01: the patient's ficha draws the same table for ONE patient, so
 * it leaves out NOME UTENTE (`showPatient={false}`) and names each of its two
 * tables (`testId`). Every other cell is the same, so the ficha and "Packs em
 * uso" cannot disagree about a pacote.
 */
export function PacksInUseTable({
  rows,
  showPatient = true,
  testId = "packs-in-use-table",
}: {
  rows: PackInUseView[];
  showPatient?: boolean;
  testId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid={testId}>
        <thead>
          <tr className="border-b border-v2-border">
            {showPatient && <th scope="col" className={th}>{s["packsInUse.colPatient"]}</th>}
            <th scope="col" className={th}>{s["packsInUse.colPack"]}</th>
            <th scope="col" className={th}>{s["packsInUse.colStarted"]}</th>
            <th scope="col" className={th}>{s["packsInUse.colPayment"]}</th>
            <th scope="col" className={`${th} text-right`}>{s["packsInUse.colReserved"]}</th>
            <th scope="col" className={`${th} text-right`}>{s["packsInUse.colFree"]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.instanceId} className="border-b border-v2-border" data-testid="packs-in-use-row">
              {showPatient && (
                <td className={td}>
                  <Link
                    href={`/patients/${v.patientId}`}
                    className="font-medium text-v2-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    {v.patientName}
                  </Link>
                </td>
              )}
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
              </td>
              <td className={`${td} tabular-nums`}>{formatPackDate(v.purchasedAt)}</td>
              <td className={td} data-testid="packs-in-use-payment" />
              <td className={`${td} text-right font-semibold tabular-nums`}>{v.reserved}</td>
              <td className={`${td} text-right font-semibold tabular-nums`}>{v.free}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
