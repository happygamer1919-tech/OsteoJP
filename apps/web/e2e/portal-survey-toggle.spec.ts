/**
 * portal-survey-toggle.spec.ts: the patient's own survey switch on "A minha
 * conta", in a browser (SAT-01, S8). apps/portal and apps/api, as
 * portal-reminders.spec.ts.
 *
 * ============================================================================
 * WHAT IT COVERS, AND WHY IT HAS TWO ARMS
 * ============================================================================
 * Whether the switch exists for a patient is the API's answer, from the
 * deployment's own settings, SURVEY_SEND_MODE and SURVEY_CANARY_PATIENT_IDS.
 * This file reads the SAME variables from the environment the suite was
 * started in (the lane runner hands one environment to every server), and runs
 * the arm those settings call for:
 *
 *   NOT OFFERED (unset, `off`, anything else, or `canary` without the seeded
 *   portal patient on the list): the account page has its two reminder switches
 *   and nothing of the survey. No title, no third switch. This is the arm an
 *   ordinary run takes, and it is a real assertion: while the survey is
 *   switched off a patient sees nothing new.
 *
 *   OFFERED (`SURVEY_SEND_MODE=on node scripts/lane-stack.mjs e2e ...`, or
 *   `canary` with the seeded portal patient's id on the list): the section is
 *   below the reminder switches with the switch on; one press turns it off,
 *   shows the note, survives a reload, and the database holds off with both
 *   reminder switches untouched; a second press turns it back on.
 *
 * Neither arm is skipped: exactly one of them runs, and each first proves the
 * account page rendered with its reminder switches.
 *
 * ============================================================================
 * THE SEEDED PORTAL PATIENT, PUT BACK
 * ============================================================================
 * The portal session belongs to one seeded patient, so the offered arm writes
 * that patient's survey switch. It is set on before the test and after it,
 * whatever happened in between. The reminder switches are never written here.
 */

import { test, expect } from "@playwright/test";
import { serviceClient } from "./helpers/confirm-code";
import { PORTAL_BASE_URL, PORTAL_PATIENT, PORTAL_STORAGE } from "./fixtures";

test.use({
  storageState: PORTAL_STORAGE.patient,
  baseURL: PORTAL_BASE_URL,
});

/** The settings as the switch module reads them: exact, and everything else is off. */
const MODE = process.env.SURVEY_SEND_MODE;
const LISTED = (process.env.SURVEY_CANARY_PATIENT_IDS ?? "")
  .split(",")
  .map((part) => part.trim().toLowerCase())
  .includes(PORTAL_PATIENT.id);
const OFFERED = MODE === "on" || (MODE === "canary" && LISTED);

const SECTION_TITLE = "Avaliações de satisfação";
const SWITCH_LABEL = "Receber avaliações de satisfação";
const HINT =
  "Enviada por email ou SMS 24 horas depois de uma consulta, no máximo uma vez a cada 60 dias. A equipa da clínica também a pode enviar.";
const OFF_NOTE = "Desligar não afeta os lembretes de consulta.";

let db: ReturnType<typeof serviceClient>;

type Switches = { survey_enabled: boolean; reminder_sms_enabled: boolean; reminder_email_enabled: boolean };

async function switches(): Promise<Switches> {
  const { data, error } = await db
    .from("patients")
    .select("survey_enabled, reminder_sms_enabled, reminder_email_enabled")
    .eq("id", PORTAL_PATIENT.id)
    .single();
  if (error) throw new Error(`patients read failed: ${error.message}`);
  return data as Switches;
}

async function surveyOn(): Promise<void> {
  const { error } = await db.from("patients").update({ survey_enabled: true }).eq("id", PORTAL_PATIENT.id);
  if (error) throw new Error(`survey switch reset failed: ${error.message}`);
}

test.beforeAll(() => {
  db = serviceClient();
});
test.beforeEach(surveyOn);
test.afterEach(surveyOn);

test(`SURVEY_SEND_MODE=${JSON.stringify(MODE ?? null)}, portal patient ${LISTED ? "on" : "not on"} the canary list: ${
  OFFERED
    ? "the patient turns their survey off and back on from the account page"
    : "the account page shows nothing of the survey"
}`, async ({ page }) => {
  await page.goto("/portal/account");
  await expect(page).toHaveURL(/\/portal\/account(\?|$)/, { timeout: 10_000 });

  // PREMISE, both arms: the account page rendered with its reminder switches.
  const sms = page.getByRole("switch", { name: /^SMS$/i });
  const email = page.getByRole("switch", { name: /^Email$/i });
  await expect(sms).toBeVisible();
  await expect(email).toBeVisible();

  const section = page.getByTestId("survey-toggle");
  const control = page.getByRole("switch", { name: SWITCH_LABEL });

  if (!OFFERED) {
    await expect(section).toHaveCount(0);
    await expect(page.getByRole("switch")).toHaveCount(2);
    await expect(page.getByText(SECTION_TITLE)).toHaveCount(0);
    await expect(page.getByText(SWITCH_LABEL)).toHaveCount(0);
    await expect(page.getByText(/avaliaç/i)).toHaveCount(0);
    return;
  }

  const before = await switches();
  expect(before.survey_enabled).toBe(true);
  const smsWasChecked = await sms.isChecked();
  const emailWasChecked = await email.isChecked();

  // ON, as every patient starts: the section, the switch reading on, no note.
  await expect(section.getByRole("heading", { name: SECTION_TITLE })).toBeVisible();
  await expect(section.getByText(HINT)).toBeVisible();
  await expect(control).toBeChecked();
  await expect(section.getByText(OFF_NOTE)).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(3);

  // ONE PRESS TURNS IT OFF.
  await control.click();
  await expect(control).not.toBeChecked();
  await expect(section.getByText(OFF_NOTE)).toBeVisible();
  // A refused save would put the switch back: wait for the save, then look again.
  await page.waitForLoadState("networkidle");
  await expect(control).not.toBeChecked();

  // THE DATABASE: the survey switch off, both reminder switches as they were.
  await expect.poll(switches).toEqual({ ...before, survey_enabled: false });

  // A RELOAD reads it back from the API: still off, note still there, and the
  // reminder switches on the screen are where they were.
  await page.goto("/portal/account");
  await expect(control).not.toBeChecked();
  await expect(section.getByText(OFF_NOTE)).toBeVisible();
  expect(await sms.isChecked()).toBe(smsWasChecked);
  expect(await email.isChecked()).toBe(emailWasChecked);

  // A SECOND PRESS TURNS IT BACK ON.
  await control.click();
  await expect(control).toBeChecked();
  await expect(section.getByText(OFF_NOTE)).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await expect.poll(switches).toEqual(before);
});
