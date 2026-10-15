/**
 * survey-profile-rows.spec.ts: the patient's survey sends on the ficha, in a
 * browser (SAT-01, S11, spec 7.7).
 *
 * ============================================================================
 * WHAT IT COVERS, AND WHY IT HAS TWO ARMS
 * ============================================================================
 * Whether the section exists at all depends on the deployment's own setting,
 * SURVEY_SEND_MODE, which the web server reads. This file reads the SAME
 * variable from the environment the suite was started in (the lane runner
 * hands one environment to both), and runs the arm that setting calls for, as
 * survey-switch.spec.ts and survey-list.spec.ts do:
 *
 *   OFF (unset, `off`, or anything else): a therapist and an admin open the
 *   ficha of a patient who HAS a concluded visit, and there is no "Avaliações
 *   de satisfação" section, no line of a send and no switch, on the plain
 *   address and on the Resumo tab named in the address. This is the arm an
 *   ordinary run takes, and it is a real assertion: while the survey is
 *   switched off, staff see nothing of it.
 *
 *   ON or CANARY (`SURVEY_SEND_MODE=on node scripts/lane-stack.mjs e2e ...`):
 *   a therapist opens the ficha of a patient they treat and finds the send in
 *   the section, with who sent it, the clinic and "Sem resposta", no switch
 *   and no send button; an admin with no clinic assignment opens the same
 *   ficha, has the switch, is shown none of that send (S7: "at their
 *   clinics"), and reads that none is visible to them (copy text 88, strategy
 *   Q-19, 2026-10-14), not that none was sent. The owner, the one role told
 *   text 78, has no signed-in state in this suite; that half is measured in
 *   app/patients/[id]/page-survey-rows.test.tsx.
 *
 * Neither arm is skipped: exactly one of them runs, and each first proves the
 * Resumo tab rendered.
 *
 * ============================================================================
 * ITS OWN PATIENT, EVERY TIME
 * ============================================================================
 * Each run makes a patient of its own with one concluded visit long ago, and
 * removes them afterwards. The ON arm adds one survey send through migration
 * 0102's manual door, signed in as the seeded owner, as survey-list.spec.ts
 * makes its own: no application role may insert a send. An invented name and
 * an invented address. Which sends and which answers each role reads, and
 * that no answer reaches a role that may not read it, is measured against the
 * database in lib/surveys/survey-list.db.test.ts.
 */

import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./helpers/confirm-code";
import { ownerClient, surveyCodeHash } from "./helpers/survey-code";
import { generateSurveyCode } from "@/lib/surveys/survey-code";
import { LOCATION, SERVICE, STORAGE, TENANT_A, USERS } from "./fixtures";

/** The setting as `lib/reminders/survey-mode.ts` reads it: exact, and everything else is off. */
const MODE = process.env.SURVEY_SEND_MODE;
const VISIBLE = MODE === "on" || MODE === "canary";

const SECTION_TITLE = "Avaliações de satisfação";
const SWITCH_LABEL = "Enviar avaliação de satisfação depois das consultas";
/** Copy text 78: said to the owner alone. */
const NONE = "Nenhuma avaliação de satisfação enviada.";
/** Copy text 88 (strategy, Q-19, 2026-10-14): said to every other viewer. */
const NONE_VISIBLE = "Nenhuma avaliação de satisfação visível para si.";
/**
 * The first visit to a route, run alone on a dev server, waits for that route
 * to compile (survey-list.spec.ts measured it). Only the first assertion after
 * a navigation that can meet a cold route takes it.
 */
const COLD_ROUTE = { timeout: 60_000 };

test.describe.configure({ mode: "serial" });

let db: SupabaseClient;
let patientId: string;
let appointmentId: string;

test.beforeAll(async () => {
  db = serviceClient();

  const therapist = await db.from("users").select("id").eq("tenant_id", TENANT_A).eq("email", USERS.therapist).single();
  if (therapist.error) throw new Error(`e2e therapist: ${therapist.error.message}`);

  patientId = randomUUID();
  const patient = await db.from("patients").insert({
    id: patientId,
    tenant_id: TENANT_A,
    full_name: `ZZ Ficha Avaliacao ${patientId.slice(0, 8)}`,
    email: `zz-ficha-${patientId.slice(0, 8)}@osteojp.test`,
    reminder_email_enabled: true,
    primary_location_id: LOCATION.id,
  });
  if (patient.error) throw new Error(`survey ficha fixture patient insert failed: ${patient.error.message}`);
  const link = await db
    .from("patient_locations")
    .insert({ tenant_id: TENANT_A, patient_id: patientId, location_id: LOCATION.id });
  if (link.error) throw new Error(`survey ficha fixture clinic link failed: ${link.error.message}`);

  // One concluded visit with the seeded therapist, about 500 days ago: outside
  // every agenda week, dashboard period and statistics range another spec reads.
  // It is what makes this a patient the therapist treats, in both arms.
  appointmentId = randomUUID();
  const endsAt = new Date(Date.now() - 500 * 24 * 60 * 60_000);
  const visit = await db.from("appointments").insert({
    id: appointmentId,
    tenant_id: TENANT_A,
    patient_id: patientId,
    practitioner_id: therapist.data.id,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    starts_at: new Date(endsAt.getTime() - 50 * 60_000).toISOString(),
    ends_at: endsAt.toISOString(),
    status: "completed",
  });
  if (visit.error) throw new Error(`survey ficha fixture appointment insert failed: ${visit.error.message}`);

  if (!VISIBLE) return;

  // THE SEND, through 0102's manual door, as the seeded owner. The code is
  // made and thrown away: nothing in this file opens the link.
  const owner = await ownerClient();
  const issued = await owner.rpc("issue_survey_manual", {
    p_code_hash: surveyCodeHash(generateSurveyCode()),
    p_tenant_id: TENANT_A,
    p_patient_id: patientId,
    p_channel: "email",
  });
  if (issued.error) throw new Error(`issue_survey_manual failed: ${issued.error.message}`);
  const row = ((issued.data ?? []) as Array<{ result: string; appointment_id: string | null }>)[0];
  if (row?.result !== "issued" || row.appointment_id !== appointmentId) {
    throw new Error(`issue_survey_manual answered ${JSON.stringify(row)} instead of issuing for this run's visit`);
  }
});

test.afterAll(async () => {
  if (!db) return;
  // An unanswered send and its code go with their appointment (0102: ON DELETE CASCADE).
  await db.from("appointments").delete().eq("id", appointmentId);
  await db.from("patient_locations").delete().eq("patient_id", patientId);
  const { error } = await db.from("patients").delete().eq("id", patientId);
  if (error) throw new Error(`survey ficha fixture cleanup failed: ${error.message}`);
});

if (!VISIBLE) {
  for (const [role, storageState] of [
    ["a therapist", STORAGE.therapist],
    ["an admin", STORAGE.admin],
  ] as const) {
    test.describe(`SURVEY_SEND_MODE=${JSON.stringify(MODE ?? null)}, ${role}`, () => {
      test.use({ storageState });

      test("the ficha shows nothing of the survey, on the plain address and on Resumo by name", async ({ page }) => {
        for (const address of [`/patients/${patientId}`, `/patients/${patientId}?tab=resumo`]) {
          await page.goto(address);
          const resumo = page.locator("#tabpanel-resumo");
          // PREMISE: the Resumo tab rendered for this patient.
          await expect(resumo.getByText("Dados pessoais"), address).toBeVisible(COLD_ROUTE);

          await expect(page.getByTestId("ficha-survey-section"), address).toHaveCount(0);
          await expect(page.getByTestId("ficha-survey-row"), address).toHaveCount(0);
          await expect(page.getByText(SECTION_TITLE), address).toHaveCount(0);
          await expect(page.getByText(NONE), address).toHaveCount(0);
          await expect(page.getByText(NONE_VISIBLE), address).toHaveCount(0);
          await expect(page.getByText("Sem resposta"), address).toHaveCount(0);
          await expect(page.getByRole("switch"), address).toHaveCount(0);
        }
      });
    });
  }
} else {
  test.describe(`SURVEY_SEND_MODE=${JSON.stringify(MODE)}, a therapist`, () => {
    test.use({ storageState: STORAGE.therapist });

    test("the send of a patient they treat is in Avaliações de satisfação on the ficha, with no switch and no send button", async ({ page }) => {
      await page.goto(`/patients/${patientId}`);
      const resumo = page.locator("#tabpanel-resumo");
      // PREMISE: the Resumo tab rendered for this patient.
      await expect(resumo.getByText("Dados pessoais")).toBeVisible(COLD_ROUTE);

      const section = page.getByTestId("ficha-survey-section");
      await expect(section.getByText(SECTION_TITLE)).toBeVisible();

      // BY THE ROW'S OWN CONTENT: one send, sent by a person, not answered, at this clinic.
      const rows = section.getByTestId("ficha-survey-row");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Sem resposta");
      await expect(rows).toContainText(", por ");
      await expect(rows).toContainText(LOCATION.name);
      await expect(rows).toHaveAttribute("data-answer", "open");
      // No answer exists: nothing reserved to announce, and no line of an answer.
      await expect(section.getByTestId("ficha-survey-answer-reserved")).toHaveCount(0);
      await expect(section.getByText("Recomendação (0 a 10)")).toHaveCount(0);
      await expect(section.getByText(NONE)).toHaveCount(0);
      await expect(section.getByText(NONE_VISIBLE)).toHaveCount(0);

      // A therapist is not offered the switch, and nobody has a send button yet.
      await expect(page.getByRole("switch")).toHaveCount(0);
      await expect(section.getByText(SWITCH_LABEL)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Enviar avaliação" })).toHaveCount(0);

      // It is on Resumo and on no other tab.
      await page.goto(`/patients/${patientId}?tab=consultas`);
      await expect(page.locator("#tabpanel-consultas")).toBeVisible(COLD_ROUTE);
      await expect(page.getByTestId("ficha-survey-section")).toHaveCount(0);
    });
  });

  test.describe(`SURVEY_SEND_MODE=${JSON.stringify(MODE)}, an admin with no clinic assignment`, () => {
    test.use({ storageState: STORAGE.admin });

    test("the section opens with the switch, shows none of that send (S7: at their clinics) and says none is visible to them", async ({ page }) => {
      await page.goto(`/patients/${patientId}`);
      const resumo = page.locator("#tabpanel-resumo");
      await expect(resumo.getByText("Dados pessoais")).toBeVisible(COLD_ROUTE);

      const section = page.getByTestId("ficha-survey-section");
      // PREMISE: the section itself rendered for this role, with its switch.
      await expect(section.getByText(SECTION_TITLE)).toBeVisible();
      await expect(section.getByRole("switch", { name: SWITCH_LABEL })).toHaveAttribute("aria-checked", "true");
      await expect(section.getByTestId("ficha-survey-row")).toHaveCount(0);
      await expect(section.getByText(", por ")).toHaveCount(0);
      // Not "none was sent": one was. Text 88, by its own element.
      await expect(section.getByTestId("ficha-survey-rows-none")).toHaveText(NONE_VISIBLE);
      await expect(section.getByText(NONE)).toHaveCount(0);
    });
  });
}
