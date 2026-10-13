import "server-only";
import { eq, sql } from "drizzle-orm";
import { tenants } from "@osteojp/db";
import { withReminderTenantContext } from "@/lib/reminders/context";
import { hashSurveyCode, isWellFormedSurveyCode } from "./survey-code";

// THE SURVEY PAGE'S DATABASE HALF (SAT-01): the read, the answer and the
// opt-out.
//
// ==========================================================================
// WHO MAY CALL THE DOORS: THE SERVER'S OWN SESSION AND NO OTHER
// ==========================================================================
// Migration 0102 revokes its three tables from every application role. The page
// reaches them only through SECURITY DEFINER doors granted to `authenticated`:
// `resolve_survey_code` (the read), `submit_survey_response` (the answer) and
// `opt_out_survey` (the opt-out, S8).
//
// The doors answer ONLY a session that carries a tenant and neither a user nor
// a patient claim. That is what `withReminderTenantContext` makes on the
// application's own connection, and it is why this file never touches the
// visitor's session: a visitor who is also signed in as staff, or in the
// patient portal, would otherwise be told their link is not valid (spec 3.6,
// note A1).
//
// The code is the whole of the holder's authority. Its plaintext exists in the
// link and in the request; this file hashes it and passes only the hash on. It
// is never stored and never logged.

/**
 * The all-zero uuid, the tenant claim for the ONE statement that runs before a
 * tenant is known. `resolve_survey_code` is SECURITY DEFINER and does not read
 * the claim; it is not a tenant and selects no row through any policy.
 */
const NIL_TENANT = "00000000-0000-0000-0000-000000000000";

/**
 * A hash that names no row, for a code that is not well formed. 64 hex zeros:
 * it passes the door's own shape check, so the lookup is the same primary-key
 * probe a real hash gets and a malformed code costs what an unknown one costs.
 */
const NOWHERE_HASH = "0".repeat(64);

function rowsOf(result: unknown): unknown[] {
  return Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
}

/**
 * What a code resolves to, or null.
 *
 * ONE ANSWER FOR EVERY CODE THAT IS NOT LIVE. The door returns no row,
 * identically, for a code that was never issued, one whose answer is already
 * recorded, one older than 14 days, one whose visit is no longer concluded and
 * one whose patient was removed. A malformed code takes the same query. A
 * confirm code presented here is looked up under the survey domain's hash and
 * in the survey table, so it is one more unknown code.
 *
 * NEVER WRITES. The door is STABLE; opening the link spends nothing.
 */
export async function resolveSurveyCode(args: {
  code: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ tenantId: string; appointmentId: string; visitEndsAt: Date } | null> {
  const codeHash = isWellFormedSurveyCode(args.code)
    ? hashSurveyCode(args.code, args.env ?? process.env)
    : NOWHERE_HASH;

  const result = await withReminderTenantContext(NIL_TENANT, async (tx) =>
    tx.execute(
      sql`select tenant_id, appointment_id, visit_ends_at from public.resolve_survey_code(${codeHash})`,
    ),
  );
  const row = rowsOf(result)[0] as
    | { tenant_id: string; appointment_id: string; visit_ends_at: string | Date }
    | undefined;
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    appointmentId: row.appointment_id,
    visitEndsAt: new Date(row.visit_ends_at),
  };
}

/** The four things the form collects, already validated by survey-form.ts. */
export type SurveyAnswer = {
  nps: number;
  rating: number;
  comment: string | null;
  contactConsent: boolean;
  /** The label of the text the visitor was shown (survey-consent.ts). */
  consentVersion: string;
};

/**
 * Record one answer for a code. `recorded`, or `refused` with nothing written.
 *
 * THE DOOR DECIDES, UNDER A LOCK. The resolve below only finds the tenant the
 * door must be called in; `submit_survey_response` then locks the send, asks
 * the same question again and writes the answer, the consumed send and one
 * audit row in one transaction. Two presses of one link produce one answer:
 * the second waits, finds the send consumed and is refused.
 *
 * `refused` SAYS NOTHING ABOUT WHY, on purpose: unknown, spent, expired and
 * no-longer-eligible are one answer here as they are on the page.
 *
 * IT THROWS on a database error. The caller reports that as "could not save",
 * never as a refusal: a failed write must not read as an invalid link.
 */
export async function submitSurveyResponse(args: {
  code: string;
  answer: SurveyAnswer;
  env?: NodeJS.ProcessEnv;
}): Promise<"recorded" | "refused"> {
  const resolved = await resolveSurveyCode({ code: args.code, env: args.env });
  if (!resolved) return "refused";

  const codeHash = hashSurveyCode(args.code, args.env ?? process.env);
  const { nps, rating, comment, contactConsent, consentVersion } = args.answer;
  const result = await withReminderTenantContext(resolved.tenantId, async (tx) =>
    tx.execute(
      sql`select public.submit_survey_response(
            ${codeHash}, ${resolved.tenantId}::uuid, ${nps}::integer, ${rating}::integer,
            ${comment}::text, ${contactConsent}::boolean, ${consentVersion}::text) as recorded`,
    ),
  );
  const first = rowsOf(result)[0] as { recorded?: unknown } | undefined;
  return first?.recorded === true ? "recorded" : "refused";
}

/**
 * Stop the surveys for the patient a code was sent to. `recorded`, or `refused`
 * with nothing written.
 *
 * THE DOOR WRITES, AND NOTHING ELSE HERE DOES. `opt_out_survey` locks the send,
 * asks the question the read asks, and in one transaction turns that patient's
 * survey switch off, consumes the send as an opt-out and writes its audit row
 * (the switch's own audit row is written by the database beside it). This file
 * never learns who the patient is: the door finds them from the send.
 *
 * ONLY THE SURVEY SWITCH MOVES. The two reminder switches are not the door's to
 * touch, and the page says so (text 20).
 *
 * `refused` SAYS NOTHING ABOUT WHY, and IT THROWS on a database error, both as
 * `submitSurveyResponse` does and for the same reasons.
 */
export async function optOutSurvey(args: {
  code: string;
  env?: NodeJS.ProcessEnv;
}): Promise<"recorded" | "refused"> {
  const resolved = await resolveSurveyCode({ code: args.code, env: args.env });
  if (!resolved) return "refused";

  const codeHash = hashSurveyCode(args.code, args.env ?? process.env);
  const result = await withReminderTenantContext(resolved.tenantId, async (tx) =>
    tx.execute(
      sql`select public.opt_out_survey(${codeHash}, ${resolved.tenantId}::uuid) as recorded`,
    ),
  );
  const first = rowsOf(result)[0] as { recorded?: unknown } | undefined;
  return first?.recorded === true ? "recorded" : "refused";
}

/**
 * The tenant's settings blob, for the page's language. Read in the tenant's own
 * context, under RLS, and nothing about a patient or an appointment is read
 * with it: the page shows the visit date the door returned and no more.
 */
export async function loadSurveyTenantSettings(tenantId: string): Promise<unknown> {
  return withReminderTenantContext(tenantId, async (tx) => {
    const rows = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0]?.settings ?? null;
  });
}
