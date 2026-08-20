import Link from "next/link";

import { s } from "@/lib/i18n";

/**
 * Q-LE-REMINDERS-LANDLINE-1 — the patients whose reminder will not reach them.
 *
 * A SERVER COMPONENT WITH NO ACTIONS, like the stuck-recording list beside it.
 * The action is a conversation: reception asks the patient for a mobile next
 * time they speak. There is no button this screen could offer that would change
 * the number, and a "fix" control that opened the patient record is a link, not
 * an action — so it is a link.
 *
 * WHY THE LIST IS FORWARD-LOOKING AND NOT A LOG. It shows who is GOING to miss a
 * reminder, derived from their stored number and their next appointment, rather
 * than who already missed one. A log arrives after the 48h reminder was due,
 * which is exactly when there is least time to do anything about it.
 */

export type UnreachablePatientRow = {
  patientId: string;
  fullName: string;
  phone: string | null;
  /** Preformatted in Europe/Lisbon by the server — see page.tsx `stamp`. */
  nextAppointment: string;
};

export function UnreachablePatients({ rows }: { rows: UnreachablePatientRow[] }) {
  if (rows.length === 0) {
    /**
     * RENDERED, NOT HIDDEN, and the hint says what empty MEANS. Same reason as
     * the section above it: a block that vanishes when the list is empty makes
     * "nobody is affected" and "this list never loaded" the same screen, which
     * is INC-05's shape.
     */
    return (
      <div className="rounded-v2 border border-v2-border bg-surface-muted p-8 text-center">
        <p className="text-sm font-medium text-v2-text-primary">
          {s["reminders.unreachable.empty"]}
        </p>
        <p className="mt-1 text-sm text-v2-text-secondary">
          {s["reminders.unreachable.emptyHint"]}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li
          key={r.patientId}
          className="rounded-v2 border border-v2-border bg-surface-base p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-v2-text-primary">{r.fullName}</span>
            {/* THE NUMBER AS STORED, not normalised. Reception is going to read
                it back to a person, and "+351212345678" is not how anybody says
                a telephone number out loud. */}
            <span className="text-xs text-v2-text-secondary">
              {r.phone ?? s["reminders.unreachable.noPhone"]}
            </span>
          </div>

          <p className="mt-1 text-sm text-v2-text-primary">
            {s["reminders.unreachable.nextAppointment"]}: {r.nextAppointment}
          </p>

          <div className="mt-2">
            <Link
              href={`/patients/${r.patientId}`}
              className="text-sm font-medium text-v2-green-800 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {s["reminders.unreachable.openPatient"]}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
