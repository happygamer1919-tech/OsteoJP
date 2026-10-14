/**
 * survey-list.spec.ts: the survey list in Comunicações, in a browser (SAT-01,
 * spec 7.3).
 *
 * ============================================================================
 * WHAT IT COVERS, AND WHY IT HAS TWO ARMS
 * ============================================================================
 * Whether the list exists at all depends on the deployment's own setting,
 * SURVEY_SEND_MODE, which the web server reads. This file reads the SAME
 * variable from the environment the suite was started in (the lane runner
 * hands one environment to both), and runs the arm that setting calls for, as
 * survey-switch.spec.ts does:
 *
 *   OFF (unset, `off`, or anything else): Comunicações has no "Avaliações de
 *   satisfação" tab for reception or for a therapist, and the list's own
 *   address answers 404 with nothing of the survey on it. This is the arm an
 *   ordinary run takes, and it is a real assertion: while the survey is
 *   switched off, staff see nothing of it.
 *
 *   ON or CANARY (`SURVEY_SEND_MODE=on node scripts/lane-stack.mjs e2e ...`):
 *   a therapist reaches the list from the sidebar and finds the send of a
 *   patient they treat, with who sent it, its channel and "Sem resposta";
 *   reception with no clinic assignment reaches the same page, is shown
 *   none of it (S7: "at their clinics") and reads why (copy text 87). A
 *   chosen month with no send reads text 86 (both strategy, 2026-10-14).
 *
 * Neither arm is skipped: exactly one of them runs, and each first proves the
 * Comunicações group rendered.
 *
 * ============================================================================
 * ITS OWN PATIENT, EVERY TIME
 * ============================================================================
 * The ON arm makes a patient of its own, one concluded visit long ago and one
 * survey send, and removes them afterwards, so a run in another browser, a
 * retry and another spec cannot meet them. The send is made through migration
 * 0102's manual door, signed in as the seeded owner, as survey-page.spec.ts
 * makes its own: no application role may insert a send. An invented name and
 * an invented address. Which rows each role reads, and that no answer reaches a
 * role that may not read it, is measured against the database in
 * lib/surveys/survey-list.db.test.ts.
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

const LIST_URL = "/comunicacoes/avaliacoes-de-satisfacao";
const TAB = "Avaliações de satisfação";
const SECTIONS = "Secções de Comunicações";
/**
 * The first visit to a route, run alone on a dev server, waits for that route
 * to compile; five seconds is not always enough (measured: the "Compiling"
 * badge was still up). Only the navigations that can meet a cold route take it.
 */
const COLD_ROUTE = { timeout: 60_000 };
/** Copy texts 86 and 87, written by strategy on 2026-10-14, pending the clinic's final yes. */
const EMPTY_MONTH = "Nenhuma avaliação enviada neste mês.";
const NO_CLINIC = "Sem clínica associada. Peça a um administrador para o associar a uma clínica.";

test.describe.configure({ mode: "serial" });

if (!VISIBLE) {
  for (const [role, storageState] of [
    ["reception", STORAGE.reception],
    ["a therapist", STORAGE.therapist],
  ] as const) {
    test.describe(`SURVEY_SEND_MODE=${JSON.stringify(MODE ?? null)}, ${role}`, () => {
      test.use({ storageState });

      test("Comunicações has no survey tab, and the list's address is not there", async ({ page }) => {
        await page.goto("/dashboard");
        await page.getByRole("navigation").getByRole("link", { name: "Comunicações" }).click();
        // PREMISE: the Comunicações group rendered, on its first section.
        await expect(page).toHaveURL(/\/recuperacao/, COLD_ROUTE);
        await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toBeVisible();
        await expect(page.getByRole("link", { name: TAB })).toHaveCount(0);
        await expect(page.getByText(TAB)).toHaveCount(0);

        // A DIRECT VISIT: the address answers "not found", and nothing of the list is on it.
        const response = await page.goto(LIST_URL);
        expect(response?.status()).toBe(404);
        await expect(page.getByRole("heading", { name: TAB })).toHaveCount(0);
        await expect(page.getByText("Recomendação (0 a 10)")).toHaveCount(0);
        await expect(page.getByLabel("Mês")).toHaveCount(0);
        await expect(page.getByText(EMPTY_MONTH)).toHaveCount(0);
        await expect(page.getByText(NO_CLINIC)).toHaveCount(0);
      });
    });
  }
} else {
  let db: SupabaseClient;
  let patientId: string;
  let patientName: string;
  let appointmentId: string;

  test.beforeAll(async () => {
    db = serviceClient();
    const owner = await ownerClient();

    const therapist = await db.from("users").select("id").eq("tenant_id", TENANT_A).eq("email", USERS.therapist).single();
    if (therapist.error) throw new Error(`e2e therapist: ${therapist.error.message}`);

    patientId = randomUUID();
    patientName = `ZZ Lista Avaliacao ${patientId.slice(0, 8)}`;
    const patient = await db.from("patients").insert({
      id: patientId,
      tenant_id: TENANT_A,
      full_name: patientName,
      email: `zz-lista-${patientId.slice(0, 8)}@osteojp.test`,
      reminder_email_enabled: true,
      primary_location_id: LOCATION.id,
    });
    if (patient.error) throw new Error(`survey list fixture patient insert failed: ${patient.error.message}`);
    const link = await db
      .from("patient_locations")
      .insert({ tenant_id: TENANT_A, patient_id: patientId, location_id: LOCATION.id });
    if (link.error) throw new Error(`survey list fixture clinic link failed: ${link.error.message}`);

    // One concluded visit with the seeded therapist, about 500 days ago: outside
    // every agenda week, dashboard period and statistics range another spec reads.
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
    if (visit.error) throw new Error(`survey list fixture appointment insert failed: ${visit.error.message}`);

    // THE SEND, through 0102's manual door, as the seeded owner. The code is
    // made and thrown away: nothing in this file opens the link.
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
    if (error) throw new Error(`survey list fixture cleanup failed: ${error.message}`);
  });

  test.describe(`SURVEY_SEND_MODE=${JSON.stringify(MODE)}, a therapist`, () => {
    test.use({ storageState: STORAGE.therapist });

    test("the send of a patient they treat is on Avaliações de satisfação, reached from the sidebar", async ({ page }) => {
      await page.goto("/dashboard");
      await page.getByRole("navigation").getByRole("link", { name: "Comunicações" }).click();
      await expect(page).toHaveURL(/\/recuperacao/, COLD_ROUTE);

      const sections = page.getByRole("navigation", { name: SECTIONS });
      await sections.getByRole("link", { name: TAB }).click();
      await expect(page).toHaveURL(new RegExp(`${LIST_URL}$`), COLD_ROUTE);
      await expect(page.getByRole("heading", { name: TAB })).toBeVisible();
      await expect(sections.getByRole("link", { name: TAB })).toHaveAttribute("aria-current", "page");

      // BY THE ROW'S OWN CONTENT: this run's patient, and the send's state in the same row.
      const row = page.getByRole("row").filter({ hasText: patientName });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("Sem resposta");
      await expect(row).toContainText("Email");
      await expect(row).toContainText(", por ");
      await expect(row).toContainText(LOCATION.name);
      await expect(row.getByRole("link", { name: "Abrir ficha" })).toHaveAttribute("href", `/patients/${patientId}`);
      // No answer exists, so there is nothing reserved to announce.
      await expect(row.getByTestId("survey-answer-reserved")).toHaveCount(0);

      // No send button on this screen (it arrives with the manual send).
      await expect(page.getByRole("button", { name: "Enviar avaliação" })).toHaveCount(0);

      // THE MONTH FILTER: a month with no send drops the row; emptying it brings the row back.
      const month = page.getByLabel("Mês");
      await month.fill("2001-01");
      await expect(page).toHaveURL(/[?&]mes=2001-01/);
      await expect(page.getByRole("row").filter({ hasText: patientName })).toHaveCount(0);
      await expect(page.getByText("Ainda não foi enviada nenhuma avaliação de satisfação.")).toHaveCount(0);
      // Text 86 says so; a therapist's reads do not follow a clinic, so never text 87.
      await expect(page.getByText(EMPTY_MONTH)).toBeVisible();
      await expect(page.getByText(NO_CLINIC)).toHaveCount(0);
      await month.fill("");
      await expect(page).not.toHaveURL(/mes=/);
      await expect(page.getByRole("row").filter({ hasText: patientName })).toHaveCount(1);
    });
  });

  test.describe(`SURVEY_SEND_MODE=${JSON.stringify(MODE)}, reception with no clinic assignment`, () => {
    test.use({ storageState: STORAGE.reception });

    test("the page opens and shows none of that send (S7: at their clinics)", async ({ page }) => {
      await page.goto(LIST_URL);
      // PREMISE: the page itself rendered for this role, with its tab.
      await expect(page.getByRole("heading", { name: TAB })).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: SECTIONS }).getByRole("link", { name: TAB }),
      ).toBeVisible();
      await expect(page.getByText(patientName)).toHaveCount(0);
      // Text 87 says why, and not that none was ever sent: one was.
      await expect(page.getByText(NO_CLINIC)).toBeVisible();
      await expect(page.getByText("Ainda não foi enviada nenhuma avaliação de satisfação.")).toHaveCount(0);
      // The same with a month chosen: for them every month is empty for the same reason.
      await page.getByLabel("Mês").fill("2001-01");
      await expect(page).toHaveURL(/[?&]mes=2001-01/);
      await expect(page.getByText(NO_CLINIC)).toBeVisible();
      await expect(page.getByText(EMPTY_MONTH)).toHaveCount(0);
    });
  });
}
