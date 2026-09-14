/**
 * COMMS-01 (owner dispatch 2026-09-14), GATE BL-2 on the screen.
 *
 * A reminder the provider refused appears in Comunicações > Lembretes SMS with
 * its error code, reached from the sidebar the way reception would reach it.
 * A therapist gets no Lembretes SMS section and is sent away from its URL.
 *
 * THE ROW IS WRITTEN HERE, through the service-role client, and not by the
 * seed: seed-e2e.mjs is edited by other open branches, and a reminder_dispatches
 * row needs an appointment to hang from. The appointment is CANCELLED and in
 * 2021 so it can take part in no conflict check, no attendance window and no
 * spec's booking day. The write path itself (the dispatcher recording
 * provider_error with Twilio's code) is proven by reminder-log.db.test.ts.
 */
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { LOCATION, PATIENTS, STORAGE, TENANT_A, USERS } from "./fixtures";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const APPOINTMENT_ID = "00000000-0000-4000-8000-00000000c501";
const ERROR_CODE = "21211";

let db: SupabaseClient;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    skipReason = "no service-role key in this environment, so the ledger row cannot be written";
    return;
  }
  db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const therapist = await db
    .from("users")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("email", USERS.therapist)
    .single();
  if (therapist.error) throw new Error(`e2e therapist: ${therapist.error.message}`);

  // Idempotent on a persistent lane: remove a previous run's rows first.
  await db.from("appointments").delete().eq("id", APPOINTMENT_ID);
  const appt = await db.from("appointments").insert({
    id: APPOINTMENT_ID,
    tenant_id: TENANT_A,
    patient_id: PATIENTS.maria.id,
    practitioner_id: therapist.data.id,
    location_id: LOCATION.id,
    starts_at: "2021-02-10T10:00:00.000Z",
    ends_at: "2021-02-10T10:45:00.000Z",
    status: "cancelled",
  });
  if (appt.error) throw new Error(`appointment: ${appt.error.message}`);

  const row = await db.from("reminder_dispatches").insert({
    tenant_id: TENANT_A,
    appointment_id: APPOINTMENT_ID,
    channel: "sms",
    template_id: "reminder.24h.sms",
    outcome: "provider_error",
    provider_error_code: ERROR_CODE,
  });
  if (row.error) throw new Error(`reminder_dispatches: ${row.error.message}`);
});

test.afterAll(async () => {
  // The ledger row goes with it: reminder_dispatches.appointment_id is ON DELETE CASCADE.
  if (db) await db.from("appointments").delete().eq("id", APPOINTMENT_ID);
});

test.describe("reception", () => {
  test.use({ storageState: STORAGE.reception });

  test("a provider refusal is on Lembretes SMS with its error code, reached from the sidebar", async ({ page }) => {
    test.skip(skipReason !== null, skipReason ?? "");

    await page.goto("/dashboard");
    await page.getByRole("navigation").getByRole("link", { name: "Comunicações" }).click();
    await expect(page).toHaveURL(/\/recuperacao/);

    const sections = page.getByRole("navigation", { name: "Secções de Comunicações" });
    await sections.getByRole("link", { name: "Lembretes SMS" }).click();
    await expect(page).toHaveURL(/\/comunicacoes\/lembretes-sms/);
    await expect(page.getByRole("heading", { name: "Lembretes SMS" })).toBeVisible();

    await page.getByRole("link", { name: "Só falhas" }).click();
    await expect(page).toHaveURL(/falhas=1/);

    // BY THE ROW'S OWN CONTENT: the patient AND the code in one row, so a code
    // printed on some other row cannot satisfy it.
    const row = page.getByRole("row").filter({ hasText: PATIENTS.maria.name }).filter({ hasText: ERROR_CODE });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Falhou no fornecedor");
    await expect(row).toContainText("Lembrete 24 h");
  });
});

test.describe("therapist", () => {
  test.use({ storageState: STORAGE.therapist });

  test("a therapist has no Lembretes SMS section and is sent away from its URL", async ({ page }) => {
    await page.goto("/recuperacao");
    await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lembretes SMS" })).toHaveCount(0);

    await page.goto("/comunicacoes/lembretes-sms");
    await expect(page).not.toHaveURL(/\/comunicacoes\/lembretes-sms/);
    await expect(page.getByText(ERROR_CODE)).toHaveCount(0);
  });
});
