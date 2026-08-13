/**
 * @osteojp/rate-limit — ONE definition of what a limit means, for every app.
 *
 * ============================================================================
 * WHY THIS PACKAGE EXISTS, AND WHY IT IS NOT A COPY
 * ============================================================================
 * `SEC-r-token-no-rate-limit`, broadened by strategy 2026-08-11: **there was no
 * rate limiter anywhere in `apps/web`.** Not one route missing a limiter — an
 * entire application with no limiting concept, covering every server action and
 * route handler on the staff platform plus the PUBLIC, UNAUTHENTICATED
 * `/r/[token]` landing page. The limiter existed only in `apps/api/lib/`, and
 * `apps/web` did not import it.
 *
 * The card named two shapes: **port it** into `apps/web`, or make it a **shared
 * package**. It is a shared package, and the reason is not tidiness.
 *
 * **A PORT WOULD HAVE MEANT TWO COPIES OF A SECURITY CONTROL.** `RULES` is a set
 * of numbers that say how hard to throttle; two copies drift, and the drift is
 * silent — nobody would know which app enforced what until an incident asked.
 * This session has already paid twice for duplicated logic in one week: the
 * phone normalisation needed a whole parity suite to stay honest across two
 * languages, and a duplicated e2e traversal cost a 12m33s shard. Neither of
 * those was a security boundary. This is.
 *
 * ============================================================================
 * NOTHING IN apps/api MOVED, AND THAT IS DELIBERATE
 * ============================================================================
 * `apps/api/lib/rate-limit/limiter.ts` and `durable-store.ts` are now one-line
 * re-export shims. Every existing import in `apps/api` — including the OTP
 * routes that carry PG1 — resolves exactly as before, so this extraction changes
 * no call site on a gate-bearing path. The shims are a compatibility layer, not
 * a second implementation: they contain no logic to drift.
 *
 * ============================================================================
 * WHAT THE DURABLE STORE NEEDS, so an app knows before adopting it
 * ============================================================================
 * `@osteojp/db` and the `rate_limit_counters` table from migration `0056`. **No
 * new migration** — the table already exists, which is what made this an
 * afternoon's work rather than an owner-gated one.
 */
export * from "./limiter";
export * from "./durable-store";
