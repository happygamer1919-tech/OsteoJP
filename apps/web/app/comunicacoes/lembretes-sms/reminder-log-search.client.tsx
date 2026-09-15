"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@osteojp/ui";
import { Search } from "lucide-react";

import { s } from "@/lib/i18n";
import { DEBOUNCE_MS, nextSearchTarget } from "@/app/patients/_components/search-rule";

/**
 * COMMS-03 - the patient name search on Lembretes SMS.
 *
 * THE SAME SHAPE AS THE /patients FILTER BAR, ON PURPOSE. The text is a URL
 * search param (`q`), debounced by the rule that bar uses, so the SERVER filters
 * and pages: the browser never receives the rows it is not shown. Só falhas
 * (`falhas`) is kept, because the search works WITH the filters rather than
 * replacing them, and the page resets to 1, because page 3 of a narrower result
 * reads as "no results".
 *
 * REPLACE, NOT PUSH: a history entry per pause in typing would make the back
 * button useless. Enter issues the search at once, whatever its length.
 */
export function ReminderLogSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function go(nextQ: string | null) {
    const sp = new URLSearchParams(params.toString());
    if (nextQ) sp.set("q", nextQ);
    else sp.delete("q");
    sp.delete("page");
    const href = sp.size ? `${pathname}?${sp}` : pathname;
    startTransition(() => router.replace(href));
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const target = nextSearchTarget(value, params.get("q"));
    if (!target.navigate) return;
    timer.current = setTimeout(() => go(target.q), DEBOUNCE_MS);
  }

  return (
    <form
      role="search"
      className="flex min-w-0 flex-1 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(q.trim() || null);
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col">
        <span className="sr-only">{s["remindersLog.searchLabel"]}</span>
        <Input
          type="search"
          name="q"
          value={q}
          onChange={onChange}
          leadingIcon={Search}
          placeholder={s["remindersLog.searchPlaceholder"]}
        />
      </label>
    </form>
  );
}
