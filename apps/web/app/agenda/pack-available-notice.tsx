"use client";

import { Button } from "@osteojp/ui";

import { s } from "@/lib/i18n";

export type AvailablePack = {
  packId: string;
  packName: string;
  sessionsTotal: number;
  sessionsAvailable: number;
};

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
 */
export function PackAvailableNotice({
  packs,
  onUse,
}: {
  packs: AvailablePack[];
  onUse: (packId: string) => void;
}) {
  if (packs.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-v2 border border-border-strong bg-surface-muted p-3"
      data-testid="pack-available-notice"
    >
      <span className="text-xs font-medium text-text-primary">
        {s["appointment.packAvailableNotice"]}
      </span>
      <ul className="flex flex-col gap-2">
        {packs.map((p) => (
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
