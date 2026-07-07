/**
 * working-hours.spec.ts — Horários admin, W4-14 redesign: per-therapist cards +
 * Editar horário top-layer modal (weekday toggles, 24h TimeField, per-day
 * location), a single Guardar reconciling through the W2-12 CRUD, and an
 * in-modal no-password delete (toggle a day off → archived on save). Runs as
 * admin (default storageState). The booking availability panel must reflect the
 * reconciled hours.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillTime } from "./helpers";
import { LOCATION_B, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

test("Horários: card modal saves 24h hours (booking panel reflects) + in-modal delete (W4-14)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 20);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  await page.goto("/admin/working-hours");

  // The therapist's card + its Editar horário modal (top layer).
  const card = page.locator("section.glass-card").filter({ hasText: THERAPIST_NAME }).first();
  await expect(card).toBeVisible();
  await card.getByTestId("edit-schedule").click();
  const modal = page.getByRole("dialog", { name: new RegExp(THERAPIST_NAME) });
  await expect(modal).toBeVisible();

  // The weekday row for `date` — scoped by its per-day location select.
  const row = modal.locator("fieldset").filter({
    has: page.locator(`select[name="d${weekday}_location"]`),
  });
  const worksToggle = row.locator(`input[name="d${weekday}_on"]`);
  if (!(await worksToggle.isChecked())) await worksToggle.check();
  await fillTime(row.locator("label").filter({ hasText: "Início" }), "09:00");
  await fillTime(row.locator("label").filter({ hasText: "Fim" }), "17:00");
  await row.locator(`select[name="d${weekday}_location"]`).selectOption({ label: LOCATION_B.name });

  await modal.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/working-hours/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });

  // The booking availability panel now reflects the reconciled working hours.
  const dialog = await openNewAppointment(page, date);
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  await expect(dialog.getByText("Horário:")).toBeVisible({ timeout: 8_000 });

  // In-modal delete (NO password): toggle that day off + Guardar → archived, so
  // the booking panel no longer offers working hours that day.
  await page.goto("/admin/working-hours");
  const card2 = page.locator("section.glass-card").filter({ hasText: THERAPIST_NAME }).first();
  await card2.getByTestId("edit-schedule").click();
  const modal2 = page.getByRole("dialog", { name: new RegExp(THERAPIST_NAME) });
  await expect(modal2).toBeVisible();
  const row2 = modal2.locator("fieldset").filter({
    has: page.locator(`select[name="d${weekday}_location"]`),
  });
  const toggle2 = row2.locator(`input[name="d${weekday}_on"]`);
  if (await toggle2.isChecked()) await toggle2.uncheck();
  // No password field anywhere in the modal (admin-gated direct delete).
  await expect(modal2.locator('input[type="password"]')).toHaveCount(0);
  await modal2.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/working-hours/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });

  const dialog2 = await openNewAppointment(page, date);
  await dialog2.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialog2.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  await expect(dialog2.getByText("Horário:")).toHaveCount(0);
});

test("Horários: deep link from Equipa focuses the therapist and opens the modal (W4-14)", async ({
  page,
}) => {
  // The Equipa row's Horários link deep-links to /admin/working-hours?t=<id>.
  await page.goto("/admin/staff");
  const row = page.locator("tbody tr").filter({ hasText: THERAPIST_NAME });
  const href = await row.getByRole("link", { name: "Horários" }).getAttribute("href");
  expect(href).toMatch(/\/admin\/working-hours\?t=/);

  await page.goto(href!);
  // Focused on that therapist (scoped view) and the modal auto-opens.
  await expect(page.getByText(THERAPIST_NAME).first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: new RegExp(THERAPIST_NAME) })).toBeVisible({
    timeout: 8_000,
  });
});
