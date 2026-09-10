"use client";

import { SkeletonText, SlotPicker, type SlotOption } from "@osteojp/ui";
import { useEffect, useState } from "react";

import { s } from "@/lib/i18n";
import { getTherapistDayAvailability } from "@/lib/scheduling/actions";
import { SLOT_MINUTES, formatTimeOfDay } from "@/lib/scheduling/time";
import { noFreeReason } from "@/lib/scheduling/day-availability-core";
import type { DayAvailability, IsoInterval } from "@/lib/scheduling/types";

/**
 * Availability panel for the new-appointment flow (SPEC-appointments §5).
 * Once a therapist and date are picked, fetches that therapist's day via
 * getTherapistDayAvailability (server action, same getTherapistAvailability
 * query the batch engine uses) and renders working / booked windows plus a
 * SlotPicker of free starting times sized to the current duration. Picking a
 * chip writes straight into the drawer's time field.
 */
export function AvailabilityPanel({
  therapistId,
  date,
  locationId,
  durationMin,
  time,
  onPickTime,
}: {
  therapistId: string;
  date: string;
  locationId: string;
  durationMin: number;
  time: string;
  onPickTime: (hhmm: string) => void;
}) {
  // Fetch keyed by therapist/date/location. `result` only ever holds the
  // outcome for the key it was fetched with, so a stale response landing
  // after the key has already moved on is naturally ignored by the render-time
  // comparison below rather than flashing outdated data — the effect body
  // itself never calls setState, only its async callback does.
  const key = `${therapistId}|${date}|${locationId}`;
  const [result, setResult] = useState<
    | { key: string; status: "error" }
    | { key: string; status: "ready"; day: DayAvailability }
    | null
  >(null);

  useEffect(() => {
    if (!therapistId || !date) return;
    let cancelled = false;
    getTherapistDayAvailability({ therapistId, date, locationId: locationId || null })
      .then((r) => {
        if (cancelled) return;
        setResult(r.ok ? { key, status: "ready", day: r.data } : { key, status: "error" });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [key, therapistId, date, locationId]);

  if (!therapistId || !date) return null;

  const state: { status: "loading" } | { status: "error" } | { status: "ready"; day: DayAvailability } =
    result && result.key === key ? result : { status: "loading" };
  const slots = state.status === "ready" ? freeSlotOptions(state.day.free, durationMin) : [];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/60 p-3">
      <span className="text-xs font-medium text-text-primary">
        {s["appointment.availabilityTitle"]}
      </span>

      {state.status === "loading" && <SkeletonText lines={2} />}

      {state.status === "error" && (
        <p role="alert" className="text-sm text-error">
          {s["appointment.availabilityError"]}
        </p>
      )}

      {state.status === "ready" && (
        <AvailabilityBody
          day={state.day}
          slots={slots}
          time={time}
          onPickTime={onPickTime}
        />
      )}
    </div>
  );
}

function AvailabilityBody({
  day,
  slots,
  time,
  onPickTime,
}: {
  day: DayAvailability;
  slots: SlotOption[];
  time: string;
  onPickTime: (hhmm: string) => void;
}) {
  // SCHED-20: the three reasons a day offers nothing are computed once, from
  // the same day this component renders, so the sentence and the intervals
  // above it can never describe different days.
  const reason = noFreeReason(day);

  if (reason === "no_working_hours") {
    return (
      <p className="text-sm text-text-secondary">
        {s["appointment.availabilityNoWorkingHours"]}
      </p>
    );
  }

  return (
    <>
      <dl className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <dt className="text-xs text-text-secondary">{s["appointment.availabilityWorking"]}</dt>
          <dd className="text-xs text-text-primary">{joinIntervals(day.working)}</dd>
        </div>
        {day.booked.length > 0 && (
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-text-secondary">{s["appointment.availabilityBooked"]}</dt>
            <dd className="text-xs text-text-primary">{joinIntervals(day.booked)}</dd>
          </div>
        )}
        {/* SCHED-20 - THE LINE THAT WAS MISSING.
            The panel listed working hours and bookings and NOTHING about
            blocks, so a blocked day read as "eleven hours, one booked, none
            free" and the reader went looking through the appointment list for
            an hour that was never the problem. The block is the third thing
            that consumes a day and it now says so, with the note, because the
            note is what tells reception whether the block is a mistake. */}
        {day.blocks.length > 0 && (
          <div className="flex items-baseline gap-2" data-testid="availability-blocked">
            <dt className="text-xs font-medium text-text-secondary">
              {s["appointment.availabilityBlocked"]}
            </dt>
            <dd className="flex flex-col gap-0.5 text-xs text-text-primary">
              {day.blocks.map((b) => (
                <span key={b.blockId}>
                  {formatTimeOfDay(new Date(b.start))}-{formatTimeOfDay(new Date(b.end))}
                  {b.note ? <span className="text-text-secondary"> · {b.note}</span> : null}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {slots.length > 0 ? (
        <SlotPicker
          aria-label={s["appointment.availabilityFreeSlots"]}
          slots={slots}
          value={time}
          onChange={onPickTime}
        />
      ) : (
        // "Sem horarios livres neste dia" NAMES BOOKING AS THE CAUSE, so it may
        // only appear when booking is the cause. When a block emptied the day
        // the sentence points at the block and at the tool that undoes it -
        // which is a different action from moving an appointment.
        <p
          className="text-sm text-text-secondary"
          data-testid={reason === "blocked" ? "availability-blocked-reason" : "availability-no-slots"}
        >
          {reason === "blocked"
            ? s["appointment.availabilityBlockedNoSlots"]
            : s["appointment.availabilityFullyBooked"]}
        </p>
      )}
    </>
  );
}

/** "09:00-13:00, 14:00-18:00" — plain hyphen, brand forbids en/em dashes. */
function joinIntervals(intervals: IsoInterval[]): string {
  return intervals
    .map((i) => `${formatTimeOfDay(new Date(i.start))}-${formatTimeOfDay(new Date(i.end))}`)
    .join(", ");
}

/**
 * Candidate start times: every SLOT_MINUTES step inside a free window (always
 * including the window's own start, even if unaligned) for which a booking of
 * durationMin still fits before the window ends.
 */
function freeSlotOptions(free: IsoInterval[], durationMin: number): SlotOption[] {
  const stepMs = SLOT_MINUTES * 60_000;
  const durationMs = Math.max(durationMin, 0) * 60_000;
  const out: SlotOption[] = [];
  for (const interval of free) {
    const start = new Date(interval.start).getTime();
    const end = new Date(interval.end).getTime();
    for (let t = start; t + durationMs <= end; t += stepMs) {
      const label = formatTimeOfDay(new Date(t));
      out.push({ value: label, label });
    }
  }
  return out;
}
