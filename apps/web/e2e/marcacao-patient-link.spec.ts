/**
 * marcacao-patient-link.spec.ts — W5-22. From the Agenda marcação EDIT view, the
 * "Ficha do paciente" button navigates (read-only) to the patient profile; a
 * second link renders only when a Paciente 2 is linked. Runs as admin.
 *
 * Determinism: each test books on its own future day, banded far away on retry
 * so a re-run books a fresh empty day instead of colliding with prior rows
 * (same pattern as marcacoes-tab-edit.spec.ts).
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

/** Opens the EDIT drawer for the appointment that renders under `patientName`. */
async function openEditDrawer(page: Page, patientName: string) {
  await page.getByRole("button", { name: new RegExp(patientName) }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible({ timeout: 8_000 });
  return drawer;
}

test("marcação edit view: 'Ficha do paciente' navigates to the primary profile; no second link without Paciente 2 (W5-22)", async ({
  page,
}, testInfo) => {
  const date = bandDay(45, testInfo.retry);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "09:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  const drawer = await openEditDrawer(page, PATIENTS.maria.name);
  // No Paciente 2 → no second link.
  await expect(drawer.getByRole("button", { name: "Ficha do paciente 2", exact: true })).toHaveCount(0);
  // Primary link lands on Maria's profile.
  await drawer.getByRole("button", { name: "Ficha do paciente", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${PATIENTS.maria.id}`), { timeout: 12_000 });
});

test("marcação edit view: a second 'Ficha do paciente 2' link navigates to the secondary profile (W5-22)", async ({
  page,
}, testInfo) => {
  const date = bandDay(46, testInfo.retry);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "10:00",
  });
  // Expand the create-only "Participantes secundários" disclosure and link João
  // as Paciente 2 (the inner controls mount only once the details are open).
  await dialog.getByText("Participantes secundários (opcional)").click();
  const patientTwo = dialog.getByLabel("Paciente 2", { exact: true });
  await patientTwo.click();
  await patientTwo.fill(PATIENTS.joao.name);
  await dialog.getByRole("option", { name: PATIENTS.joao.name }).click();
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  const drawer = await openEditDrawer(page, PATIENTS.maria.name);
  // The second link renders and lands on João's profile.
  const secondLink = drawer.getByRole("button", { name: "Ficha do paciente 2", exact: true });
  await expect(secondLink).toBeVisible();
  await secondLink.click();
  await expect(page).toHaveURL(new RegExp(`/patients/${PATIENTS.joao.id}`), { timeout: 12_000 });
});
