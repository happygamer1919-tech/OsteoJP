"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { s } from "@/lib/i18n";

/**
 * SAT-01 - the month filter of Avaliações de satisfação (copy text 52).
 *
 * THE MONTH IS A URL SEARCH PARAM (`mes`, as `2026-05`), like the name search
 * of Lembretes SMS, so the SERVER filters and pages and the browser never
 * receives a row it is not shown. Choosing a month drops `page`: page 3 of a
 * narrower list reads as "nothing was sent". Emptying the box is every month.
 *
 * REPLACE, NOT PUSH: a history entry per month tried would make the back
 * button useless.
 */
export function SurveyListMonthFilter({ initialMonth }: { initialMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function go(value: string) {
    const href = /^\d{4}-\d{2}$/.test(value) ? `${pathname}?mes=${value}` : pathname;
    startTransition(() => router.replace(href));
  }

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-v2-text-secondary">
      <span>{s["surveyList.monthFilter"]}</span>
      <input
        type="month"
        name="mes"
        // Keyed by the address's month, so the box follows a back or forward step.
        key={initialMonth}
        defaultValue={initialMonth}
        onChange={(e) => go(e.target.value)}
        className="h-9 rounded-v2 border border-v2-border bg-transparent px-3 text-sm tabular-nums text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      />
    </label>
  );
}
