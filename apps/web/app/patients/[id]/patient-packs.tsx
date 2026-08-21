import { Card, StatusChip } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import type { PackInstanceView } from "@/lib/packs/instances";

/**
 * The patient's pacotes, with sessions left.
 *
 * ==========================================================================
 * RB-02 REMOVED THE CONSUMIR / RESTAURAR CONTROLS, AND THE COMPONENT STOPPED
 * BEING A CLIENT COMPONENT AS A RESULT.
 * ==========================================================================
 * They were the staff manual adjust for the under-24h / no-show rule: press
 * "consumir" and the balance dropped by one, with an audit row and **no
 * appointment**. No who, no when, no slot — and nothing that could ever
 * reconcile the number against the diary.
 *
 * A no-show is now an appointment with `status = 'no_show'`, and the derived
 * balance counts it. So the rule survives and the button does not: it is a
 * consequence of the data instead of something somebody has to remember, and it
 * can no longer be applied to a patient who has no appointment at all.
 *
 * THE SERVER ACTION WENT WITH IT. Removing the button alone would have left a
 * "use server" function callable by anything that can POST, still writing a
 * balance nothing can reconcile.
 *
 * WHAT THE NUMBER MEANS NOW: `sessionsAvailable` is DERIVED —
 * `total - legacyConsumed - linked appointments that are not cancelled`. It is
 * deliberately not called `sessionsRemaining`; that name belongs to the frozen
 * pre-0067 column, and reusing it for a different number is the conflation this
 * codebase keeps finding in its own instruments.
 */
export function PatientPacks({ instances }: { instances: PackInstanceView[] }) {
  if (instances.length === 0) return null;

  return (
    <Card title={s["packs.sectionTitle"]}>
      <ul className="flex flex-col gap-3">
        {instances.map((inst) => (
          <li
            key={inst.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">{inst.packName}</span>
              <span className="text-xs text-text-secondary">{inst.baseServiceName}</span>
            </div>
            <StatusChip tone={inst.active ? "success" : "neutral"}>
              {inst.sessionsAvailable}/{inst.sessionsTotal} {s["packs.sessions"]}
            </StatusChip>
          </li>
        ))}
      </ul>
      {/* WHERE THE SESSIONS WENT, said once under the list. Without it, a
          balance that moved because an appointment was booked elsewhere in the
          product looks like the number changing on its own. */}
      <p className="mt-3 text-xs text-text-secondary">{s["packs.derivedNote"]}</p>
    </Card>
  );
}
