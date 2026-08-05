/**
 * working-hours.spec.ts — Horários, W12-40: the working-hours editor was folded
 * INTO Equipa. A member's weekly schedule is now edited inside their Gerir modal's
 * "Horários" section (weekday toggles, 24h TimeField, per-day location), saved by
 * a single Guardar reconciling through the W4-14 CRUD, with an in-section
 * no-password delete (toggle a day off → archived on save). Runs as admin. The
 * booking availability panel must reflect the reconciled hours.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillTime, expectTime } from "./helpers";
import { LOCATION_B, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

/** The member card for THERAPIST_NAME. */
function therapistCard(page: Page) {
  return page.locator('[data-testid="equipa-card"]').filter({ hasText: THERAPIST_NAME }).first();
}
/** The (single open) Gerir modal. */
function manageModal(page: Page) {
  return page.getByRole("dialog", { name: /Gerir/i });
}
/** Open THERAPIST_NAME's Gerir modal and switch to the Horários section. */
async function openHours(page: Page) {
  const modal = manageModal(page);
  if (!(await modal.isVisible())) {
    await therapistCard(page).getByRole("button", { name: "Gerir", exact: true }).click();
    await expect(modal).toBeVisible();
  }
  await modal.getByRole("radio", { name: "Horários", exact: true }).click();
  return modal;
}

test("Equipa/Horários: schedule saves 24h hours (booking panel reflects) + in-section delete (W12-40)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 20);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  await page.goto("/admin/staff");
  const modal = await openHours(page);

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
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });

  // The booking availability panel now reflects the reconciled working hours.
  const dialog = await openNewAppointment(page, date);
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  await expect(dialog.getByText("Horário:")).toBeVisible({ timeout: 8_000 });

  // In-section delete (NO password): toggle that day off + Guardar → archived, so
  // the booking panel no longer offers working hours that day.
  await page.goto("/admin/staff");
  const modal2 = await openHours(page);
  const row2 = modal2.locator("fieldset").filter({
    has: page.locator(`select[name="d${weekday}_location"]`),
  });
  const toggle2 = row2.locator(`input[name="d${weekday}_on"]`);
  if (await toggle2.isChecked()) await toggle2.uncheck();
  // No password field in the Horários section (admin-gated direct delete).
  await expect(modal2.locator('input[type="password"]')).toHaveCount(0);
  await modal2.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });

  const dialog2 = await openNewAppointment(page, date);
  await dialog2.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialog2.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  await expect(dialog2.getByText("Horário:")).toHaveCount(0);
});

test("Horários route redirects into Equipa; ?t=<id> deep link auto-opens the member's Horários section (W12-40)", async ({
  page,
}) => {
  // Bare route → the consolidated Equipa tab.
  await page.goto("/admin/working-hours");
  await expect(page).toHaveURL(/\/admin\/staff/);

  // Grab the therapist's id from their card (data-user-id test hook).
  const id = await therapistCard(page).getAttribute("data-user-id");
  expect(id).toBeTruthy();

  // Deep link ?t=<id> → /admin/staff?t=<id>, which auto-opens that member's Gerir
  // modal already switched to the Horários section.
  await page.goto(`/admin/working-hours?t=${id}`);
  await expect(page).toHaveURL(/\/admin\/staff\?t=/);
  const modal = manageModal(page);
  await expect(modal).toBeVisible({ timeout: 8_000 });
  await expect(modal.getByRole("radio", { name: "Horários", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("Equipa/Horários: a SPLIT SHIFT saves, survives a reload, and can be removed (W13-A)", async ({
  page,
}) => {
  // THE ONE TEST THIS FEATURE ACTUALLY NEEDED. The card's halt condition was
  // "the second row not persisting", and every layer between the form and the
  // table has its own unit test - but only a round trip proves the loader, the
  // reconcile and the write path agree with each other. Save-then-vanish is the
  // failure this feature can produce that looks like success once.
  const date = futureDate(RUN_DAY_BASE + 24);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  const dayRow = (scope: Awaited<ReturnType<typeof openHours>>) =>
    scope.locator("fieldset").filter({
      has: page.locator(`select[name="d${weekday}_location"]`),
    });

  await page.goto("/admin/staff");
  let modal = await openHours(page);
  let row = dayRow(modal);

  const worksToggle = row.locator(`input[name="d${weekday}_on"]`);
  if (!(await worksToggle.isChecked())) await worksToggle.check();
  await fillTime(row.locator("label").filter({ hasText: "Início" }), "08:00");
  await fillTime(row.locator("label").filter({ hasText: "Fim" }), "13:00");
  await row.locator(`select[name="d${weekday}_location"]`).selectOption({ label: LOCATION_B.name });

  // Add the afternoon. The fields are ABSENT until asked for, so this is the
  // affordance appearing rather than an empty row already on screen.
  await expect(row.locator(`input[name="d${weekday}p2_on"]`)).toHaveCount(0);
  await row.getByRole("button", { name: /2\.º período/ }).click();
  await expect(row.locator(`input[name="d${weekday}p2_on"]`)).toHaveCount(1);

  // The second period's own labels are inside the period-2 block.
  const p2 = row.locator("div").filter({ hasText: /^2\.º período/ }).last();
  await fillTime(p2.locator("label").filter({ hasText: "Início" }), "14:00");
  await fillTime(p2.locator("label").filter({ hasText: "Fim" }), "19:00");

  await modal.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });

  // RE-OPEN. This is the assertion the whole card rests on: the second row was
  // written AND the loader gives it back, instead of collapsing the day to its
  // first template and archiving the afternoon on the next save.
  await page.goto("/admin/staff");
  modal = await openHours(page);
  row = dayRow(modal);
  await expect(row.locator(`input[name="d${weekday}p2_on"]`)).toHaveCount(1);
  await expect(row.locator(`input[name="d${weekday}p2_id"]`)).not.toHaveValue("");
  await expectTime(row.locator("label").filter({ hasText: "Início" }).first(), "08:00");
  await expectTime(row.locator("label").filter({ hasText: "Fim" }).first(), "13:00");
  await expectTime(row.locator("label").filter({ hasText: "Início" }).last(), "14:00");
  await expectTime(row.locator("label").filter({ hasText: "Fim" }).last(), "19:00");

  // REMOVE it, and confirm it is gone rather than merely hidden. The id keeps
  // posting after removal precisely so the reconcile can archive the row.
  await row.getByRole("button", { name: /Remover 2\.º período/ }).click();
  await expect(row.locator(`input[name="d${weekday}p2_on"]`)).toHaveCount(0);
  await modal.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });

  await page.goto("/admin/staff");
  modal = await openHours(page);
  row = dayRow(modal);
  await expect(row.locator(`input[name="d${weekday}p2_on"]`)).toHaveCount(0);
  await expect(row.locator(`input[name="d${weekday}p2_id"]`)).toHaveValue("");
});
