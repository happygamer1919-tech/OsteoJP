"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { confirmAppointmentRequest } from "@/lib/scheduling/actions";
import { s } from "@/lib/i18n";
import type { ConflictInfo } from "@/lib/scheduling/types";

/**
 * W13-04 — the reception confirm queue.
 *
 * A client component ONLY for the pending state and the per-row failure. It
 * holds no queue data: the list is a server prop, re-derived from the database
 * on every render, and a successful confirm calls revalidatePath so the row
 * leaves the queue because the DATA changed, not because this component removed
 * it. That is the same rule the unread badge follows, for the same reason — a
 * client-held copy of server state is a copy that a reload disagrees with.
 *
 * THE FAILURE IS PER ROW, NOT PER PAGE. Under the owner's option-B ruling a
 * confirm can genuinely fail while every other pedido in the queue is still
 * confirmable, so the conflict message renders inside the row it belongs to and
 * the rest of the list stays usable.
 */

export type PendingRequestView = {
  /**
   * KEYED ON THE APPOINTMENT, NOT ON THE NOTIFICATION. SR-31.
   *
   * The notification used to be the row's identity because the queue was derived
   * from it. It is now a LEFT JOIN that may be absent - a pedido whose
   * best-effort emit was lost still belongs in this queue - so keying on it
   * would give a null key for exactly the rows that matter most.
   */
  appointmentId: string;
  patientName: string | null;
  /** Preformatted in Europe/Lisbon by the server — see page.tsx `stamp`. */
  when: string;
  requestedAt: string;
};

type RowError =
  | { code: "conflict"; conflicts: ConflictInfo[] }
  | { code: "notFound" }
  | { code: "forbidden" }
  // INC-08 / 0061: the database refused two overlapping CONFIRMED appointments.
  // Its own code and not "conflict": the conflict branch renders a list and
  // implies a retry is possible, and this refusal is absolute.
  | { code: "doubleBooked" }
  | { code: "generic" };

const TIME_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Lisbon",
};

/** A conflicting occupant, named without naming the patient beyond what the
 *  centre already shows: staff reading this queue are entitled to the name, and
 *  "conflicts with something" is not actionable. */
function conflictLine(c: ConflictInfo): string {
  const when = new Date(c.startsAt).toLocaleString("pt-PT", TIME_FMT);
  return c.patientName ? `${when} · ${c.patientName}` : when;
}

function messageFor(err: RowError): string {
  switch (err.code) {
    case "conflict":
      return s["requests.error.conflict"];
    case "notFound":
      return s["requests.error.notFound"];
    case "forbidden":
      return s["requests.error.forbidden"];
    case "doubleBooked":
      return s["requests.error.doubleBooked"];
    default:
      return s["requests.error.generic"];
  }
}

export function PendingRequests({ items }: { items: PendingRequestView[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, RowError>>({});

  function confirm(appointmentId: string) {
    setBusyId(appointmentId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[appointmentId];
      return next;
    });
    startTransition(async () => {
      const result = await confirmAppointmentRequest(appointmentId);
      setBusyId(null);
      if (result.ok) return; // revalidatePath removes the row
      if (result.error === "conflict") {
        setErrors((prev) => ({
          ...prev,
          [appointmentId]: { code: "conflict", conflicts: result.conflicts ?? [] },
        }));
        return;
      }
      const code: RowError["code"] =
        result.error === "not_found"
          ? "notFound"
          : result.error === "double_booked"
            ? "doubleBooked"
            : result.error === "forbidden" || result.error === "unauthenticated"
              ? "forbidden"
              : "generic";
      setErrors((prev) => ({ ...prev, [appointmentId]: { code } as RowError }));
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-v2 border border-v2-border bg-surface-muted p-8 text-center">
        <p className="text-sm font-medium text-v2-text-primary">{s["requests.empty"]}</p>
        <p className="mt-1 text-sm text-v2-text-secondary">{s["requests.emptyHint"]}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => {
        const err = errors[r.appointmentId];
        const busy = pending && busyId === r.appointmentId;
        return (
          <li
            key={r.appointmentId}
            className="rounded-v2 border border-v2-border bg-surface-base p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-v2-text-primary">
                {r.patientName ?? s["notifications.noPatient"]}
              </span>
              <span className="text-xs text-v2-text-secondary">
                {s["requests.requestedAt"]} {r.requestedAt}
              </span>
            </div>

            <p className="mt-1 text-sm text-v2-text-primary">{r.when}</p>

            {err && (
              <div
                role="alert"
                className="mt-3 rounded-v2 border border-v2-red-700 bg-surface-muted p-3"
              >
                <p className="text-sm font-medium text-v2-text-primary">{messageFor(err)}</p>
                {err.code === "conflict" && err.conflicts.length > 0 && (
                  <p className="mt-1 text-sm text-v2-text-secondary">
                    {s["requests.error.conflictWith"]}{" "}
                    {err.conflicts.map(conflictLine).join(" · ")}
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/marcacoes?appointment=${r.appointmentId}`}
                className="text-sm font-medium text-v2-green-800 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                {s["requests.openAppointment"]}
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => confirm(r.appointmentId)}
                className="inline-flex h-11 items-center rounded-v2 bg-v2-green-700 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-v2-green-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                {busy ? s["requests.confirming"] : s["requests.confirm"]}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
