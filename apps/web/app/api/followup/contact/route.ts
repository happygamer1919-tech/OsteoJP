import { NextResponse } from "next/server";
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

function fail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const ctx = await getRequestContext();
  // FAIL CLOSED, and 401 rather than a redirect: this is called by fetch, and a
  // redirect to /login would arrive as an opaque 200 that the client would read
  // as success. The single most important line in the file.
  if (!ctx) return fail("unauthenticated", 401);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("bad_request", 400);
  }

  const { patientId, channel } = body;
  if (typeof patientId !== "string" || patientId === "" || typeof channel !== "string") {
    return fail("bad_request", 400);
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
    if (err instanceof FollowupScopeError) return fail("not_found", 404);
    // THE TYPE, NOT A MESSAGE REGEX. `assertCan` throws a typed ForbiddenError;
    // matching on message text would stop matching the day somebody rewords it,
    // and it would fail OPEN - a capability refusal reported as a 500.
    if (err instanceof ForbiddenError) return fail("forbidden", 403);
    // Names only, never values, and never the patient (rule 7).
    console.error(
      "[followup] recordFollowupContact failed",
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
    return fail("server_error", 500);
  }

  // 200 with a body rather than 204: a `keepalive` fetch that unloads mid-flight
  // gives the client nothing to read either way, and a body means the success
  // path and the failure path have the same shape to parse.
  return NextResponse.json({ ok: true });
}
