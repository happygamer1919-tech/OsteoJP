import "server-only";
import { eq, sql } from "drizzle-orm";
import { tenants } from "@osteojp/db";
import { withReminderTenantContext } from "@/lib/reminders/context";
import { hashSurveyCode, isWellFormedSurveyCode } from "./survey-code";

// THE SURVEY'S DATABASE HALF (SAT-01): the page's read and answer, and the
// automatic send's issue.
//
// ==========================================================================
// WHO MAY CALL THE DOORS: THE SERVER'S OWN SESSION AND NO OTHER
// ==========================================================================
// Migration 0102 revokes its three tables from every application role. The page
// reaches them only through SECURITY DEFINER doors granted to `authenticated`:
// `resolve_survey_code` (the read) and `submit_survey_response` (the answer).
// The third door, `opt_out_survey`, is not called here: the opt-out button is a
// later pull request. The 24-hour job reaches them through a fourth,
// `issue_survey_automatic` (the issue, at the foot of this file).
//
// All of them answer ONLY a session that carries a tenant and neither a user nor
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

/**
 * What `issue_survey_automatic` answers (migration 0102, 5b).
 *
 *   issued        one send and its code were written
 *   cooldown      a send, manual or automatic, exists for the patient in the
 *                 last 60 days
 *   not_eligible  the visit is not concluded, the patient is removed or opted
 *                 out, the channel is not permitted, or the visit already has
 *                 an answer
 *   not_allowed   the session is not the server's own, or the tenant is not
 *                 the session's
 */
export type SurveyIssueResult = "issued" | "cooldown" | "not_eligible" | "not_allowed";

const SURVEY_ISSUE_RESULTS: readonly string[] = ["issued", "cooldown", "not_eligible", "not_allowed"];

/**
 * Issue the automatic send for one concluded appointment: one row in
 * `appointment_survey_sends` and the code's hash beside it, or the door's
 * reason for writing neither.
 *
 * THE DOOR DECIDES, UNDER A PER-PATIENT LOCK. Two runs waking together for one
 * patient, or a run waking while staff send by hand, produce one send.
 *
 * ONLY THE HASH IS PASSED ON. The caller holds the code as a value, has
 * already built the message that carries it, and drops it after the hand-over.
 *
 * IT THROWS on a missing key, on a database error and on an answer it does not
 * know. An unknown answer is never read as `issued`.
 */
export async function issueSurveyAutomatic(args: {
  tenantId: string;
  appointmentId: string;
  channel: "email" | "sms";
  code: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SurveyIssueResult> {
  const codeHash = hashSurveyCode(args.code, args.env ?? process.env);
  const result = await withReminderTenantContext(args.tenantId, async (tx) =>
    tx.execute(
      sql`select public.issue_survey_automatic(
            ${codeHash}, ${args.tenantId}::uuid, ${args.appointmentId}::uuid, ${args.channel}::text) as result`,
    ),
  );
  const first = rowsOf(result)[0] as { result?: unknown } | undefined;
  const answer = first?.result;
  if (typeof answer !== "string" || !SURVEY_ISSUE_RESULTS.includes(answer)) {
    throw new Error("surveys/survey-store: issue_survey_automatic gave an answer this code does not know");
  }
  return answer as SurveyIssueResult;
}
