"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { s } from "@/lib/i18n";
import { clampPage, pageItems, parseGotoPage } from "@/lib/pagination/page-items";

/**
 * U1 — ONE pager for every paginated list.
 *
 * ==========================================================================
 * THE DEFECT
 * ==========================================================================
 * /patients, /recuperacao and /comunicacoes/lembretes-sms each rendered their
 * own copy of exactly two links, "Anterior" and "Seguinte". Page 100 was 99
 * clicks away and the last page could not be reached at all without knowing how
 * many there were. Three copies of two links is also why the fix is one
 * component: the next screen that paginates inherits the numbers, the jump box
 * and the keyboard semantics instead of copying the two links again.
 *
 * ==========================================================================
 * IT TAKES `params`, IT DOES NOT CALL useSearchParams()
 * ==========================================================================
 * Every link is built from `basePath` + `params` + the page, all of them plain
 * serializable values the SERVER already computed. That is deliberate:
 *
 *   - a client component that reads `useSearchParams()` opts its subtree out of
 *     static rendering and needs a Suspense boundary to avoid a bail-out; and
 *   - the parent pages ALREADY own the canonical query shape (which params
 *     exist, which are omitted when empty). Re-deriving it here would be a
 *     second source of truth for the same URL, and the two would drift.
 *
 * So the server hands down the params it already has, and this renders links.
 * The router is touched for ONE thing only: the jump box, which has no href
 * until something is typed.
 *
 * ==========================================================================
 * PAGE 1 IS THE ABSENT PARAM, NEVER `?page=1`
 * ==========================================================================
 * Matching what all three callers already do, so the canonical URL for a list
 * is the bare path and "first page" has exactly one spelling.
 */
export function Pager({
  basePath,
  params,
  page,
  pageCount,
  total,
}: {
  /** e.g. "/patients". No query string. */
  basePath: string;
  /** Every OTHER query param to preserve, already normalized (no `page`). */
  params: Record<string, string>;
  page: number;
  pageCount: number;
  /** Row count across all pages — the "Y resultados" half of the status line. */
  total: number;
}) {
  const router = useRouter();
  const [goto, setGoto] = useState("");

  // N = 1 hides the whole control. A single page has nothing to navigate, and a
  // row of dead buttons reads as a broken list rather than a short one.
  if (pageCount <= 1) return null;

  const current = clampPage(page, pageCount);
  const items = pageItems(current, pageCount);
  const fmt = new Intl.NumberFormat("pt-PT");

  const hrefFor = (p: number): string => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p));
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  function submitGoto(): void {
    const target = parseGotoPage(goto, pageCount);
    // null means empty or non-numeric: SEND NO REQUEST. Navigating to `?page=0`
    // or `?page=NaN` on a stray Enter is the failure this guard exists for.
    if (target === null) return;
    setGoto("");
    router.push(hrefFor(target));
  }

  const status = s["pagination.status"]
    .replace("{page}", fmt.format(current))
    .replace("{pages}", fmt.format(pageCount))
    .replace("{total}", fmt.format(total));

  return (
    <nav
      aria-label={s["pagination.navLabel"]}
      data-testid="pager"
      data-page={current}
      data-page-count={pageCount}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
    >
      <span className="tabular-nums text-v2-text-secondary" data-testid="pager-status">
        {status}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        {/* Primeira / Anterior are RENDERED BUT DISABLED on page 1 rather than
            removed. A control that disappears moves every control beside it, so
            the strip would shift under the pointer between pages. */}
        <Step href={hrefFor(1)} disabled={current === 1} label={s["pagination.first"]} testId="pager-first" />
        <Step
          href={hrefFor(current - 1)}
          disabled={current === 1}
          label={s["pagination.prev"]}
          rel="prev"
          testId="pager-prev"
        />

        {items.map((item, i) =>
          item === "ellipsis" ? (
            // Not a button and not focusable: it is the STATEMENT that pages
            // were omitted, and the jump box is how you reach them.
            <span
              // The strip is positional: two gaps are legitimately identical and
              // have no id of their own, so the index IS the identity here.
              key={`gap-${i}`}
              aria-hidden="true"
              className="px-1 text-v2-text-secondary"
            >
              …
            </span>
          ) : item === current ? (
            <span
              key={item}
              aria-current="page"
              data-testid="pager-current"
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-v2 border border-accent-2-700 bg-accent-2-700 px-2 font-semibold tabular-nums text-text-inverse"
            >
              {item}
            </span>
          ) : (
            <a
              key={item}
              href={hrefFor(item)}
              aria-label={s["pagination.pageLabel"].replace("{page}", String(item))}
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-v2 border border-v2-border px-2 font-medium tabular-nums text-v2-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {item}
            </a>
          ),
        )}

        <Step
          href={hrefFor(current + 1)}
          disabled={current === pageCount}
          label={s["pagination.next"]}
          rel="next"
          testId="pager-next"
        />
        <Step
          href={hrefFor(pageCount)}
          disabled={current === pageCount}
          label={s["pagination.last"]}
          testId="pager-last"
        />
      </div>

      {/* A <form> so Enter submits natively; the button is for pointer users and
          for anyone who does not expect Enter to navigate. */}
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          submitGoto();
        }}
      >
        <label htmlFor="pager-goto" className="text-v2-text-secondary">
          {s["pagination.gotoLabel"]}
        </label>
        <input
          id="pager-goto"
          name="page"
          data-testid="pager-goto"
          // `inputMode` gives phones the number keypad; the type stays TEXT so
          // the value is exactly what was typed and `parseGotoPage` gets to be
          // the single judge of it. A number input silently discards a non
          // numeric entry in some browsers, which would make "sends no request"
          // untestable here and inconsistent across them.
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          className="h-9 w-16 rounded-v2 border border-v2-border px-2 tabular-nums text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
        <button
          type="submit"
          data-testid="pager-goto-submit"
          className="inline-flex h-9 items-center rounded-v2 border border-v2-border px-3 font-medium text-v2-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {s["pagination.gotoSubmit"]}
        </button>
      </form>
    </nav>
  );
}

/**
 * One end-stop control. Disabled renders as a <span>, not a disabled <a>: an
 * anchor with no href is not focusable and announces nothing useful, and a
 * disabled link is not a thing HTML has.
 */
function Step({
  href,
  disabled,
  label,
  rel,
  testId,
}: {
  href: string;
  disabled: boolean;
  label: string;
  rel?: "prev" | "next";
  testId: string;
}) {
  const shape =
    "inline-flex h-9 items-center rounded-v2 border px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
  if (disabled) {
    return (
      <span
        data-testid={testId}
        aria-disabled="true"
        className={`${shape} border-v2-border text-v2-text-secondary opacity-50`}
      >
        {label}
      </span>
    );
  }
  return (
    <a data-testid={testId} href={href} rel={rel} className={`${shape} border-v2-border text-v2-text-primary hover:bg-surface-muted`}>
      {label}
    </a>
  );
}
