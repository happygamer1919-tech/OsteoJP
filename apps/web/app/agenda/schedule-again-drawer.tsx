"use client";

import { Banner, DatePicker, Drawer, Field, TimeField, useToast } from "@osteojp/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { s } from "@/lib/i18n";
import { cloneAppointment } from "@/lib/scheduling/actions";
import { clinicClosedMessage } from "@/lib/scheduling/clinic-closed-message";
import { formatTimeOfDay, lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import type { AgendaAppointment, ConflictInfo } from "@/lib/scheduling/types";

/**
 * SCHED-15 — "Marcar novamente", ONE component behind BOTH entry points.
 *
 * Rodica's request, through the owner: open a finished appointment, press one
 * button, pick a date and a time, get an identical appointment without retyping
 * anything. It already existed on the patient profile's Marcações tab and was
 * reachable from nowhere else; the agenda drawer — where reception actually is
 * when a visit ends — had no such control. This file is the shared surface so
 * the two entry points cannot drift: one form, one predicate set, one action.
 *
 * WHY THE FORM ASKS FOR ONLY A DATE AND A TIME. Everything else is copied
 * server-side by `cloneAppointment` from the source row and is never re-asked
 * or editable here. Neither field is prefilled with the source's own date and
 * time: the clinic picks a genuinely new slot, and a prefilled past date is a
 * mis-click away from a refusal that reads like a bug.
 */

// The two eligibility predicates live in `lib/scheduling/schedule-again-core`,
// re-exported here so both entry points import them from the component they
// belong to. They are NOT defined here because the drawer's gate is pinned
// against `PACK_CONSUMING_STATUSES`, and importing `@osteojp/db` from a
// "use client" module pulls the `postgres` driver into the browser bundle - the
// page then does not build. That core file carries the full reasoning.
export { isEligibleForScheduleAgain, isPastConsuming } from "@/lib/scheduling/schedule-again-core";

const CONFLICT_HEADING: Record<ConflictInfo["kind"], keyof typeof s> = {
  therapist: "agenda.conflictTherapist",
  room: "agenda.conflictRoom",
  availability: "agenda.conflictAvailability",
  time_off: "agenda.conflictTimeOff",
};

/** One line per conflict kind, the same shape the edit drawer's banner uses. */
function ConflictSummary({ items }: { items: ConflictInfo[] }) {
  const kinds = (Object.keys(CONFLICT_HEADING) as ConflictInfo["kind"][]).filter((k) =>
    items.some((c) => c.kind === k),
  );
  return (
    <span className="flex flex-col gap-1">
      {kinds.map((kind) => (
        <span key={kind} className="block">
          <span className="font-medium">{s[CONFLICT_HEADING[kind]]}</span>
          {": "}
          {items
            .filter((c) => c.kind === kind)
            .map((c) => {
              const time = `${formatTimeOfDay(new Date(c.startsAt))}-${formatTimeOfDay(new Date(c.endsAt))}`;
              const prefix = [c.patientName, c.room].filter(Boolean).join(" · ");
              return prefix ? `${prefix}: ${time}` : time;
            })
            .join("; ")}
        </span>
      ))}
    </span>
  );
}

export function ScheduleAgainDrawer({
  source,
  onClose,
  onCreated,
}: {
  source: AgendaAppointment;
  onClose: () => void;
  /**
   * Called after a successful create, BEFORE `onClose`. The profile uses it to
   * refresh its own route (the action only revalidates /agenda); the agenda
   * drawer passes nothing and takes the revalidation.
   */
  onCreated?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Any edit to the slot CLEARS a standing conflict verdict. Without this the
   * button would still read "Marcar mesmo assim" after the operator moved to a
   * free slot, and the next press would send `allowConflict` for a slot nobody
   * ever checked — the override outliving the thing it was granted for.
   */
  function pick(setter: (v: string) => void) {
    return (v: string) => {
      setConflicts(null);
      setError(null);
      setter(v);
    };
  }

  async function onConfirm() {
    if (!date || !time) return;
    setSubmitting(true);
    setError(null);
    const startsAt = lisbonDateTimeToUtc(date, time).toISOString();
    const result = await cloneAppointment(source.id, startsAt, !!conflicts);
    setSubmitting(false);
    if (result.ok) {
      toast({ tone: "success", message: s["patients.scheduleAgainSuccess"] });
      onCreated?.();
      onClose();
      return;
    }
    // SCHED-15. Four refusals get their own sentence and everything else takes
    // the generic one. `conflict` is the only one the override may reach: the
    // other three are facts about the slot, the clinic or the actor that
    // pressing again cannot change, and offering "mesmo assim" for them would be
    // the §1.3 shape — a refusal wearing the face of one you can press past.
    if (result.error === "conflict") {
      setConflicts(result.conflicts ?? []);
    } else if (result.error === "outside_availability") {
      const w = result.availabilityWindows ?? [];
      setError(
        w.length === 0
          ? s["appointment.outsideAvailabilityNoWindows"]
          : `${s["appointment.outsideAvailability"]} ${s["appointment.outsideAvailabilityWindows"]} ` +
            w.map((x) => `${x.startTime}-${x.endTime}`).join(", "),
      );
    } else if (result.error === "clinic_closed") {
      // 0085. The clinic is shut at that hour. A plain message, NOT the
      // conflict banner: that banner turns the button into "Marcar mesmo
      // assim", and the server raises this outside the override. Before this
      // branch the refusal fell through to the generic sentence below - and
      // before the server check existed, the clone was simply written.
      setError(clinicClosedMessage(result.clinicClosure));
    } else if (result.error === "location_not_assigned") {
      setError(s["errors.forbidden"]);
    } else {
      setError(s["patients.scheduleAgainError"]);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={s["patients.scheduleAgain"]}
      closeLabel={s["common.close"]}
      cancelLabel={s["common.cancel"]}
      confirmLabel={conflicts ? s["appointment.saveAnyway"] : s["patients.scheduleAgainConfirm"]}
      confirmVariant={conflicts ? "destructive" : "primary"}
      confirmDisabled={!date || !time}
      confirmLoading={submitting}
      onConfirm={() => void onConfirm()}
    >
      <div className="flex flex-col gap-4">
        <Field label={s["appointment.date"]} required>
          <DatePicker
            value={date === "" ? null : date}
            onChange={pick(setDate)}
            triggerLabel={s["appointment.date"]}
          />
        </Field>
        <Field label={s["appointment.time"]} required>
          <TimeField value={time} onChange={pick(setTime)} />
        </Field>
        {conflicts && (
          <Banner tone="warning">
            <ConflictSummary items={conflicts} />
          </Banner>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Drawer>
  );
}
