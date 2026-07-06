/**
 * appointment-hard-delete.spec.ts — Password-gated appointment hard delete +
 * password change (W3-06). Runs as admin (default storageState). Self-contained:
 * sets its own delete password and restores the 1234 default at the end, so the
 * shared seed DB is left as other tests expect (workers: 1 → serial).
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

async function setDeletePassword(page: import("@playwright/test").Page, value: string) {
  await page.goto("/admin/settings");
  await page.getByLabel(/Palavra-passe de eliminação/i).fill(value);
  await page.getByRole("button", { name: "Atualizar palavra-passe" }).click();
  await page.waitForURL(/admin\/settings/);
}

test("password-gated hard delete: wrong password refused, correct deletes (W3-06)", async ({
  page,
}) => {
  // 1. Set a known delete password via Administração (hashed server-side).
  await setDeletePassword(page, "4321");

  // 2. Book a fresh appointment (no clinical notes → deletable).
  const date = futureDate(RUN_DAY_BASE + 18);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "11:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // 3. Open it; attempt delete with the WRONG password → refused, still present.
  await page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) }).click();
  const edit = page.getByRole("dialog", { name: /marca/i }).first();
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: "Eliminar marcação" }).click();

  const del = page.getByRole("dialog", { name: /Eliminar marcação/i });
  await expect(del).toBeVisible();
  await del.getByLabel(/Palavra-passe/i).fill("0000");
  await del.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(del.getByText(/Palavra-passe incorreta/i)).toBeVisible();

  // 4. Correct password → permanently deleted; gone from the agenda.
  await del.getByLabel(/Palavra-passe/i).fill("4321");
  await del.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) })).toHaveCount(0, {
    timeout: 12_000,
  });

  // 5. Restore the 1234 default for other runs.
  await setDeletePassword(page, "1234");
});
