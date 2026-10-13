/**
 * helpers/survey-code.ts: the database half of `survey-page.spec.ts` (SAT-01).
 *
 * ==========================================================================
 * HOW A LIVE SURVEY CODE IS MADE HERE, AND WHY THROUGH THE MANUAL DOOR
 * ==========================================================================
 * Nothing in the application issues a survey code yet: the page ships first
 * and is inert on its own. So the fixture is made at the database, through one
 * of migration 0102's own doors, and the BROWSER then drives the page and its
 * action, which is the half under test.
 *
 * 0102 has two issue doors. `issue_survey_automatic` answers only the server's
 * own session (a tenant and no user), which no client of this suite can make:
 * every token Supabase Auth signs names its user. `issue_survey_manual` is the
 * other way round: it needs a member of staff's own session. So this file
 * signs in as the seeded OWNER and calls the manual door, exactly as the
 * "Enviar avaliação" button will. The owner, because the seeded admin has no
 * clinic assignment on purpose and the door reads an admin's clinics.
 *
 * THE DOOR FINDS THE APPOINTMENT ITSELF: the patient's most recent concluded
 * one. `createConcludedVisit` therefore dates each visit by the clock, so a
 * later run's visit is always the most recent, and the door's answer is
 * checked against the appointment this run made.
 *
 * WHICH CLIENT READS WHAT. The three survey tables are revoked from every
 * application role and `service_role` is never named, so whether the
 * service-role handle can read them depends on the database in front of you
 * (the lesson helpers/confirm-code.ts records). Sends and answers are read as
 * the OWNER, through 0102's own SELECT policies. The service-role handle is
 * used only for ordinary tables: `patients`, `appointments`, `audit_log`.
 *
 * EVERY FUNCTION HERE THROWS RATHER THAN RETURNING `null`: on this surface a
 * broken fixture and a correct refusal render the same page.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { generateSurveyCode, hashSurveyCode } from "@/lib/surveys/survey-code";
import {
  CONFIRM_CODE_SECRET,
  E2E_PASSWORD,
  LOCATION,
  SERVICE,
  SURVEY_PATIENT,
  TENANT_A,
  USERS,
} from "../fixtures";

/**
 * THE APP'S OWN HASH FUNCTION, IMPORTED, NOT MIRRORED, with the key the dev
 * server runs with (playwright.config.ts injects the same fixture constant).
 * The survey code is keyed on the confirm-code key, under its own prefix.
 */
export function surveyCodeHash(code: string): string {
  return hashSurveyCode(code, { REMINDERS_CONFIRM_CODE_SECRET: CONFIRM_CODE_SECRET });
}

/**
 * A client signed in as the seeded owner, so its statements run as
 * `authenticated` with the owner's claims: the session the manual door needs,
 * and the one 0102's policies show every send and answer of the tenant to.
 */
export async function ownerClient(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. survey-page.spec.ts issues its survey codes " +
        "through 0102's manual door, which needs a real staff sign-in. Run the suite through: " +
        "node scripts/lane-stack.mjs e2e --lane <lane>",
    );
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: USERS.owner,
    password: E2E_PASSWORD,
  });
  if (error) throw new Error(`e2e owner sign-in failed: ${error.message}`);
  return client;
}

/** The survey page's own patient, created once and reused, with surveys on and an email. */
export async function ensureSurveyPatient(db: SupabaseClient): Promise<void> {
  const { error } = await db.from("patients").upsert(
    {
      id: SURVEY_PATIENT.id,
      tenant_id: TENANT_A,
      full_name: SURVEY_PATIENT.name,
      email: SURVEY_PATIENT.email,
      reminder_email_enabled: true,
      survey_enabled: true,
      deleted_at: null,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`survey fixture patient upsert failed: ${error.message}`);
}

/**
 * Remove any unanswered send an earlier test or an interrupted run left for
 * the fixture patient.
 *
 * WHY IT IS NEEDED. The manual door refuses while a link sent in the last 14
 * days is unanswered, and this database is not reset between runs. An
 * unanswered send goes with its appointment (0102: ON DELETE CASCADE), so the
 * appointment is deleted through the ordinary table and the send and its code
 * follow. An ANSWERED send is left alone: its appointment cannot be deleted,
 * and it does not block the door.
 */
export async function clearOpenSurveyLinks(db: SupabaseClient, owner: SupabaseClient): Promise<void> {
  const { data, error } = await owner
    .from("appointment_survey_sends")
    .select("appointment_id")
    .eq("patient_id", SURVEY_PATIENT.id)
    .is("consumed_at", null);
  if (error) throw new Error(`appointment_survey_sends read failed: ${error.message}`);
  const ids = [...new Set((data ?? []).map((row) => row.appointment_id as string))];
  if (ids.length === 0) return;
  const { error: deleteError } = await db.from("appointments").delete().in("id", ids);
  if (deleteError) throw new Error(`survey fixture cleanup failed: ${deleteError.message}`);
}

/**
 * One concluded visit for the fixture patient, well in the past.
 *
 * ABOUT 500 DAYS AGO, AND LATER ON EVERY CALL. Far enough back to sit outside
 * every agenda week, dashboard period and statistics range another spec reads;
 * and dated by the clock, so the visit a later call makes is the patient's
 * most recent concluded one, which is the one the manual door attaches to.
 */
export async function createConcludedVisit(
  db: SupabaseClient,
  args: { practitionerId: string },
): Promise<{ appointmentId: string; endsAt: Date }> {
  const appointmentId = randomUUID();
  const endsAt = new Date(Date.now() - 500 * 24 * 60 * 60_000);
  const startsAt = new Date(endsAt.getTime() - 50 * 60_000);
  const { error } = await db.from("appointments").insert({
    id: appointmentId,
    tenant_id: TENANT_A,
    patient_id: SURVEY_PATIENT.id,
    practitioner_id: args.practitionerId,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "completed",
  });
  if (error) throw new Error(`survey fixture appointment insert failed: ${error.message}`);
  return { appointmentId, endsAt };
}

/**
 * Issue a live survey code for the fixture patient through 0102's manual door,
 * and prove it attached to the appointment this run made.
 *
 * Returns the PLAINTEXT and its hash. The plaintext exists only here and in
 * the URL the browser opens, as in production it exists only in the message.
 */
export async function issueSurveyCode(
  owner: SupabaseClient,
  appointmentId: string,
): Promise<{ code: string; codeHash: string }> {
  const code = generateSurveyCode();
  const codeHash = surveyCodeHash(code);
  const { data, error } = await owner.rpc("issue_survey_manual", {
    p_code_hash: codeHash,
    p_tenant_id: TENANT_A,
    p_patient_id: SURVEY_PATIENT.id,
    p_channel: "email",
  });
  if (error) throw new Error(`issue_survey_manual failed: ${error.message}`);
  const row = ((data ?? []) as Array<{ result: string; appointment_id: string | null }>)[0];
  if (row?.result !== "issued") {
    throw new Error(
      `issue_survey_manual answered "${row?.result}" instead of "issued". "open_link" means an ` +
        "unanswered send from an earlier run was not cleared; \"not_allowed\" that the caller is " +
        "not the seeded owner; \"no_channel\" that the fixture patient lost its email.",
    );
  }
  if (row.appointment_id !== appointmentId) {
    throw new Error(
      "issue_survey_manual attached the send to another appointment than the one this run made: " +
        "the fixture patient has a more recent concluded visit.",
    );
  }
  return { code, codeHash };
}

/** The send of one appointment, read as the owner through 0102's policy. */
export async function surveySend(
  owner: SupabaseClient,
  appointmentId: string,
): Promise<{ consumed_at: string | null; outcome: string | null; channel: string; origin: string }> {
  const { data, error } = await owner
    .from("appointment_survey_sends")
    .select("consumed_at, outcome, channel, origin")
    .eq("appointment_id", appointmentId);
  if (error) throw new Error(`appointment_survey_sends read failed: ${error.message}`);
  if ((data ?? []).length !== 1) {
    throw new Error(`expected one send for appointment ${appointmentId}, found ${(data ?? []).length}`);
  }
  return data![0] as { consumed_at: string | null; outcome: string | null; channel: string; origin: string };
}

export type SurveyAnswerRow = {
  nps: number;
  rating: number;
  comment: string | null;
  contact_consent: boolean;
  consent_version: string;
  patient_id: string;
};

/** Every answer one appointment carries, read as the owner through 0102's policy. */
export async function surveyAnswers(
  owner: SupabaseClient,
  appointmentId: string,
): Promise<SurveyAnswerRow[]> {
  const { data, error } = await owner
    .from("appointment_survey_responses")
    .select("nps, rating, comment, contact_consent, consent_version, patient_id")
    .eq("appointment_id", appointmentId);
  if (error) throw new Error(`appointment_survey_responses read failed: ${error.message}`);
  return (data ?? []) as SurveyAnswerRow[];
}
