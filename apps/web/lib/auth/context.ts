import "server-only";
import { redirect } from "next/navigation";
import {
  AuthRetryableFetchError,
  isAuthError,
} from "@supabase/supabase-js";
import { parseRole, toClaims, type RequestContext } from "@osteojp/auth";
import { withTenantContext, type DbTx } from "@osteojp/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { timed } from "../perf/request-timing";

// RequestContext is the single actor type across the app — it carries the
// audit actor (userId). Re-exported here so handlers import it alongside the
// helpers below.
export type { RequestContext };

/** Where an unauthenticated staff request is sent. One constant, one place. */
export const LOGIN_PATH = "/login";

/**
 * ==========================================================================
 * OSTEOJP-WEB-8: "NO SESSION" AND "SUPABASE IS DOWN" ARE DIFFERENT FACTS AND
 * THIS FILE USED TO COLLAPSE THEM.
 * ==========================================================================
 * `getRequestContext()` returned `null` for both, and `requireRequestContext()`
 * turned that null into `throw new Error("UNAUTHENTICATED")`. A bare Error in a
 * Server Component render is an unhandled 500, so a logged-out person opening
 * /clinical/[id] or /clinical/new got a server error page instead of the login
 * screen. That is the issue Sentry raised on launch day.
 *
 * Collapsing them cost twice over, and the second cost is the worse one:
 *
 *   - the ORDINARY case (nobody is logged in) was reported as a crash, which is
 *     noise on the one channel that is supposed to mean something is wrong;
 *   - the REAL failure (the Auth service unreachable) was indistinguishable
 *     from it, so a Supabase outage would have looked like everyone quietly
 *     being logged out. That is the silent-degradation shape this codebase
 *     keeps cataloguing.
 *
 * So the resolver below answers with THREE outcomes, and each one gets the
 * response it deserves.
 */
export type SessionResolution =
  /** A verified session. */
  | { kind: "ok"; ctx: RequestContext }
  /**
   * Nobody is logged in, or their token is no longer usable. ORDINARY, EXPECTED,
   * and NOT reported: an expired cookie is not an incident.
   */
  | { kind: "anonymous"; reason: "no-session" | "unusable-claims" }
  /**
   * The Auth service could not be reached, or answered in a way we cannot act
   * on. UNEXPECTED. This is the only branch that reaches Sentry, and the only
   * one that must NOT be turned into a redirect: the person may well be logged
   * in, and bouncing them to /login would report our outage as their logout.
   */
  | { kind: "unavailable"; cause: unknown };

/**
 * Resolve the session, keeping WHY it failed.
 *
 * THE DISCRIMINATOR IS THE ERROR CLASS, NOT A MESSAGE SUBSTRING.
 * `@supabase/supabase-js` exports `AuthRetryableFetchError` for exactly the
 * transport case (the fetch to the Auth server failed or returned 5xx), and
 * `isAuthError` for "the Auth server answered, and the answer is no". Matching
 * on `error.message` would be a guess that breaks on an SDK reword; matching on
 * the class is the SDK's own contract.
 */
/**
 * Next's control-flow signals travel AS THROWN ERRORS, and they must never be
 * caught by application code.
 *
 * ==========================================================================
 * THIS FUNCTION EXISTS BECAUSE ITS ABSENCE BROKE THE BUILD, IMMEDIATELY.
 * ==========================================================================
 * The first version of `resolveRequestContext` wrapped the Supabase call in a
 * try/catch to classify transport failures. That catch also swallowed
 * `DynamicServerError` - the signal `cookies()` throws during static generation
 * to tell Next "this route is dynamic" - and turned it into `AUTH_UNAVAILABLE`.
 * `pnpm build` failed on /clinical/new and /admin/services within minutes:
 *
 *     Error occurred prerendering page "/clinical/new"
 *     Dynamic server usage: Route /clinical/new couldn't be rendered
 *     statically because it used `cookies`.
 *
 * Which is the SAME defect this whole change is about - a catch eating a
 * control-flow signal - one level further down, committed by the person fixing
 * it. It is recorded here rather than quietly patched because that is the point:
 * the shape is easy to reintroduce and hard to see.
 *
 * The digests are Next's own stable markers: `DYNAMIC_SERVER_USAGE` from
 * `cookies()`/`headers()` under static generation, `NEXT_REDIRECT` from
 * `redirect()`, `NEXT_NOT_FOUND` from `notFound()`.
 */
function isNextControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest === "DYNAMIC_SERVER_USAGE" ||
      digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_REDIRECT"))
  );
}

export async function resolveRequestContext(): Promise<SessionResolution> {
  let data: Awaited<ReturnType<Awaited<ReturnType<typeof createSupabaseServerClient>>["auth"]["getClaims"]>>;
  try {
    const supabase = await createSupabaseServerClient();
    data = await supabase.auth.getClaims();
  } catch (cause) {
    // A control-flow signal is not a failure. Let it through untouched, or the
    // build breaks and a redirect from deeper in the stack disappears.
    if (isNextControlFlow(cause)) throw cause;
    // getClaims REJECTED rather than returning an error. A DNS failure, a
    // socket reset, or the client failing to construct. Never a logged-out user.
    return { kind: "unavailable", cause };
  }

  const { data: payload, error } = data;

  if (error) {
    // Transport-shaped: the Auth server was not reached, or 5xx'd.
    if (error instanceof AuthRetryableFetchError) return { kind: "unavailable", cause: error };
    // The Auth server answered and refused: no session, expired, bad JWT.
    // ORDINARY. Not reported.
    if (isAuthError(error)) return { kind: "anonymous", reason: "no-session" };
    // Something else entirely came back on the error channel.
    return { kind: "unavailable", cause: error };
  }

  if (!payload?.claims) return { kind: "anonymous", reason: "no-session" };

  const { tenant_id, user_role, sub } = payload.claims as Record<string, unknown>;
  const role = parseRole(user_role);
  const ok =
    typeof tenant_id === "string" &&
    tenant_id.length > 0 &&
    !!role &&
    typeof sub === "string" &&
    sub.length > 0;

  if (!ok) {
    /**
     * A VERIFIED TOKEN WE CANNOT USE. Not an outage and not a plain logout: we
     * issued this token, so a missing tenant_id or an unknown role means our own
     * claim shape and this code have drifted apart.
     *
     * It still resolves to `anonymous`, because whatever the cause the person
     * cannot proceed and the login screen is where they must go. `reason`
     * carries the distinction so the caller can report it without turning it
     * into a 500. FAIL CLOSED: an unusable claim is never treated as a session.
     */
    return { kind: "anonymous", reason: "unusable-claims" };
  }

  return { kind: "ok", ctx: { tenantId: tenant_id, role: role, userId: sub } };
}

/**
 * Verified request context for the current session, or null.
 *
 * CONTRACT UNCHANGED, AND DELIBERATELY SO. Callers that must decide for
 * themselves — a server action returning `{ok:false,error:"unauthenticated"}`
 * to its own client, a route handler owing a JSON 401 — need an answer, not a
 * navigation. This is that answer, and it still fails closed on every failure.
 *
 * Reads tenant_id + user_role + sub from a VERIFIED token via getClaims(), not
 * the raw cookie. We query Postgres directly and SET request.jwt.claims
 * ourselves (packages/db withTenantContext), so the app is the trust boundary:
 * an unverified claim here would be honored by RLS.
 */
export async function getRequestContext(): Promise<RequestContext | null> {
  const r = await resolveRequestContext();
  return r.kind === "ok" ? r.ctx : null;
}

/**
 * Verified request context, or a redirect to the login screen.
 *
 * ==========================================================================
 * THIS FUNCTION NAVIGATES. THAT IS THE FIX FOR OSTEOJP-WEB-8.
 * ==========================================================================
 * `redirect()` throws Next's NEXT_REDIRECT control-flow signal, so this never
 * returns on the anonymous path. Two consequences worth stating, because both
 * have bitten:
 *
 *   1. DO NOT CALL THIS INSIDE A `try { } catch { }` THAT SWALLOWS. The catch
 *      would eat the redirect. Every such call site in apps/web was unwrapped
 *      in the same change that added this, and the two that genuinely wanted a
 *      value rather than a navigation now call `getRequestContext()` instead.
 *   2. It is for RENDER and ACTION paths. A route handler owing a JSON 401
 *      wants `getRequestContext()`.
 *
 * `apps/api` is NOT changed and must not be: its `requirePatientPrincipal`
 * throws for route handlers that answer with a status code, which is correct
 * there and would be wrong here.
 */
export async function requireRequestContext(): Promise<RequestContext> {
  const r = await resolveRequestContext();
  if (r.kind === "ok") return r.ctx;

  if (r.kind === "unavailable") {
    /**
     * THE ONLY BRANCH THAT REPORTS, and it rethrows rather than redirecting.
     *
     * Sentry is imported LAZILY, inside the branch that needs it. This module
     * is in the server graph of essentially every page, and INC-12 is the
     * recorded price of putting something at module scope whose failure is not
     * proportional to what it does.
     */
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(r.cause, {
      level: "error",
      tags: { guard: "requireRequestContext", outcome: "auth-unavailable" },
    });
    throw new Error("AUTH_UNAVAILABLE", { cause: r.cause });
  }

  if (r.reason === "unusable-claims") {
    // Reported as a WARNING, not an error: the person is redirected either way,
    // nothing is broken for them, and a token whose shape we no longer
    // recognise is something we want to know about without paging anybody.
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage("requireRequestContext: verified token carries unusable claims", {
      level: "warning",
      tags: { guard: "requireRequestContext", outcome: "unusable-claims" },
    });
  }

  redirect(LOGIN_PATH);
}

/**
 * Runs fn inside a tenant-scoped, RLS-enforced transaction for this context.
 *
 * ==========================================================================
 * EVERY SCOPED QUERY IS TIMED HERE, WHICH IS WHY THE LABEL IS OPTIONAL
 * ==========================================================================
 * PERF-timing-admin-stats needs "each query's time WITH RLS ON", and this is
 * the one seam all of them already pass through - so one wrap measures the
 * whole surface instead of a wrapper at every call site that somebody will
 * forget to add to the next one.
 *
 * WHAT THE NUMBER INCLUDES, said plainly so the report is not read as narrower
 * than it is: acquiring a pooled connection, `set local` of the claims, the
 * statement itself, and the commit. That is deliberate. The question behind
 * this card is where ten seconds went, and on a saturated pool the WAIT for a
 * connection is the answer far more often than the statement is - PERF-06
 * measured exactly that shape. A number that timed only the statement would
 * exonerate the pool by construction.
 *
 * `label` NAMES THE CALLER, because a report of nine identical `db:scoped`
 * rows is a list, not a breakdown. It is optional so that adding a query
 * anywhere in the app cannot fail to compile, and unlabelled work still appears
 * - as `db:scoped` - rather than vanishing from the total.
 *
 * WHEN NOTHING IS COLLECTING, `timed` awaits and returns. See
 * `lib/perf/request-timing.ts`: this costs a `getStore()` and a branch for
 * every other request in the system.
 */
export async function runScoped<T>(
  ctx: RequestContext,
  fn: (tx: DbTx) => Promise<T>,
  label?: string,
): Promise<T> {
  return timed(label ?? "db:scoped", () => withTenantContext(toClaims(ctx), fn));
}
