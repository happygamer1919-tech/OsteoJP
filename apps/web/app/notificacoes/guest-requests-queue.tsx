"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GlassCard } from "@osteojp/ui";

import {
  convertGuestRequest,
  dismissGuestRequest,
  listGuestRequestMatches,
  type GuestConvertError,
  type GuestPatientMatch,
} from "@/lib/scheduling/guest-convert";
import { bookingDeepLink, pressAction } from "@/lib/scheduling/guest-convert-handoff";
import { s } from "@/lib/i18n";

/**
 * ITEM 6 — reception's queue of GUEST booking requests.
 *
 * GUEST-06 MADE THIS A CLIENT COMPONENT. It was a server component while it only
 * displayed; converting acts in place, can fail per row, and the several-matches
 * case has to ask a question before anything is written. That is the same
 * reasoning that made the pedido queue above it a client component, and it holds
 * no queue data for the same reason: the list is a server prop, and a successful
 * convert leaves the queue because `revalidatePath` re-derived the DATA, never
 * because this component spliced a row out of an array it owns.
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
 * WHICH IS WHY CONVERT BRANCHES ON THE MARK AND NOT ON A PREFERENCE. A row with
 * zero matches converts in one press, because there is no question to ask. A row
 * with one or more opens the dialog FIRST and cannot be converted without an
 * answer — the button does not carry a default the impatient press through. The
 * server refuses an unanswered convert as well (`validation`); this is the
 * courtesy half, exactly as STAFF-06 framed the pinned selector.
 *
 * THE REQUESTED SERVICE IS DELIBERATELY NOT SHOWN HERE, and it is not an
 * oversight. PG4 forbids the notifications page carrying a service name, and
 * lib/notifications/centre.test.ts enforces it over the whole FILE rather than
 * over the notification list alone. A guest's service is arguably a different
 * category - they chose it themselves on a public form and they have no clinical
 * record for it to be about - but PG4 is a launch gate and payload minimisation
 * is maintained for counsel, so the guard was left completely untouched and the
 * question was raised instead. See LE-guest-queue-service-name.
 * The service still reaches the booking drawer: convert returns its ID and the
 * agenda preselects it, so it is never rendered onto this page.
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
  /**
   * OPTION B: reception created the person and this row stayed in the queue,
   * because nothing has recorded a booking against the request. It renders as
   * `Convertido - sem marcação` and its only action is the dismiss.
   *
   * IT REPLACES BOTH OTHER MARKS RATHER THAN JOINING THEM. "New client" and
   * "may already be a patient" are questions about WHO this is, and once
   * reception has answered that question on this row the answer is no longer
   * the thing to show - what is left to do is.
   */
  converted: boolean;
};

function messageFor(err: GuestConvertError): string {
  switch (err) {
    case "forbidden":
      return s["guest.error.forbidden"];
    case "not_found":
      return s["guest.error.notFound"];
    case "already_handled":
      return s["guest.error.alreadyHandled"];
    case "location_not_assigned":
      return s["guest.error.locationNotAssigned"];
    case "match_not_found":
      return s["guest.error.matchNotFound"];
    case "not_converted":
      return s["guest.error.notConverted"];
    case "validation":
      return s["guest.error.generic"];
  }
}

/** Open dialog state. `matches: null` means the fetch is still in flight. */
type ResolveState = {
  requestId: string;
  matches: GuestPatientMatch[] | null;
};

export function GuestRequestsQueue({ rows }: { rows: GuestRequestRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, GuestConvertError>>({});
  const [resolving, setResolving] = useState<ResolveState | null>(null);

  function clearError(requestId: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
  }

  function convert(requestId: string, resolution: Parameters<typeof convertGuestRequest>[1]) {
    setBusyId(requestId);
    clearError(requestId);
    startTransition(async () => {
      const result = await convertGuestRequest(requestId, resolution);
      setBusyId(null);
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [requestId]: result.error }));
        return;
      }
      setResolving(null);
      // THE HANDOFF. The convert wrote a patient and marked the request handled;
      // the APPOINTMENT is made by the ordinary staff flow, which this deep link
      // opens with the patient locked and the service, clinic and preferred date
      // filled in. Every booking guard lives on that path and none is duplicated
      // here. `push`, not `replace`: reception can come back to the queue.
      router.push(bookingDeepLink(result.data.patientId, result.data.prefill));
    });
  }

  /**
   * THE DISMISS. It takes a converted row off the queue and goes nowhere - no
   * router push, because there is nothing to hand off to. `revalidatePath` on
   * the server re-derives the list, exactly as the convert does, so this
   * component still never splices a row out of an array it owns.
   */
  function dismiss(requestId: string) {
    setBusyId(requestId);
    clearError(requestId);
    startTransition(async () => {
      const result = await dismissGuestRequest(requestId);
      setBusyId(null);
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [requestId]: result.error }));
        return;
      }
      router.refresh();
    });
  }

  function openResolve(requestId: string) {
    clearError(requestId);
    setResolving({ requestId, matches: null });
    startTransition(async () => {
      const result = await listGuestRequestMatches(requestId);
      if (!result.ok) {
        setResolving(null);
        setErrors((prev) => ({ ...prev, [requestId]: result.error }));
        return;
      }
      // Guard against a second row being opened while this fetch was in flight.
      setResolving((prev) =>
        prev && prev.requestId === requestId ? { ...prev, matches: result.data } : prev,
      );
    });
  }

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
        const err = errors[r.id];
        const busy = busyId === r.id;
        const dialogOpen = resolving?.requestId === r.id;
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
                {/* The mark, and only ONE of the three ever shows. A row is a
                    converted-but-unbooked one, or the ordinary new-client case,
                    or a possible match; rendering two would leave reception to
                    work out which applies. CONVERTED WINS because it is the only
                    one of the three that says what is left to DO. */}
                {r.converted ? (
                  <span
                    data-testid="guest-converted-no-booking"
                    className="rounded-full border border-warning px-2 py-0.5 text-xs text-v2-text-primary"
                  >
                    {s["guest.convertedNoBooking"]}
                  </span>
                ) : matchLabel ? (
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

              {err && (
                <div
                  role="alert"
                  data-testid="guest-convert-error"
                  className="rounded-v2 border border-v2-red-700 bg-surface-muted p-3"
                >
                  <p className="text-sm font-medium text-v2-text-primary">{messageFor(err)}</p>
                </div>
              )}

              <div className="flex justify-end">
                {/* ONE ACTION PER ROW, AND WHICH ONE IS DECIDED BY THE STATE
                    RATHER THAN OFFERED AS A PAIR. A converted row cannot be
                    converted again - the server refuses it as `already_handled`
                    - so showing the convert button beside the dismiss would be
                    offering a press that can only fail. */}
                {r.converted ? (
                  <button
                    type="button"
                    data-testid="guest-dismiss-button"
                    disabled={busy}
                    onClick={() => dismiss(r.id)}
                    className="inline-flex h-11 items-center rounded-v2 border border-v2-border px-4 text-sm font-medium text-v2-text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {busy ? s["guest.dismissing"] : s["guest.dismiss"]}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="guest-convert-button"
                    disabled={busy}
                    onClick={() =>
                      // ZERO MATCHES CONVERTS DIRECTLY; ANYTHING ELSE ASKS FIRST.
                      // The rule lives in `pressAction` so a suite can reach it —
                      // this repo renders components without a DOM, so a rule
                      // inside an onClick is a rule nothing can assert.
                      pressAction(r.possiblePatientMatches).kind === "convert_new"
                        ? convert(r.id, { kind: "new_patient" })
                        : openResolve(r.id)
                    }
                    className="inline-flex h-11 items-center rounded-v2 bg-v2-green-700 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-v2-green-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {busy ? s["guest.converting"] : s["guest.convert"]}
                  </button>
                )}
              </div>

              {dialogOpen && (
                <div
                  data-testid="guest-resolve-panel"
                  className="rounded-v2 border border-v2-border bg-surface-muted p-4"
                >
                  <p className="text-sm font-semibold text-v2-text-primary">
                    {s["guest.resolveTitle"]}
                  </p>
                  <p className="mt-1 text-sm text-v2-text-secondary">{s["guest.resolveHelp"]}</p>

                  {resolving.matches === null ? (
                    <p className="mt-3 text-sm text-v2-text-secondary">
                      {s["guest.resolveLoading"]}
                    </p>
                  ) : resolving.matches.length === 0 ? (
                    // The count said there was a match and the list has none.
                    // Said plainly rather than silently converting: the row was
                    // rendered from an older snapshot, and the honest answer is
                    // that the record it referred to is gone.
                    <p className="mt-3 text-sm text-v2-text-secondary">
                      {s["guest.resolveNoneFound"]}
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {resolving.matches.map((m) => (
                        <li
                          key={m.id}
                          data-testid="guest-resolve-match"
                          className="flex flex-wrap items-center justify-between gap-2 rounded-v2 border border-v2-border bg-surface-base p-3"
                        >
                          <span className="text-sm text-v2-text-primary">
                            {m.fullName}
                            <span className="ml-2 text-xs text-v2-text-secondary">
                              {s["guest.patientNumber"]} {m.patientNumber}
                              {m.nif ? ` · NIF ${m.nif}` : ""}
                            </span>
                          </span>
                          <button
                            type="button"
                            data-testid="guest-resolve-use-existing"
                            disabled={busy}
                            onClick={() =>
                              convert(r.id, { kind: "existing_patient", patientId: m.id })
                            }
                            className="inline-flex h-11 items-center rounded-v2 bg-v2-green-700 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-v2-green-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                          >
                            {s["guest.resolveUseExisting"]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setResolving(null)}
                      className="inline-flex h-11 items-center rounded-v2 border border-v2-border px-4 text-sm font-medium text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    >
                      {s["guest.resolveCancel"]}
                    </button>
                    {/* CREATE-NEW STAYS AVAILABLE WITH A MATCH ON SCREEN, and it
                        is not a trap door. Households share a number: a mother
                        booking for her son is not a duplicate. What the dialog
                        removes is the ability to reach this WITHOUT having seen
                        the alternatives. */}
                    <button
                      type="button"
                      data-testid="guest-resolve-create-new"
                      disabled={busy || resolving.matches === null}
                      onClick={() => convert(r.id, { kind: "new_patient" })}
                      className="inline-flex h-11 items-center rounded-v2 border border-v2-border px-4 text-sm font-medium text-v2-text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    >
                      {s["guest.resolveCreateNew"]}
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          </li>
        );
      })}
    </ul>
  );
}
