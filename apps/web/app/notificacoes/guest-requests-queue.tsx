import { GlassCard } from "@osteojp/ui";
import { s } from "@/lib/i18n";

/**
 * ITEM 6 — reception's queue of GUEST booking requests.
 *
 * A SERVER COMPONENT, unlike the pedido queue above it. That one is a client
 * component because confirming a pedido acts in place and can fail per row.
 * This list currently only DISPLAYS: converting a guest into a patient plus an
 * appointment is the next piece of work, and building the interactivity before
 * the action exists would be scaffolding with nothing behind it.
 *
 * THE NEW-CLIENT MARK IS THE POINT OF THIS LIST. Every row is somebody with no
 * record, so "new client" is the default state and is shown on every row rather
 * than inferred from its absence. When the phone matches an existing patient the
 * row says so INSTEAD — and says it as a POSSIBILITY, never as a link. 0062's
 * precedent decides this: resolvePatientByProvenPhone refuses when several
 * patients share a number rather than picking one, because mis-linking a medical
 * record is the worst outcome available. Reception decides; the screen only
 * tells them what it noticed.
 *
 * THE REQUESTED SERVICE IS DELIBERATELY NOT SHOWN HERE, and it is not an
 * oversight. PG4 forbids the notifications page carrying a service name, and
 * lib/notifications/centre.test.ts enforces it over the whole FILE rather than
 * over the notification list alone. A guest's service is arguably a different
 * category - they chose it themselves on a public form and they have no clinical
 * record for it to be about - but PG4 is a launch gate and payload minimisation
 * is maintained for counsel, so the guard was left completely untouched and the
 * question was raised instead. See LE-guest-queue-service-name.
 * Reception sees the service when they open the request to convert it.
 */

export type GuestRequestRow = {
  id: string;
  fullName: string;
  phone: string;
  locationName: string | null;
  /**
   * THE GUEST'S STATED PREFERENCE, preformatted in Europe/Lisbon by the server —
   * "20/08/2026, manhã" — and NOT a time anybody was offered. Under the
   * GUEST-04 Option A ruling the public form shows no availability at all, so a
   * precise time here would be an invention; the page derives this through
   * `decodeGuestPreferredWindow` and falls back to nothing. Reception resolves
   * the real slot when they call, which is R-GUEST-1 working as intended.
   */
  when: string;
  requestedAt: string;
  possiblePatientMatches: number;
};

export function GuestRequestsQueue({ rows }: { rows: GuestRequestRow[] }) {
  if (rows.length === 0) {
    return (
      <GlassCard className="p-4">
        <p className="text-sm text-v2-text-secondary">{s["guest.queueEmpty"]}</p>
      </GlassCard>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const matchLabel =
          r.possiblePatientMatches === 0
            ? null
            : r.possiblePatientMatches === 1
              ? s["guest.possibleMatch"]
              : s["guest.possibleMatchMany"];
        return (
          // THE TESTID IS ON THE <li>, NOT ON GlassCard. GlassCard destructures
          // a fixed prop list and silently DROPS anything else, so a data-*
          // attribute on it reaches neither the DOM nor anything looking for it.
          // The same mistake was made on the Marcações row earlier today and
          // caught there too; it is written down here so the third time does not
          // need a test to find it.
          <li key={r.id} data-testid="guest-request-row">
            <GlassCard className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-v2-text-primary">{r.fullName}</span>
                {/* The mark, and only ONE of the two ever shows: a row is either
                    the ordinary new-client case or a possible match, and
                    rendering both would leave reception to work out which. */}
                {matchLabel ? (
                  <span
                    data-testid="guest-possible-match"
                    className="rounded-full border border-warning px-2 py-0.5 text-xs text-v2-text-primary"
                  >
                    {matchLabel}
                  </span>
                ) : (
                  <span
                    data-testid="guest-new-client"
                    className="rounded-full border border-v2-border px-2 py-0.5 text-xs text-v2-text-secondary"
                  >
                    {s["guest.newClient"]}
                  </span>
                )}
              </div>

              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-v2-text-secondary">
                <div className="flex gap-1">
                  <dt>{s["guest.phone"]}:</dt>
                  <dd className="text-v2-text-primary">{r.phone}</dd>
                </div>
                {r.locationName && (
                  <div className="flex gap-1">
                    <dt>{s["admin.workingHours.location"]}:</dt>
                    <dd className="text-v2-text-primary">{r.locationName}</dd>
                  </div>
                )}
                {/* "Preferência", not "Data". The label is doing work: this row
                    is what somebody asked for, and reading it as a booked date
                    is the mistake the whole Option A shape exists to prevent. */}
                <div className="flex gap-1">
                  <dt>{s["guest.preferredWhen"]}:</dt>
                  <dd className="text-v2-text-primary">{r.when}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>{s["guest.requestedAt"]}:</dt>
                  <dd>{r.requestedAt}</dd>
                </div>
              </dl>
            </GlassCard>
          </li>
        );
      })}
    </ul>
  );
}
