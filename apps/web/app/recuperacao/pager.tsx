"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@osteojp/ui";
import { Search } from "lucide-react";

import { s } from "@/lib/i18n";

const DEBOUNCE_MS = 300;

/**
 * PERF-03 - the count header, the name/phone filter and the pager.
 *
 * ==========================================================================
 * THE COUNT IS STATED, NOT IMPLIED
 * ==========================================================================
 * "50 of 1,320" and not a bare list of fifty. A work queue that silently shows
 * its first page reads as a queue that is nearly done, and the whole point of
 * this screen is knowing how much is left. It is also the difference between a
 * filter that matched nothing and a page that failed to load - the distinction
 * the empty state one file over exists to preserve.
 *
 * CLIENT ONLY FOR THE INPUT. The page, the filter and the total are computed on
 * the server from URL params; this component owns the controlled text box and
 * writes the params back. `initialQuery` arrives as a prop rather than being
 * read back out of an effect - same shape as the patients filter bar, and for
 * the same lint and correctness reasons.
 *
 * REPLACE FOR THE FILTER, PUSH FOR THE PAGE. A debounced filter that pushed
 * would put one history entry per pause in typing; turning a page is a
 * deliberate act and earns one.
 */
export function FollowupPager({
  initialQuery,
  page,
  pageCount,
  total,
  shown,
}: {
  initialQuery: string;
  page: number;
  pageCount: number;
  total: number;
  shown: number;
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

  function href(next: Record<string, string | null>): string {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    return sp.size ? `/recuperacao?${sp}` : "/recuperacao";
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    // A new filter starts at page 1: staying on page 7 of a result set that now
    // has one page shows nothing and reads as "no matches".
    timer.current = setTimeout(
      () => startTransition(() => router.replace(href({ q: value.trim() || null, page: null }))),
      DEBOUNCE_MS,
    );
  }

  const fmt = new Intl.NumberFormat("pt-PT");
  const go = (p: number) => href({ page: p > 1 ? String(p) : null });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        role="search"
        className="min-w-0 flex-1 sm:max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          startTransition(() => router.replace(href({ q: q.trim() || null, page: null })));
        }}
      >
        <Input
          type="search"
          name="q"
          value={q}
          onChange={onChange}
          leadingIcon={Search}
          placeholder={s["followup.filterPlaceholder"]}
          aria-label={s["followup.filterPlaceholder"]}
        />
      </form>

      <span className="text-sm tabular-nums text-v2-text-secondary">
        {fmt.format(shown)} {s["patients.pageOf"]} {fmt.format(total)}
      </span>

      {pageCount > 1 ? (
        <div className="ml-auto flex items-center gap-2 text-sm">
          {page > 1 ? (
            <a href={go(page - 1)} rel="prev" className={pageLink}>
              {s["patients.pagePrev"]}
            </a>
          ) : null}
          <span className="tabular-nums text-v2-text-secondary">
            {page} {s["patients.pageOf"]} {pageCount}
          </span>
          {page < pageCount ? (
            <a href={go(page + 1)} rel="next" className={pageLink}>
              {s["patients.pageNext"]}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const pageLink =
  "inline-flex h-9 items-center rounded-v2 border border-v2-border px-3 font-medium text-v2-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
