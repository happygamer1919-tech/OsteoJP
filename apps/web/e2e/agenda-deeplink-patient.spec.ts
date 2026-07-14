/**
 * agenda-deeplink-patient.spec.ts - W6-03. "Nova marcação" on a patient profile
 * deep-links into the Agenda with the create drawer OPEN and THAT patient
 * preselected + LOCKED; the user picks only therapist + date/time. Runs as admin.
 *
 * Determinism: books on its own future day, banded far away on retry so a re-run
 * books a fresh empty day (same pattern as marcacoes-tab-edit.spec.ts).
 */
import { test, expect, type Locator } from "@playwright/test";
import { fillTime } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

/** Fill the non-patient required fields (the patient is locked in the deep-link flow). */
async function fillNonPatient(
  dialog: Locator,
  opts: { therapist: string; location: string; date: string; time: string },
) {
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: opts.therapist });
  await dialog.getByLabel(/Localização/i).selectOption({ label: opts.location });
  await dialog.locator('input[type="date"]').fill(opts.date);
  await fillTime(dialog, opts.time);
}

test("deep-link: Nova marcação on a patient profile opens Agenda with that patient locked, param cleared, and books for the source patient", async ({
  page,
}, testInfo) => {
  const date = bandDay(48, testInfo.retry);

  // From the patient profile, click "Nova marcação".
  await page.goto(`/patients/${PATIENTS.maria.id}`);
  await page.getByRole("link", { name: /Nova marca/i }).click();

  // Landed in Agenda with the create drawer already open.
  await expect(page).toHaveURL(/\/agenda/, { timeout: 12_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8_000 });

  // The source patient is preselected and shown read-only (locked); there is NO
  // editable patient search combobox to change it.
  await expect(dialog.locator('[aria-readonly="true"]')).toContainText(PATIENTS.maria.name);
  await expect(dialog.getByRole("combobox", { name: /Paciente/i })).toHaveCount(0);

  // Param cleared after open (a refresh/back must not re-trigger the autopen).
  await expect(page).toHaveURL(/^(?!.*novaMarcacaoPaciente).*$/);

  // The user completes only therapist + date/time, then saves.
  await fillNonPatient(dialog, {
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "09:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Correct-patient proof: the booked row on that day renders under Maria's name.
  await page.goto(`/agenda?view=day&date=${date}`);
  await expect(page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible({
    timeout: 12_000,
  });
});

test("no-regression: a normal Agenda create (no deep-link) opens with an empty, editable patient combobox", async ({
  page,
}, testInfo) => {
  const date = bandDay(49, testInfo.retry);
  await page.goto(`/agenda?view=day&date=${date}`);
  await page.getByRole("button", { name: /Nova Marcação/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8_000 });

  // Editable patient combobox present (not a locked read-only field).
  await expect(dialog.getByRole("combobox", { name: /Paciente/i })).toBeVisible();
  await expect(dialog.locator('[aria-readonly="true"]')).toHaveCount(0);
});
