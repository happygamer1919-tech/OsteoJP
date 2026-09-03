"use client";

import { useState, useTransition } from "react";
import { DatePicker, Dialog, Field, Select, TimeField, useToast } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import type { Option } from "@/lib/scheduling/types";
import { createAgendaBlockAction, createAgendaBlockBatchAction } from "./block-actions";
import type { LoteEnd } from "@/lib/scheduling/lote";

/**
 * W12-28 - "Bloquear horário" dialog opened from the agenda. Creates a pontual
 * (same-day hour range) time_off block via the existing createAgendaBlockAction ->
 * createTimeOffBlock (settings:manage-gated). The block then renders as a
 * BlockSpan and excludes booking through the existing paths - no new model. The
 * agenda refreshes on success; an overlap is warned, never cancelled.
 */
/** PL-27: clinical week order (Monday first), values are JS getDay(). */
const BLOCK_WEEKDAYS = [
  { value: 1, key: "admin.workingHours.mon" },
  { value: 2, key: "admin.workingHours.tue" },
  { value: 3, key: "admin.workingHours.wed" },
  { value: 4, key: "admin.workingHours.thu" },
  { value: 5, key: "admin.workingHours.fri" },
  { value: 6, key: "admin.workingHours.sat" },
  { value: 0, key: "admin.workingHours.sun" },
] as const;

export function BlockTimeDialog({
  therapists,
  defaultTherapistId,
  lockTherapist = false,
  slot,
  onClose,
  onDone,
}: {
  therapists: Option[];
  /** Preselect this therapist (e.g. the agenda's single-therapist filter). */
  defaultTherapistId?: string | null;
  /** ITEM 3: a THERAPIST blocks only their own schedule, so the selector is
   *  pinned to `defaultTherapistId` and rendered as a label rather than a
   *  control. THE LOCK IS A COURTESY, NOT THE ENFORCEMENT - the server refuses
   *  a block whose target is not the acting therapist
   *  (assertTargetInScheduleScope, scope kind "self"), which is what actually
   *  holds when the request does not come from this form. INC-08 is the
   *  precedent: the Estado Select offered every status with no server check and
   *  reception reached an illegal transition in one click. */
  lockTherapist?: boolean;
  /** Prefill date/time when opened from an empty slot. */
  slot?: { date: string; time: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [userId, setUserId] = useState(defaultTherapistId ?? "");
  const [date, setDate] = useState(slot?.date ?? "");
  const [startTime, setStartTime] = useState(slot?.time ?? "");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  // PL-27: the agenda blocks a slot; this repeats that same slot. Off by
  // default, so the one-off block - still the common case - is unchanged.
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [everyWeeks, setEveryWeeks] = useState(1);
  const [endMode, setEndMode] = useState<LoteEnd["kind"]>("count");
  const [count, setCount] = useState(4);
  const [until, setUntil] = useState("");
  const [pending, startTransition] = useTransition();

  const field =
    "rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

  function submit() {
    if (!userId || !date || !startTime || !endTime) {
      setError(s["agenda.block.incomplete"]);
      return;
    }
    setError(null);
    startTransition(async () => {
      const base = { userId, date, startTime, endTime };
      const r = repeat
        ? await createAgendaBlockBatchAction({
            ...base,
            weekdays,
            everyWeeks,
            end: endMode === "until" ? { kind: "until", date: until } : { kind: "count", count },
          })
        : await createAgendaBlockAction(base);
      if (r.ok) {
        const overlapped = !!r.overlaps && r.overlaps > 0;
        toast({
          tone: overlapped ? "info" : "success",
          message: overlapped ? s["agenda.block.overlapWarn"] : s["agenda.block.created"],
        });
        onDone();
        return;
      }
      setError(r.error === "forbidden" ? s["errors.forbidden"] : s["agenda.block.error"]);
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={s["agenda.blockTime"]}
      confirmLabel={s["agenda.block.confirm"]}
      onConfirm={submit}
      confirmLoading={pending}
      cancelLabel={s["common.cancel"]}
    >
      <div className="flex flex-col gap-3">
        <Field label={s["appointment.therapist"]} required>
          {lockTherapist ? (
            // Rendered as TEXT, not a disabled <select>. A disabled control
            // still reads as "a choice you cannot make right now"; for a
            // therapist there is no choice to make at all.
            <p className="text-sm text-v2-text-primary" data-testid="block-therapist-locked">
              {therapists.find((o) => o.id === userId)?.label ?? ""}
            </p>
          ) : (
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} data-testid="block-therapist">
              <option value="">{s["appointment.selectTherapist"]}</option>
              {therapists.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{s["appointment.date"]}</span>
          <DatePicker
            value={date === "" ? null : date}
            onChange={setDate}
            triggerLabel={s["appointment.date"]}
            testId="block-date"
          />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">{s["agenda.block.start"]}</span>
            {/* W12-31: 24h TimeField replaces the native time input (AM/PM under a
                12h browser locale). */}
            <div data-testid="block-start">
              <TimeField value={startTime} onChange={setStartTime} className="w-full" />
            </div>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">{s["agenda.block.end"]}</span>
            <div data-testid="block-end">
              <TimeField value={endTime} onChange={setEndTime} className="w-full" />
            </div>
          </label>
        </div>
        {/* PL-27: repeat the block. Same vocabulary as Agendar lote and the
            Bloquear horario modal, driven by the same generator, so all three
            recurrence forms behave identically. Ticking no weekday repeats the
            chosen date's own weekday. */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
            data-testid="block-repeat"
          />
          <span className="font-medium">{s["agenda.block.repeat"]}</span>
        </label>

        {repeat && (
          <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-3">
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs font-medium text-text-primary">{s["lote.weekdays"]}</legend>
              <div className="flex flex-wrap gap-1" data-testid="block-weekdays">
                {BLOCK_WEEKDAYS.map(({ value, key }) => {
                  const on = weekdays.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setWeekdays((prev) =>
                          prev.includes(value) ? prev.filter((w) => w !== value) : [...prev, value],
                        )
                      }
                      className={`h-9 min-w-12 rounded border px-2 text-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                        on
                          ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                          : "border-border-strong text-text-secondary hover:bg-surface-muted"
                      }`}
                    >
                      {s[key].slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["lote.everyWeeks"]}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={String(everyWeeks)}
                  onChange={(e) => setEveryWeeks(Math.max(1, Number(e.target.value) || 1))}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["lote.endMode"]}</span>
                <Select
                  value={endMode}
                  aria-label={s["lote.endMode"]}
                  onChange={(e) => setEndMode(e.target.value as LoteEnd["kind"])}
                >
                  <option value="count">{s["lote.endAfterCount"]}</option>
                  <option value="until">{s["lote.endOnDate"]}</option>
                </Select>
              </label>
              {endMode === "count" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{s["agenda.block.count"]}</span>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={String(count)}
                    onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
                    className={field}
                    data-testid="block-count"
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{s["lote.until"]}</span>
                  <DatePicker
                    value={until === "" ? null : until}
                    onChange={setUntil}
                    triggerLabel={s["lote.until"]}
                    testId="block-until"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
    </Dialog>
  );
}
