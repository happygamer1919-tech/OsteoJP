"use client";

import { DatePicker } from "@osteojp/ui";
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
    <DatePicker
      value={date === "" ? null : date}
      triggerLabel={label}
      onChange={(v) => {
        if (v) router.push(`/dashboard?date=${v}`);
      }}
    />
  );
}
