/**
 * notes-history-order.spec.ts — NOTES-03, on the screen.
 *
 * THE CLINIC'S REPORT (2026-09-11): a patient's note history reads shuffled - "an
 * edited old note jumps above newer ones". Reproduced on a lane before the fix:
 * an IN-PLACE edit moves nothing (created_at is never rewritten), but a SECOND
 * note written today on a March marcação rose above June's note, because the
 * history ordered by the note's creation instant. Production had 13 patients
 * whose history already read out of visit order that way.
 *
 * THE RULING: a note on a marcação sits at the MARCAÇÃO's date, newest first; a
 * patient-level note interleaves by its creation date; the last-edited time
 * orders nothing.
 *
 * The marcações are placed straight into the database (March and June 2026, in
 * the past), because the booking UI only books forward. The note that exposes the
 * defect is written THROUGH THE PRODUCT, exactly as reception writes it.
 */
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { serviceClient, therapistUserId } from "./helpers/confirm-code";
import { LOCATION, SERVICE, TENANT_A } from "./fixtures";

const uniq = () => Math.random().toString(36).slice(2, 8);

async function historyOrder(page: Page, patientId: string): Promise<string[]> {
  await page.goto(`/patients/${patientId}?tab=notas`);
  const items = page.locator("#tabpanel-notas li");
  await expect(items.first()).toBeVisible({ timeout: 15_000 });
  return (await items.allTextContents()).map((t) => (t.match(/\b(MARCO-HOJE|MARCO|ABRIL|JUNHO)\b/) ?? ["?"])[0]);
}

test("NOTES-03: the Notas history orders by the marcação date, and a note added to an old marcação stays there", async ({
  page,
}) => {
  const db = serviceClient();
  const therapist = await therapistUserId(db);
  const patientId = randomUUID();
  const { error: pErr } = await db
    .from("patients")
    .insert({ id: patientId, tenant_id: TENANT_A, full_name: `Historico ${uniq()}`, primary_location_id: LOCATION.id });
  expect(pErr).toBeNull();

  const appt = async (startsAt: string) => {
    const id = randomUUID();
    const { error } = await db.from("appointments").insert({
      id,
      tenant_id: TENANT_A,
      patient_id: patientId,
      practitioner_id: therapist,
      location_id: LOCATION.id,
      service_id: SERVICE.id,
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + 45 * 60_000).toISOString(),
      status: "completed",
    });
    expect(error).toBeNull();
    return id;
  };
  const march = await appt("2026-03-02T09:00:00.000Z");
  const june = await appt("2026-06-10T09:00:00.000Z");
  const { error: nErr } = await db.from("appointment_notes").insert([
    { tenant_id: TENANT_A, patient_id: patientId, appointment_id: march, author_user_id: therapist, body: "MARCO nota da visita", created_at: "2026-03-02T10:00:00.000Z" },
    { tenant_id: TENANT_A, patient_id: patientId, appointment_id: null, author_user_id: therapist, body: "ABRIL nota do paciente", created_at: "2026-04-01T10:00:00.000Z" },
    { tenant_id: TENANT_A, patient_id: patientId, appointment_id: june, author_user_id: therapist, body: "JUNHO nota da visita", created_at: "2026-06-10T10:00:00.000Z" },
  ]);
  expect(nErr).toBeNull();

  expect(await historyOrder(page, patientId)).toEqual(["JUNHO", "ABRIL", "MARCO"]);

  // Write a second note on the MARCH marcação, today, through its Notas board.
  await page.goto(`/patients/${patientId}?tab=consultas`);
  const openMarchNotes = page.getByRole("button", { name: /^Notas: 02\/03\/2026/ });
  const addButton = page.getByRole("button", { name: "Adicionar nota" });
  await expect(async () => {
    await openMarchNotes.click();
    await expect(addButton.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const composer = page.getByRole("textbox", { name: "Adicionar nota" });
  await expect(async () => {
    await addButton.first().click();
    await expect(composer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await composer.fill("MARCO-HOJE segunda nota");
  await addButton.last().click();
  await expect(page.getByText("MARCO-HOJE segunda nota").first()).toBeVisible({ timeout: 15_000 });

  // Before NOTES-03 this read MARCO-HOJE, JUNHO, ABRIL, MARCO.
  expect(await historyOrder(page, patientId)).toEqual(["JUNHO", "ABRIL", "MARCO-HOJE", "MARCO"]);
});
