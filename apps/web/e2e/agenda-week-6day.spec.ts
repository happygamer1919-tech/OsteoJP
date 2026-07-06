/**
 * agenda-week-6day.spec.ts — Agenda week view = 6 days incl. Saturday (W3-08).
 * Runs as admin. Also confirms a Saturday booking renders in its column. The
 * 24h time format is proven at the unit level (time.test.ts).
 */
import { test, expect } from "@playwright/test";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

test("agenda week view shows Mon–Sat (6 days) and a Saturday booking renders (W3-08)", async ({
  page,
}) => {
  const anchor = futureDate(RUN_DAY_BASE + 22);
  await page.goto(`/agenda?view=week&date=${anchor}`);
  await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();

  // 6-day week: Saturday column present, Sunday never shown.
  await expect(page.getByText(/^Sáb\s/).first()).toBeVisible();
  await expect(page.getByText(/^Dom\s/)).toHaveCount(0);

  // Book on the Saturday 10:00 slot (its aria-label starts "Sáb …"). The drawer
  // prefills that date+time; fill the rest and save.
  await page.getByRole("button", { name: /^Sáb .*10:00$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8_000 });

  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.joao.name);
  await dialog.getByRole("option", { name: PATIENTS.joao.name }).click();
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // The Saturday appointment renders in the week grid.
  await expect(page.getByRole("button", { name: new RegExp(PATIENTS.joao.name) })).toBeVisible({
    timeout: 8_000,
  });
});
