/**
 * marcacoes-open-edit.spec.ts (W12-00, CB GRAVE) — the standalone /marcacoes list
 * can OPEN and EDIT a marcacao from a row, closing the defect where the list rows
 * were inert display cards with no open/edit path.
 *
 * This spec targets the /marcacoes ROUTE specifically (not the patient Consultas
 * tab). The pre-existing marcacoes-tab-edit.spec.ts covers /patients/{id}
 * ?tab=consultas and green-masked this gap, so a route-scoped proof is required.
 *
 * REUSE proof: the row opens the SAME AppointmentDrawer the agenda card opens; the
 * estado edit persists through the drawer's existing updateAppointment action. No
 * parallel edit path exists in app/marcacoes.
 *
 * Runs as admin (appointments:read + appointments:write). Determinism: it books a
 * REAL row on its own far-future day (the seed provisions no appointments) and
 * pins the /marcacoes window to exactly that day, so only this row is in view; the
 * per-retry 100-day band keeps a Playwright retry from colliding with the row its
 * previous attempt left behind.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

/** A future day unique per retry (100-day bands, same idiom as the tab-edit spec). */
function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

/** Books a one-off appointment for a patient via the agenda drawer (as admin). */
async function book(page: Page, patient: string, date: string, time: string) {
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time,
  });
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });
}

test("open + edit a marcacao from the /marcacoes list row (W12-00)", async ({ page }, testInfo) => {
  const date = bandDay(30, testInfo.retry);
  const time = "10:00";
  await book(page, PATIENTS.maria.name, date, time);

  // The /marcacoes window is pinned to the booked day so exactly one row shows.
  await page.goto(`/marcacoes?from=${date}&to=${date}`);

  // The row now exposes a real open control (was an inert card before W12-00).
  const openBtn = page.getByRole("button", {
    name: `Abrir marcação: ${PATIENTS.maria.name}`,
  });
  await expect(openBtn).toBeVisible();

  // OPEN PROOF: clicking it opens the shared AppointmentDrawer in edit mode
  // (the Estado field only renders when editing an existing appointment).
  await openBtn.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const estado = drawer.getByLabel("Estado", { exact: true });
  await expect(estado).toBeVisible();

  // EDIT PROOF: change estado scheduled -> confirmed and save through the drawer's
  // existing action (no /marcacoes-local edit path).
  await estado.selectOption({ label: "Confirmada" });
  await drawer.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(drawer).toBeHidden({ timeout: 12_000 });

  // PERSISTENCE (reload / DB read): reload the list, reopen the same row, and read
  // the persisted estado back off the drawer's select.
  await page.goto(`/marcacoes?from=${date}&to=${date}`);
  await page
    .getByRole("button", { name: `Abrir marcação: ${PATIENTS.maria.name}` })
    .click();
  const reopened = page.getByRole("dialog");
  await expect(reopened).toBeVisible();
  await expect(reopened.getByLabel("Estado", { exact: true })).toHaveValue("confirmed");
});
