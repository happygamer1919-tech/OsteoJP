"use client";

import { DatePicker } from "@osteojp/ui";
import { useRouter } from "next/navigation";

/**
 * The date pill in the dashboard header: a DatePicker that navigates to
 * /dashboard?date=<iso> on selection. The prev/today/next controls beside it are
 * plain links rendered by the server page.
 */
export function DateJump({ date, label }: { date: string; label: string }) {
  const router = useRouter();
  return (
    <DatePicker
      value={date}
      onChange={(next) => router.push(`/dashboard?date=${next}`)}
      triggerLabel={label}
      className="w-44"
    />
  );
}
