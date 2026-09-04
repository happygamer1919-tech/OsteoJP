"use client";

import { Button } from "@osteojp/ui";

import { s } from "@/lib/i18n";

export type AvailablePack = {
  packId: string;
  packName: string;
  /** The service every session of this pacote is. PACK-03. */
  baseServiceId: string;
  sessionsTotal: number;
  sessionsAvailable: number;
};

/**
 * PACK-03 — the pacotes this booking may actually be offered, given the service
 * on the form RIGHT NOW.
 *
 * ==========================================================================
 * THE OWNER'S RULE: A PACOTE BINDS TO ONE SERVICE. TEN NESA SESSIONS ARE
 * SPENDABLE ON NESA ONLY.
 * ==========================================================================
 * The schema has always said so — `service_packs.base_service_id` is NOT NULL —
 * and the retroactive linker has always enforced it (`link-core.ts`, refusal
 * `service_mismatch`). The create path was the one place that did not: it
 * offered a NESA pacote beside a Fisioterapia appointment, and pressing it
 * would have silently rewritten the service to NESA.
 *
 * NO SERVICE CHOSEN YET SHOWS EVERYTHING, and that is not a loophole. On a
 * fresh Nova marcação the service field is empty; the notice's whole purpose is
 * to say "this patient has already paid for sessions" BEFORE anybody thinks to
 * ask, and pressing Use then SETS the service to the pacote's own. Hiding it
 * until a service is picked would put the fact behind the very question the
 * notice exists to pre-empt. Once a service IS chosen the two are comparable,
 * and a mismatched pacote is never shown.
 *
 * PURE, and exported, so the rule can be tested without a drawer, a patient or
 * a database.
 */
export function offerablePacks(
  packs: readonly AvailablePack[],
  serviceId: string,
): AvailablePack[] {
  if (!serviceId) return [...packs];
  return packs.filter((p) => p.baseServiceId === serviceId);
}

/**
 * PACK-02 — "this patient is holding sessions they have already paid for".
 *
 * ==========================================================================
 * WHY IT IS A NOTICE AND NOT JUST THE PACOTE DROPDOWN THAT WAS ALREADY THERE
 * ==========================================================================
 * The dropdown answers a question reception has to think to ask. Most of the
 * time nobody asks it, because nothing on the screen suggests there is anything
 * to ask about - and the cost of not asking lands on the patient, who pays
 * twice for a session they already own. The notice is unprompted and carries
 * the count, so the fact arrives without anybody looking for it.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. No "0 sessions available"
 * row, no empty box: a notice that appears for every patient is a notice
 * reception stops reading, and then it is not there for the one patient it
 * mattered for.
 *
 * ONE CLICK SETS THE PACOTE, IT DOES NOT BOOK. `onUse` runs the drawer's own
 * `onPackChange`, which forces the pacote's base service and locks Serviço -
 * the same path as choosing it from the dropdown. Booking straight from here
 * would skip the therapist, date and time the form still needs, and a control
 * that says "marcar" and then does not is worse than one more click.
 *
 * THE SERVICE FILTER IS APPLIED HERE, INSIDE THE COMPONENT, and not by the
 * caller (PACK-03). A caller-side filter is one a future caller can forget, and
 * the thing it would forget is the owner's rule. Taking `serviceId` as a prop
 * means every render of this notice is filtered by construction.
 */
export function PackAvailableNotice({
  packs,
  serviceId,
  onUse,
}: {
  packs: AvailablePack[];
  /** The service the form holds right now. Empty string = none chosen yet. */
  serviceId: string;
  onUse: (packId: string) => void;
}) {
  const offerable = offerablePacks(packs, serviceId);
  if (offerable.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-v2 border border-border-strong bg-surface-muted p-3"
      data-testid="pack-available-notice"
    >
      <span className="text-xs font-medium text-text-primary">
        {s["appointment.packAvailableNotice"]}
      </span>
      <ul className="flex flex-col gap-2">
        {offerable.map((p) => (
          <li key={p.packId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-text-primary">
              {p.packName}
              {" · "}
              <span className="text-text-secondary">
                {p.sessionsAvailable} {s["packs.remaining"]} {s["packs.sessions"]}
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onUse(p.packId)}
              data-testid={`pack-use-${p.packId}`}
            >
              {s["appointment.packAvailableUse"]}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
