import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ForbiddenError } from "@osteojp/auth";

import { getRequestContext } from "@/lib/auth/context";
import { recordFollowupContactFor } from "@/lib/followup/record-contact";
import { FollowupScopeError } from "@/lib/followup/scope";

/**
 * ==========================================================================
 * WHY THIS IS A ROUTE HANDLER AND NOT A SERVER ACTION.
 * ==========================================================================
 * It IS one, in every other respect: same context, same capability, same scope
 * guard, same insert. CLAUDE.md says "Server actions over API routes when
 * possible", and this is the case where the `when possible` clause fails.
 *
 * THE DEFECT THIS EXISTS TO FIX. The contact mark is written by a click that
 * ALSO navigates - `https://wa.me/...` in a new window, `sms:` and `mailto:`
 * handed to an external application. A Server Action is dispatched by React's
 * own transport, which offers no way to say "this request must outlive the
 * document". So the write was scheduled inside `startTransition` and the
 * browser began the handoff in the same tick, and whether the POST survived was
 * left to the browser. On the owner's screen, on 2026-08-28, it did not: he
 * pressed WhatsApp, WhatsApp opened, and after a genuine reload no
 * "Contactado por ... em ..." line ever appeared.
 *
 * `fetch(..., { keepalive: true })` IS THE MECHANISM FOR EXACTLY THIS, and it
 * is specified rather than hopeful: a keepalive request is guaranteed to
 * outlive the document that issued it. `fetch` takes that flag; a Server Action
 * call does not. That is the whole reason the transport changed, and the RULE
 * did not - `recordFollowupContactFor` is the one definition and this handler
 * is one of its callers.
 *
 * ==========================================================================
 * IT ANSWERS WITH A CODE, NOT A SENTENCE.
 * ==========================================================================
 * The client renders its own pt-PT copy. A handler that returned display text
 * would put user-facing Portuguese behind an API boundary, where the i18n
 * dictionary cannot see it and a translator will never find it.
 *
 * NO PII IN ANY RESPONSE OR LOG (rule 7). The codes name what went wrong, never
 * who or which patient.
 */

export const runtime = "nodejs";

type Body = { patientId?: unknown; channel?: unknown };

/**
 * ==========================================================================
 * EVERY FAILURE IS CAPTURED ON THE SERVER. STRATEGY RULING SR-06, 2026-08-28.
 * ==========================================================================
 * "A write path whose failure UI can be destroyed by navigation must be
 * observable on the server. Client-side alerting is NOT sufficient evidence of
 * loudness when the document may not survive the request."
 *
 * WHY THIS ROUTE IS THE FIRST MEMBER OF THAT CLASS. #1063 made a failure loud
 * on the screen - role="alert" on the row, above the contact history. That is
 * reachable on ONE of the three channels and not on the other two:
 *
 *   WhatsApp  href="https://wa.me/..."  target="_blank" rel="noopener noreferrer"
 *             -> a NEW browsing context. The current document survives, so the
 *                alert renders and the receptionist sees it.
 *   SMS       href="sms:+351..."        NO target
 *   Email     href="mailto:..."         NO target
 *             -> the CURRENT document. The browser may hand off and tear it
 *                down, and the React state holding the alert goes with it.
 *
 * So on two channels of three the alert is unreachable IN EXACTLY THE FAILURE
 * CASE THAT MATTERS, and the page looks identical to the silent version #1063
 * replaced. The screen cannot be the only witness.
 *
 * WHY THE SERVER AND NOT MORE CLIENT CODE. Every client-side remedy has the
 * same shape as the defect: it needs the document to still be there.
 * `sessionStorage` written before the navigation and read on a return that may
 * never come; a beacon reporting the failure, which needs the failure to be
 * observed first. The server ALREADY HAS THE REQUEST - `keepalive` delivered it
 * - so it already knows the outcome. Capturing here depends on nothing
 * surviving.
 *
 * ==========================================================================
 * IT IS INSIDE `fail()`, WHICH IS THE WHOLE POINT.
 * ==========================================================================
 * Not five call sites. A branch added next month cannot forget to report,
 * because the only way to answer a failure from this handler is through this
 * function. The same argument `resolveScheduleScope` makes for putting a rule
 * in a scope kind rather than at nine call sites: a caller can fail to CALL it,
 * which is a visible omission, but cannot call it and be silent.
 *
 * THE 401 IS CAPTURED TOO, AND IT IS THE ONE THIS RULING NAMES. It is the
 * branch that looks least like an error - a session expired, which is ordinary
 * - and it is the one where a contact is most certainly lost: the write did not
 * happen, and the person who could retry it has already left for WhatsApp.
 *
 * `warning` FOR THE REFUSALS, `error` FOR THE 500. A refusal is the system
 * working; an unhandled throw is not. Levelling them the same would make the
 * 500s unfindable in a list of expired sessions, which is how a channel that
 * reports everything comes to report nothing.
 *
 * NO PII, RULE 7. The tags are the code, the status, the channel (one of three
 * enum values) and the role. NEVER the patient id, never a phone number, never
 * the staff user id - this is a third-party service, and a follow-up contact is
 * a fact about a named patient.
 */
function fail(
  code: string,
  status: number,
  detail?: { channel?: string; role?: string; cause?: unknown },
): NextResponse {
  const tags = {
    route: "followup.contact",
    code,
    status: String(status),
    ...(detail?.channel ? { channel: detail.channel } : {}),
    ...(detail?.role ? { role: detail.role } : {}),
  };

  if (detail?.cause !== undefined) {
    Sentry.captureException(detail.cause, { level: "error", tags });
  } else {
    Sentry.captureMessage(`followup.contact refused: ${code}`, { level: "warning", tags });
  }

  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const ctx = await getRequestContext();
  // FAIL CLOSED, and 401 rather than a redirect: this is called by fetch, and a
  // redirect to /login would arrive as an opaque 200 that the client would read
  // as success. The single most important line in the file.
  // SR-06: the branch the ruling names. A session that expired while the page
  // was open loses the write silently on two of the three channels.
  if (!ctx) return fail("unauthenticated", 401);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("bad_request", 400);
  }

  const { patientId, channel } = body;
  if (typeof patientId !== "string" || patientId === "" || typeof channel !== "string") {
    return fail("bad_request", 400, { role: ctx.role });
  }

  try {
    await recordFollowupContactFor(ctx, patientId, channel);
  } catch (err) {
    /**
     * THE THREE REFUSALS ARE THREE ANSWERS, NOT ONE.
     *
     * `FollowupScopeError` means this viewer may not act on this patient - the
     * therapist scope, or PL-09's location scope. It is `404` for the reason
     * `scope.ts` gives: a patient outside the scope must be indistinguishable
     * from a patient who does not exist, or the endpoint becomes an existence
     * oracle for anyone who can call it.
     *
     * A capability refusal is `403`: the caller is known and may not do this.
     *
     * Anything else is ours and is a `500`. Collapsing it onto one of the two
     * above would be the exact rule this fix is committed under - a new failure
     * case dressed as a harmless known one.
     */
    if (err instanceof FollowupScopeError)
      return fail("not_found", 404, { channel, role: ctx.role });
    // THE TYPE, NOT A MESSAGE REGEX. `assertCan` throws a typed ForbiddenError;
    // matching on message text would stop matching the day somebody rewords it,
    // and it would fail OPEN - a capability refusal reported as a 500.
    if (err instanceof ForbiddenError)
      return fail("forbidden", 403, { channel, role: ctx.role });
    // Names only, never values, and never the patient (rule 7). The log stays
    // BESIDE the capture rather than being replaced by it: a deployment with no
    // DSN discards every Sentry event in silence (see lib/observability/
    // sentry-dsn.ts), and the platform log is the floor under that.
    console.error(
      "[followup] recordFollowupContact failed",
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
    return fail("server_error", 500, { channel, role: ctx.role, cause: err });
  }

  // 200 with a body rather than 204: a `keepalive` fetch that unloads mid-flight
  // gives the client nothing to read either way, and a body means the success
  // path and the failure path have the same shape to parse.
  return NextResponse.json({ ok: true });
}
