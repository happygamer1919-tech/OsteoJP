import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * REQUEST-SCOPED TIMING. A MEASUREMENT INSTRUMENT, NOT A FIX.
 *
 * ==========================================================================
 * WHAT IT IS FOR
 * ==========================================================================
 * The owner clicked *Pacientes* as an admin on production and waited about ten
 * seconds. The last recorded `/patients` p75 is 184 ms. Both numbers cannot
 * describe the same path, and nothing in this application can currently say
 * which part of one request took the time.
 *
 * So this makes ONE request report its own breakdown: the server function's
 * total, each scoped query's time WITH RLS ON, whether the stat strip was
 * served from cache, and - through the panel that renders these - time to first
 * byte separated from client hydration.
 *
 * ==========================================================================
 * IT IS OFF FOR EVERYBODY EXCEPT AN ADMIN, AND "OFF" MEANS NO STORE AT ALL
 * ==========================================================================
 * `collectFor()` is the ONLY thing that opens a store and it takes the audience
 * decision as its FIRST ARGUMENT, so a caller cannot forget to make one. With
 * no store open, `timed()` awaits its function and returns - one
 * `AsyncLocalStorage.getStore()` call and a branch, no clock read, no array, no
 * allocation per query. That is what keeps this instrument out of the thing it
 * is measuring.
 *
 * THE FIRST VERSION OF THIS FILE EXPORTED AN UNGATED `collect()` AND SAID THIS
 * SAME PARAGRAPH, and the paragraph was FALSE. All four instrumented pages
 * called it unconditionally, so every reception and therapist request on
 * /patients opened a store, read the clock at every span and built an array
 * nobody would ever read. Nothing broke and nothing would have: the cost is
 * microseconds and the spans still never reached a non-admin's payload, because
 * that is decided by whether the PANEL ELEMENT is created. So the only signal
 * was a comment that disagreed with the code - which is the shape
 * PORTAL-REHYDRATE 1.3 catalogues, here inside the instrument built to answer
 * where time goes.
 *
 * THE GATE IS NOW A TYPE RATHER THAN A CONVENTION. `Measured<T>` carries the
 * spans ONLY in its `measured: true` arm, so a page cannot render the panel
 * without them and cannot hold them without having passed the audience check.
 * The two conditions that must agree are now one thing the compiler checks.
 *
 * ==========================================================================
 * WHY AsyncLocalStorage AND NOT A React `cache()` SINGLETON
 * ==========================================================================
 * `cache()` is per-request too, but it is keyed by call site and returns the
 * same value to every caller in the render - which is what we want - while
 * saying nothing about ASYNC ordering. These spans are recorded from inside
 * `Promise.all`, where three reads overlap. ALS is the primitive that survives
 * that, and it also reaches code React does not render: `unstable_cache`'s
 * callback, and the `runScoped` seam in `lib/auth/context.ts`.
 *
 * WHETHER IT ACTUALLY REACHES THE `unstable_cache` CALLBACK IS A MEASURED FACT
 * AND NOT AN ASSUMPTION. See `stat-strip` below and the report on
 * PERF-timing-admin-stats: an instrument that quietly loses its context would
 * report every cache MISS as a HIT, which is the §1.3 shape pointed at the one
 * question this exercise exists to answer.
 */

export type Span = {
  /** Stable label. `db:*` is a scoped query, `mark:*` is a point event. */
  name: string;
  /** Milliseconds, one decimal. */
  ms: number;
  /** Free text the panel prints beside the number. Never PII. */
  detail?: string;
};

/**
 * WHAT `collectFor` HANDS BACK, AND WHY IT IS A UNION RATHER THAN OPTIONAL
 * FIELDS.
 *
 * `{ spans: [], totalMs: 0 }` for an unmeasured request would be the exact
 * convenience §1.3 is about: zero is a NUMBER, and a reader - or a future panel
 * - cannot tell "this request was not measured" from "this request took no
 * time". The union has no such value to misread. `measured: false` carries the
 * result and nothing else, and reaching for `spans` on it does not compile.
 */
export type Measured<T> =
  | { measured: true; value: T; spans: Span[]; totalMs: number }
  | { measured: false; value: T };

type Store = { spans: Span[]; startedAt: number };

const als = new AsyncLocalStorage<Store>();

/** Is a store open on this async context? */
export function timingActive(): boolean {
  return als.getStore() !== undefined;
}

/**
 * Run `fn`, opening a span store around it ONLY when `audience` is true.
 *
 * THE AUDIENCE DECISION IS THE CALLER'S AND IS PASSED IN, not read here. This
 * file must not know what a role is: one definition of who may read timings
 * lives in `lib/perf/audience.ts`, and a second one here would be a second
 * answer to the same question. Making it the FIRST parameter is what stops a
 * caller from omitting it - the previous signature let a page open a store by
 * writing nothing at all.
 *
 * WHEN `audience` IS FALSE THIS IS `await fn()` AND NOTHING ELSE. No ALS run,
 * no clock read, no array. The unmeasured path is the path it was before this
 * instrument existed.
 */
export async function collectFor<T>(audience: boolean, fn: () => Promise<T>): Promise<Measured<T>> {
  if (!audience) return { measured: false, value: await fn() };
  const store: Store = { spans: [], startedAt: performance.now() };
  const value = await als.run(store, fn);
  return {
    measured: true,
    value,
    spans: store.spans,
    totalMs: round(performance.now() - store.startedAt),
  };
}

/**
 * Time one awaited step.
 *
 * A NO-OP WHEN NOTHING IS COLLECTING, and deliberately not a "record it anyway
 * and throw it away" - the clock reads and the array push are the cost, and a
 * measurement tool that taxes every unmeasured request is a fix nobody asked
 * for pointed the wrong way.
 */
export async function timed<T>(name: string, fn: () => Promise<T>, detail?: string): Promise<T> {
  const store = als.getStore();
  if (!store) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    store.spans.push({ name, ms: round(performance.now() - t0), detail });
  }
}

/**
 * Record that something HAPPENED, with no duration.
 *
 * `ms: 0` rather than an optional field: the panel prints a table and a column
 * that is sometimes absent is a column readers misread. A point event is a
 * zero-length span, which is what it is.
 */
export function mark(name: string, detail?: string): void {
  als.getStore()?.spans.push({ name, ms: 0, detail });
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
