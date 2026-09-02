"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@osteojp/ui";
import { Search } from "lucide-react";

import { s } from "@/lib/i18n";
import { DEBOUNCE_MS, nextSearchTarget } from "./search-rule";

// DEBOUNCE_MS, MIN_SEARCH_LENGTH and the decision itself live in ./search-rule,
// which is a plain module a test can import without a DOM harness.

/**
 * UX-01 - the filter bar. CLIENT ONLY BECAUSE CONTROLLED INPUTS DEMAND IT.
 *
 * ==========================================================================
 * EVERY FILTER IS A URL SEARCH PARAM, AND THAT IS THE FEATURE
 * ==========================================================================
 * Not component state. A filtered view is then a link somebody can send to a
 * colleague, the back button returns to the previous filter instead of a blank
 * list, and a refresh keeps the view. It also means the SERVER does the
 * filtering, because the server is what reads the URL - the shape that keeps
 * 8,400 patients, with their telephone and fiscal numbers, out of the browser.
 *
 * `initialQuery` IS A PROP AND NOT AN EFFECT. The server already knows the
 * current `q`; passing it down means no `useEffect` syncing state to the URL,
 * which is both a lint error here (cascading renders) and the wrong shape. Same
 * pattern as the SearchBox this bar replaces on this route.
 *
 * REPLACE FOR THE TEXT, PUSH FOR THE REST. A debounced search that pushed would
 * put one history entry per pause in typing and make the back button useless. A
 * location or toggle change is a deliberate act and earns an entry.
 *
 * PARAMS ARE REMOVED WHEN EMPTY rather than written as `?q=`, so a cleared
 * filter produces the canonical URL. ANY FILTER CHANGE RESETS TO PAGE 1:
 * staying on page 7 of a result set that now has two pages shows an empty table
 * and reads as "no results", which is the wrong answer to a filter that matched.
 */
export function PatientsFilterBar({
  initialQuery,
  locations,
}: {
  initialQuery: string;
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
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

  function urlFor(next: Record<string, string | null>): string {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    return sp.size ? `/patients?${sp}` : "/patients";
  }

  function navigate(next: Record<string, string | null>, mode: "push" | "replace") {
    const href = urlFor(next);
    startTransition(() => (mode === "push" ? router.push(href) : router.replace(href)));
  }

  function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const target = nextSearchTarget(value, params.get("q"));
    if (!target.navigate) return;
    timer.current = setTimeout(() => navigate({ q: target.q }, "replace"), DEBOUNCE_MS);
  }

  const locationId = params.get("location") ?? "";
  const upcoming = params.get("upcoming") === "1";
  const hasAny = Boolean(params.get("q") || locationId || upcoming);

  return (
    <form
      className="glass-nav flex flex-wrap items-end gap-3 rounded-v2 px-4 py-3"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate({ q: q.trim() || null }, "replace");
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
        <span className="text-xs font-medium text-v2-text-secondary">
          {s["patients.filterSearchLabel"]}
        </span>
        <Input
          type="search"
          name="q"
          value={q}
          onChange={onSearchChange}
          leadingIcon={Search}
          placeholder={s["patients.filterSearchPlaceholder"]}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-v2-text-secondary">
          {s["patients.filterLocationLabel"]}
        </span>
        <Select
          name="location"
          value={locationId}
          onChange={(e) => navigate({ location: e.target.value || null }, "push")}
        >
          <option value="">{s["patients.filterLocationAll"]}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex items-center gap-2 pb-2 text-sm text-v2-text-primary">
        <input
          type="checkbox"
          name="upcoming"
          checked={upcoming}
          onChange={(e) => navigate({ upcoming: e.target.checked ? "1" : null }, "push")}
          className="size-4 rounded border-v2-border text-v2-green-700 focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
        {s["patients.filterUpcoming"]}
      </label>

      {hasAny ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            startTransition(() => router.push("/patients"));
          }}
          className="ml-auto pb-2 text-sm font-medium text-v2-green-800 underline underline-offset-2 hover:text-v2-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {s["patients.filterClear"]}
        </button>
      ) : null}
    </form>
  );
}
