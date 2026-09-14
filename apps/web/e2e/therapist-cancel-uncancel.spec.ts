/**
 * therapist-cancel-uncancel.spec.ts - SCHED-30, owner dispatch 2026-09-14 (BL-3).
 *
 * A therapist may set Cancelada, and may bring an appointment back out of it,
 * where they are Terapeuta or Terapeuta 2 and at one of their clinics. Before
 * SCHED-30 both moves were refused with "Não tem permissão para esta ação.":
 * cancelAppointment asked for appointments:delete, and SCHED-27's un-cancel asked
 * for it again. That sentence is what the owner's screenshot from Isaac shows,
 * on a Cancelada portal booking.
 *
 * WHAT IT PROVES, through the agenda drawer a therapist works in:
 *   1. Isaac's case: the therapist's own Cancelada PORTAL booking is brought back
 *      to Pendente. On main this test is red with the forbidden sentence named in
 *      the failure.
 *   2. BL-3a: the therapist cancels their own appointment, then brings it back.
 *   3. BL-3b: bringing one back into a slot taken since the cancel is REFUSED,
 *      with no "Guardar mesmo assim", and nothing is written. On main it is red
 *      too, because the refusal on screen is the permission one.
 * BL-3c (a therapist still cannot touch a row they are not on, including a NESA
 * row their RLS lets them see) is proven against a real database in
 * lib/scheduling/therapist-cancel.db.test.ts, where RLS and the app check both
 * run for real.
 *
 * FIXTURES are written with the service client, at random ids, and deleted
 * after the file. Day RUN_DAY_BASE + 68 belongs to this spec alone.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import { LOCATION, PATIENTS, RUN_DAY_BASE, SERVICE, STORAGE, TENANT_A, futureDate } from "./fixtures";
import { serviceClient, therapistUserId } from "./helpers/confirm-code";

test.use({ storageState: STORAGE.therapist });
test.describe.configure({ mode: "serial" });

let db: SupabaseClient;
let therapistId = "";
const written: string[] = [];

test.beforeAll(async () => {
  db = serviceClient();
  therapistId = await therapistUserId(db);
});

test.afterAll(async () => {
  if (db && written.length > 0) await db.from("appointments").delete().in("id", written);
});

async function insertRow(args: {
  day: string;
  time: string;
  status: "scheduled" | "cancelled";
  origin?: "staff" | "patient_portal";
  patientId?: string;
}): Promise<string> {
  const id = randomUUID();
  const startsAt = lisbonDateTimeToUtc(args.day, args.time);
  const { error } = await db.from("appointments").insert({
    id,
    tenant_id: TENANT_A,
    patient_id: args.patientId ?? PATIENTS.maria.id,
    practitioner_id: therapistId,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
    status: args.status,
    // A Reserva online booking has no staff author, so created_by stays NULL.
    origin: args.origin ?? "staff",
  });
  if (error) throw new Error(`fixture appointment insert failed: ${error.message}`);
  written.push(id);
  return id;
}

async function statusOf(id: string): Promise<string> {
  const { data, error } = await db.from("appointments").select("status").eq("id", id).single();
  if (error) throw new Error(`status read failed: ${error.message}`);
  return (data as { status: string }).status;
}

/** Opens THAT appointment, by id, in the agenda drawer. */
async function openCard(page: Page, day: string, id: string): Promise<Locator> {
  await page.goto(`/agenda?view=day&date=${day}`);
  const card = page.locator(`[data-appointment-id="${id}"]`);
  await expect(card, "the therapist's own appointment is not on their agenda").toHaveCount(1, {
    timeout: 15_000,
  });
  await card.click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await expect(edit.getByTestId("drawer-appointment-id")).toHaveText(id);
  return edit;
}

async function setEstadoAndSave(edit: Locator, label: string): Promise<void> {
  await edit.getByLabel(/^Estado/i).selectOption({ label });
  // Exactly "Guardar", never "Guardar mesmo assim".
  await edit.getByRole("button", { name: /^Guardar$/ }).click();
}

/**
 * The save went through: the drawer closed. A refusal keeps it open with a
 * sentence in its alert, and the failure message carries that sentence, so a red
 * run says WHICH refusal it met instead of "still visible".
 */
async function expectSaved(edit: Locator): Promise<void> {
  const refusal = edit.locator('p[role="alert"]');
  await expect(async () => {
    if ((await refusal.count()) > 0) {
      throw new Error(`the save was refused on screen: ${await refusal.first().innerText()}`);
    }
    await expect(edit).toBeHidden({ timeout: 500 });
  }).toPass({ timeout: 12_000 });
}

test("Isaac's case: a therapist brings their own Cancelada portal booking back (SCHED-30)", async ({
  page,
}, testInfo) => {
  const day = futureDate(RUN_DAY_BASE + 68 + testInfo.retry * 100);
  const id = await insertRow({ day, time: "09:00", status: "cancelled", origin: "patient_portal" });

  const edit = await openCard(page, day, id);
  await setEstadoAndSave(edit, "Pendente");
  await expectSaved(edit);
  expect(await statusOf(id)).toBe("scheduled");
});

test("BL-3a: a therapist cancels their own appointment and brings it back", async ({ page }, testInfo) => {
  const day = futureDate(RUN_DAY_BASE + 68 + testInfo.retry * 100);
  const id = await insertRow({ day, time: "11:00", status: "scheduled" });

  const first = await openCard(page, day, id);
  await setEstadoAndSave(first, "Cancelada");
  await expectSaved(first);
  expect(await statusOf(id)).toBe("cancelled");

  const second = await openCard(page, day, id);
  await setEstadoAndSave(second, "Pendente");
  await expectSaved(second);
  expect(await statusOf(id)).toBe("scheduled");
});

test("BL-3b: bringing one back into a slot taken since is refused, with no override", async ({
  page,
}, testInfo) => {
  const day = futureDate(RUN_DAY_BASE + 68 + testInfo.retry * 100);
  const cancelled = await insertRow({ day, time: "14:00", status: "cancelled" });
  // Booked AFTER the cancel, into the hour it released, for the same therapist.
  const since = await insertRow({ day, time: "14:00", status: "scheduled", patientId: PATIENTS.joao.id });

  const edit = await openCard(page, day, cancelled);
  await setEstadoAndSave(edit, "Pendente");

  await expect(edit.locator('p[role="alert"]')).toContainText(/ocupado depois do cancelamento/i, {
    timeout: 12_000,
  });
  // A therapist is offered no way past it: the server ignores the override for
  // them, so a "Guardar mesmo assim" here would be a button that cannot succeed.
  await expect(edit.getByRole("button", { name: /mesmo assim/i })).toHaveCount(0);
  expect(await statusOf(cancelled)).toBe("cancelled");
  expect(await statusOf(since)).toBe("scheduled");
});
