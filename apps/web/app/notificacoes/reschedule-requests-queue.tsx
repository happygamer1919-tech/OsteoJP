"use client";

import { useState, useTransition } from "react";

import { markRescheduleHandled } from "./actions";

/**
 * SEC-reschedule-request-has-no-row — reception's queue of patients who asked
 * to move an appointment. The screen INC-CONFIRM-10 said did not exist.
 *
 * ==========================================================================
 * WHAT THIS SECTION IS FOR, said in the copy rather than assumed
 * ==========================================================================
 * The owner pressed "Pedir remarcação" on a real confirm link, was shown
 * "Pedido recebido", and it reached nobody. The row now exists (migration
 * 0080), written inside the patient's own transaction so it cannot be lost the
 * way a best-effort notification emit can. This renders it.
 *
 * THE EMPTY STATE IS RENDERED, NOT HIDDEN, and it says what empty MEANS —
 * the same rule `StuckConsultations` states: a section that vanishes makes
 * "nobody has asked" and "the screen is broken" look identical, which is the
 * conflation that produced this incident in the first place.
 *
 * THE ONLY ACTION IS "MARK AS HANDLED", DELIBERATELY. There is no Reschedule
 * button here. Moving a booking happens in the agenda, where the conflict
 * checks and the slot lock are; a second write path onto appointment rows from
 * a queue screen is the double-booking family of incidents invited back. The
 * note under the list says so to the reader, because a queue that clears
 * without changing anything is otherwise easy to misread as having done the
 * rescheduling.
 */

export type RescheduleRequestRow = {
  id: string;
  patientName: string | null;
  /** Preformatted in Europe/Lisbon by the server — see page.tsx `stamp`. */
  appointmentWhen: string;
  requestedWhen: string;
  practitionerName: string | null;
  practitionerTwoName: string | null;
  viaLabel: string;
};

export function RescheduleRequestsQueue({
  rows,
  labels,
}: {
  rows: RescheduleRequestRow[];
  labels: {
    empty: string;
    emptyHint: string;
    requestedAt: string;
    appointment: string;
    practitioner: string;
    unknownPatient: string;
    unknownPractitioner: string;
    markHandled: string;
    marking: string;
    markFailed: string;
    note: string;
  };
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-v2 border border-v2-border bg-surface-muted p-8 text-center">
        <p className="text-sm font-medium text-v2-text-primary">{labels.empty}</p>
        <p className="mt-1 text-sm text-v2-text-secondary">{labels.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <Row key={r.id} row={r} labels={labels} />
        ))}
      </ul>
      <p className="px-1 text-xs text-v2-text-secondary">{labels.note}</p>
    </div>
  );
}

function Row({
  row,
  labels,
}: {
  row: RescheduleRequestRow;
  labels: {
    requestedAt: string;
    appointment: string;
    practitioner: string;
    unknownPatient: string;
    unknownPractitioner: string;
    markHandled: string;
    marking: string;
    markFailed: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  /**
   * THE FAILURE IS RENDERED IN PLACE AND SURVIVES THE TRANSITION.
   *
   * A press that silently does nothing is exactly the defect this whole card
   * exists to fix, one screen further in: the patient pressed and was told it
   * worked. If the UPDATE matches no row — somebody else cleared it first, or
   * the session lost its scope — the reader is told, and the row stays.
   */
  return (
    <li className="rounded-v2 border border-v2-border bg-surface-base p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-v2-text-primary">
          {row.patientName ?? labels.unknownPatient}
        </span>
        <span className="text-xs text-v2-text-secondary">
          {labels.requestedAt}: {row.requestedWhen}
        </span>
      </div>

      <p className="mt-1 text-sm text-v2-text-primary">
        {labels.appointment}: {row.appointmentWhen}
      </p>

      {/* BOTH practitioners are named when there are two. The owner's ruling is
          that either may be the one who has to move it, and this is where that
          becomes visible — no fan-out, no second row, just both names. */}
      <p className="mt-1 text-xs text-v2-text-secondary">
        {labels.practitioner}:{" "}
        {row.practitionerName ?? labels.unknownPractitioner}
        {row.practitionerTwoName !== null && <> · {row.practitionerTwoName}</>}
      </p>

      <p className="mt-1 text-xs text-v2-text-secondary">{row.viaLabel}</p>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setFailed(false);
              const result = await markRescheduleHandled(row.id);
              if (!result.ok) setFailed(true);
            })
          }
          className="inline-flex h-11 items-center rounded-v2 border border-v2-border px-3 text-sm font-medium text-v2-text-primary transition-colors hover:bg-surface-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {pending ? labels.marking : labels.markHandled}
        </button>
        {failed && (
          <span role="alert" className="text-xs text-v2-red-700">
            {labels.markFailed}
          </span>
        )}
      </div>
    </li>
  );
}
