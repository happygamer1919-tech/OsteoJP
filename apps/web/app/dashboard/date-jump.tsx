"use client";

import { useRouter } from "next/navigation";

/**
 * The date control in the dashboard header: a token-styled native date input
 * that navigates to /dashboard?date=<iso> on selection. The prev/today/next
 * controls beside it are plain links rendered by the server page.
 *
 * Native input rather than a glass popover: V2-W0 ships no glass date-picker
 * primitive, and section waves must not add packages/ui. A glass DatePicker is a
 * foundation follow-up; the native input keeps the date-scoping behaviour intact.
 */
export function DateJump({ date, label }: { date: string; label: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      value={date}
      aria-label={label}
      onChange={(e) => {
        if (e.target.value) router.push(`/dashboard?date=${e.target.value}`);
      }}
      className="h-10 rounded-v2 border border-v2-border bg-v2-surface px-3 text-sm text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    />
  );
}
