"use client";

import { useRouter } from "next/navigation";

import { ScheduleInspector } from "./ScheduleInspector";
import type { InspectedDay } from "@/lib/scheduling/schedule-inspection";

/**
 * SCHED-09 — the client half of the inspector: it owns the router and nothing
 * else.
 *
 * THE FILTERS LIVE IN THE URL rather than in component state, so the view is
 * LINKABLE - "look at JP, two weeks" is a URL somebody can paste into a message
 * - and so the day rows stay SERVER-rendered from the resolver. Client state
 * would have meant fetching the schedule in the browser, which is a second path
 * to the same answer and the thing SR-37 forbids.
 */
export function ScheduleInspectorPanel({
  days,
  therapists,
  therapistId,
  period,
}: {
  days: InspectedDay[];
  therapists: { id: string; label: string }[];
  therapistId: string;
  period: string;
}) {
  const router = useRouter();
  const go = (next: { t?: string; p?: string }) => {
    const params = new URLSearchParams();
    params.set("t", next.t ?? therapistId);
    params.set("p", next.p ?? period);
    router.push(`/horarios?${params.toString()}`);
  };
  return (
    <ScheduleInspector
      days={days}
      therapists={therapists}
      therapistId={therapistId}
      period={period}
      onTherapistChange={(t) => go({ t })}
      onPeriodChange={(p) => go({ p })}
    />
  );
}
