/**
 * survey-switch.spec.ts: the patient's survey switch on the ficha, in a
 * browser (SAT-01, S8).
 *
 * ============================================================================
 * WHAT IT COVERS, AND WHY IT HAS TWO ARMS
 * ============================================================================
 * Whether the switch exists at all depends on the deployment's own setting,
 * SURVEY_SEND_MODE, which the web server reads. This file reads the SAME
 * variable from the environment the suite was started in (the lane runner
 * hands one environment to both), and runs the arm that setting calls for:
 *
 *   OFF (unset, `off`, or anything else): a member of staff opens a patient's
 *   Resumo and there is no "Avaliações de satisfação" section and no switch.
 *   This is the arm an ordinary run takes, and it is a real assertion: while
 *   the survey is switched off, staff see nothing of it.
 *
 *   ON or CANARY (`SURVEY_SEND_MODE=on node scripts/lane-stack.mjs e2e ...`):
 *   the section is there with the switch on; one press turns it off, shows the
 *   note, and the database holds off with both reminder switches untouched and
 *   two audit rows; a second press turns it back on.
 *
 * Neither arm is skipped: exactly one of them runs, and each first proves the
 * Resumo tab rendered.
 *
 * ============================================================================
 * ITS OWN PATIENT, EVERY TIME
 * ============================================================================
 * Each test makes a patient of its own and removes it afterwards, so a run in
 * another browser, a retry and another spec cannot meet it. An invented name.
 */

import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { serviceClient } from "./helpers/confirm-code";
import { LOCATION, TENANT_A } from "./fixtures";

test.use({ storageState: "e2e/.auth/admin.json" });

/** The setting as `lib/reminders/survey-mode.ts` reads it: exact, and everything else is off. */
const MODE = process.env.SURVEY_SEND_MODE;
const VISIBLE = MODE === "on" || MODE === "canary";

const SECTION_TITLE = "Avaliações de satisfação";
const SWITCH_LABEL = "Enviar avaliação de satisfação depois das consultas";
const OFF_NOTE = "Desligar não afeta os lembretes de consulta.";

let db: ReturnType<typeof serviceClient>;
let patientId: string;

test.beforeAll(() => {
  db = serviceClient();
});

test.beforeEach(async () => {
  patientId = randomUUID();
  const { error } = await db.from("patients").insert({
    id: patientId,
    tenant_id: TENANT_A,
    full_name: `ZZ Interruptor Avaliacao ${patientId.slice(0, 8)}`,
    primary_location_id: LOCATION.id,
  });
  if (error) throw new Error(`survey switch fixture patient insert failed: ${error.message}`);
  const { error: linkError } = await db
    .from("patient_locations")
    .insert({ tenant_id: TENANT_A, patient_id: patientId, location_id: LOCATION.id });
  if (linkError) throw new Error(`survey switch fixture clinic link failed: ${linkError.message}`);
});

test.afterEach(async () => {
  await db.from("patient_locations").delete().eq("patient_id", patientId);
  const { error } = await db.from("patients").delete().eq("id", patientId);
  if (error) throw new Error(`survey switch fixture cleanup failed: ${error.message}`);
});

async function switches(): Promise<{
  survey_enabled: boolean;
  reminder_sms_enabled: boolean;
  reminder_email_enabled: boolean;
}> {
  const { data, error } = await db
    .from("patients")
    .select("survey_enabled, reminder_sms_enabled, reminder_email_enabled")
    .eq("id", patientId)
    .single();
  if (error) throw new Error(`patients read failed: ${error.message}`);
  return data as { survey_enabled: boolean; reminder_sms_enabled: boolean; reminder_email_enabled: boolean };
}

async function audits(action: string): Promise<Array<{ actor_user_id: string | null; metadata: unknown }>> {
  const { data, error } = await db
    .from("audit_log")
    .select("actor_user_id, metadata, created_at")
    .eq("tenant_id", TENANT_A)
    .eq("entity_type", "patient")
    .eq("entity_id", patientId)
    .eq("action", action)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`audit_log read failed: ${error.message}`);
  return (data ?? []).map((row) => ({ actor_user_id: row.actor_user_id as string | null, metadata: row.metadata }));
}

test(`SURVEY_SEND_MODE=${JSON.stringify(MODE ?? null)}: ${
  VISIBLE
    ? "staff turn a patient's survey off and back on from the ficha"
    : "the ficha shows nothing of the survey"
}`, async ({ page }) => {
  await page.goto(`/patients/${patientId}`);
  const resumo = page.locator("#tabpanel-resumo");
  // PREMISE, both arms: the Resumo tab rendered for this patient.
  await expect(resumo.getByText("Dados pessoais")).toBeVisible();

  const section = page.getByTestId("ficha-survey-section");
  const control = page.getByRole("switch", { name: SWITCH_LABEL });

  if (!VISIBLE) {
    await expect(section).toHaveCount(0);
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(resumo.getByText(SECTION_TITLE)).toHaveCount(0);
    await expect(resumo.getByText(SWITCH_LABEL)).toHaveCount(0);
    return;
  }

  const before = await switches();
  expect(before.survey_enabled).toBe(true);

  // ON, as every patient starts: the section, the switch reading on, no note.
  await expect(section.getByText(SECTION_TITLE)).toBeVisible();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(section.getByText(OFF_NOTE)).toHaveCount(0);

  // ONE PRESS TURNS IT OFF.
  await control.click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}\\?tab=resumo$`));
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(section.getByText(OFF_NOTE)).toBeVisible();
  await expect(section.getByRole("alert")).toHaveCount(0);

  // THE DATABASE: the survey switch off, both reminder switches as they were.
  expect(await switches()).toEqual({ ...before, survey_enabled: false });
  // Two audit rows, both carrying the member of staff: the application's names
  // the field, the database's carries the new value.
  const updates = await audits("patient.update");
  const changes = await audits("survey.switch_changed");
  expect(updates).toHaveLength(1);
  expect(updates[0]!.metadata).toEqual({ fields: ["surveyEnabled"] });
  expect(updates[0]!.actor_user_id).not.toBeNull();
  expect(changes).toHaveLength(1);
  expect(changes[0]!.metadata).toEqual({ survey_enabled: false, actor_patient_id: null });
  expect(changes[0]!.actor_user_id).toBe(updates[0]!.actor_user_id);

  // It is still off after a reload: the screen shows what is stored.
  await page.reload();
  await expect(control).toHaveAttribute("aria-checked", "false");

  // A SECOND PRESS TURNS IT BACK ON.
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(section.getByText(OFF_NOTE)).toHaveCount(0);
  expect(await switches()).toEqual(before);
  expect((await audits("survey.switch_changed")).map((row) => row.metadata)).toEqual([
    { survey_enabled: false, actor_patient_id: null },
    { survey_enabled: true, actor_patient_id: null },
  ]);
  expect(await audits("patient.update")).toHaveLength(2);
});
