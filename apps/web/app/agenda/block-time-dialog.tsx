"use client";

import { useState, useTransition } from "react";
import { Dialog, Field, Select, TimeField, useToast } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import type { Option } from "@/lib/scheduling/types";
import { createAgendaBlockAction } from "./block-actions";

/**
 * W12-28 - "Bloquear horário" dialog opened from the agenda. Creates a pontual
 * (same-day hour range) time_off block via the existing createAgendaBlockAction ->
 * createTimeOffBlock (settings:manage-gated). The block then renders as a
 * BlockSpan and excludes booking through the existing paths - no new model. The
 * agenda refreshes on success; an overlap is warned, never cancelled.
 */
export function BlockTimeDialog({
  therapists,
  defaultTherapistId,
  slot,
  onClose,
  onDone,
}: {
  therapists: Option[];
  /** Preselect this therapist (e.g. the agenda's single-therapist filter). */
  defaultTherapistId?: string | null;
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
      const r = await createAgendaBlockAction({ userId, date, startTime, endTime });
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
          <Select value={userId} onChange={(e) => setUserId(e.target.value)} data-testid="block-therapist">
            <option value="">{s["appointment.selectTherapist"]}</option>
            {therapists.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{s["appointment.date"]}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} data-testid="block-date" />
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
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
    </Dialog>
  );
}
