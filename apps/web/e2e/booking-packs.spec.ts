/**
 * booking-packs.spec.ts — W8-01c. Books a pack for a disposable test patient and
 * exercises the full loop: registration (fresh instance + consume session 1),
 * decrement (subsequent booking + the remaining-count banner), surfacing on the
 * patient profile, and the staff manual consume/restore adjust. Runs as admin.
 *
 * Never touches the real Maria João Silva; uses the synthetic seed patient
 * PATIENTS.ana. Each run creates a UNIQUE pack, so its instance is isolated from
 * prior runs (deterministic under re-runs / parallel days).
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, SERVICE, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

test("book a pack: register + decrement + surfacing + manual adjust (W8-01c)", async ({
  page,
}) => {
  // 1. Create a fresh 10-session pack on Osteopatia, offered at all locations.
  await page.goto("/admin/services");
  const packName = `E2E Pacote C ${Date.now()}`;
  const addPack = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Adicionar pacote" }) });
  await addPack.locator('input[name="name"]').fill(packName);
  await addPack.locator('select[name="baseServiceId"]').selectOption({ label: SERVICE.name });
  await addPack.locator('input[name="sessionCount"]').fill("10");
  await addPack.locator('input[name="price"]').fill("390.00");
  // locationId select defaults to "Todos os locais" (all locations).
  await Promise.all([
    page.waitForURL(/mp=ok/),
    addPack.getByRole("button", { name: "Adicionar pacote" }).click(),
  ]);

  // 2. Book the pack (registration): no active instance → banner shows "Novo pacote".
  const date1 = futureDate(RUN_DAY_BASE + 41);
  let dialog = await openNewAppointment(page, date1);
  await fillAppointment(dialog, {
    patient: PATIENTS.ana.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: date1,
    time: "10:00",
  });
  await dialog.getByLabel("Pacote", { exact: true }).selectOption({ label: packName });
  await expect(dialog.getByText(/Novo pacote/i)).toBeVisible();
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // 3. Book the pack AGAIN (decrement): now an active instance exists → the
  //    banner shows the remaining count (9/10) before saving.
  const date2 = futureDate(RUN_DAY_BASE + 42);
  dialog = await openNewAppointment(page, date2);
  await fillAppointment(dialog, {
    patient: PATIENTS.ana.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: date2,
    time: "11:00",
  });
  await dialog.getByLabel("Pacote", { exact: true }).selectOption({ label: packName });
  await expect(dialog.getByText(/Sessões restantes: 9\/10/i)).toBeVisible();
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // 4. Surfacing: the patient profile shows the pack at 8/10 after two bookings.
  await page.goto(`/patients/${PATIENTS.ana.id}?tab=consultas`);
  const packRow = page.locator("li").filter({ hasText: packName }).first();
  await expect(packRow).toBeVisible();
  await expect(packRow.getByText(/8\/10/)).toBeVisible();

  // 5. Manual RESTORE (reversing an under-24h no-show) → 9/10.
  await packRow.getByRole("button", { name: "Restaurar" }).click();
  await expect(packRow.getByText(/9\/10/)).toBeVisible();

  // 6. Manual CONSUME → 8/10.
  await packRow.getByRole("button", { name: "Consumir" }).click();
  await expect(packRow.getByText(/8\/10/)).toBeVisible();
});
