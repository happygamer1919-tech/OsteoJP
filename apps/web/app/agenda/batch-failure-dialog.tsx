"use client";

import { useState } from "react";
import { Button, Input } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import type { BatchFailure } from "@/lib/scheduling/batch-core";
import {
  applyRebook,
  editRow,
  initFailureRows,
  type RebookOutcome,
} from "@/lib/scheduling/batch-failure-core";

/**
 * Partial-success failure dialog (W2-05, ruling G). The recorrente batch books
 * every free slot; this lists the busy ones with reason + nearest alternative
 * and lets the user adjust each slot's date/time and rebook it individually
 * through the same engine. Successes are never blocked.
 */
export function BatchFailureDialog({
  bookedCount,
  failures,
  onRebook,
  onClose,
}: {
  bookedCount: number;
  failures: BatchFailure[];
  /** Re-attempt ONE slot at the edited Lisbon date/time; resolves booked or the new failure. */
  onRebook: (date: string, hhmm: string) => Promise<RebookOutcome>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState(() => initFailureRows(failures));
  const [booked, setBooked] = useState(bookedCount);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function rebook(key: string): Promise<void> {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    setPendingKey(key);
    try {
      const outcome = await onRebook(row.date, row.hhmm);
      if (outcome.booked) setBooked((b) => b + 1);
      setRows((rs) => applyRebook(rs, key, outcome));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={s["batch.failureTitle"]}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-v2-float">
        <h2 className="text-lg font-semibold text-text-primary">{s["batch.failureTitle"]}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {s["batch.bookedLabel"]}: {booked}
        </p>

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-success-700">{s["batch.allResolved"]}</p>
        ) : (
          <>
            <p className="mt-4 text-sm font-medium text-text-primary">{s["batch.failuresLabel"]}</p>
            <ul className="mt-2 flex flex-col gap-3">
              {rows.map((row) => (
                <li key={row.key} className="rounded-lg border border-border-strong p-3">
                  <p className="text-sm text-text-primary">
                    {row.failure.date} · {row.failure.hhmm} — {s["batch.reasonBusy"]}
                  </p>
                  {row.failure.nearestAlternative && (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((rs) =>
                          editRow(rs, row.key, {
                            date: row.failure.nearestAlternative!.date,
                            hhmm: row.failure.nearestAlternative!.hhmm,
                          }),
                        )
                      }
                      className="mt-1 text-xs text-accent-2-700 underline"
                    >
                      {s["batch.nearest"]}: {row.failure.nearestAlternative.date} ·{" "}
                      {row.failure.nearestAlternative.hhmm} ({s["batch.useAlternative"]})
                    </button>
                  )}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs text-text-secondary">
                      {s["appointment.date"]}
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(e) => setRows((rs) => editRow(rs, row.key, { date: e.target.value }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-secondary">
                      {s["appointment.time"]}
                      <Input
                        type="time"
                        value={row.hhmm}
                        onChange={(e) => setRows((rs) => editRow(rs, row.key, { hhmm: e.target.value }))}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      loading={pendingKey === row.key}
                      onClick={() => rebook(row.key)}
                    >
                      {s["batch.rebook"]}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {s["common.close"]}
          </Button>
        </div>
      </div>
    </div>
  );
}
