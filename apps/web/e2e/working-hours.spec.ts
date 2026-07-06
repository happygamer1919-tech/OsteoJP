/**
 * working-hours.spec.ts — Availability template CRUD in Administração (W2-12).
 * Runs as admin (default storageState). Creating a template must make the
 * therapist's working hours appear in the booking availability panel.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillTime } from "./helpers";
import { LOCATION_B, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

test("working-hours: create shows in the booking panel; end<=start and overlap rejected (W2-12)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 20);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const otherWeekday = weekday === 6 ? 0 : weekday + 1;

  await page.goto("/admin/working-hours");

  // Clean slate: archive any E2E Therapist rows left by another browser project
  // or a prior retry (the seed DB is shared), so create/overlap are deterministic.
  for (let i = 0; i < 12; i++) {
    const rows = page.locator("tbody tr").filter({ hasText: THERAPIST_NAME });
    if ((await rows.count()) === 0) break;
    await rows.first().getByRole("button", { name: "Arquivar" }).click();
    await page.waitForURL(/working-hours/);
  }

  const createForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Adicionar" }) });

  async function create(wd: number, start: string, end: string): Promise<void> {
    await createForm.getByLabel("Terapeuta").selectOption({ label: THERAPIST_NAME });
    await createForm.getByLabel("Dia").selectOption(String(wd));
    await fillTime(createForm.locator("label").filter({ hasText: "Início" }), start);
    await fillTime(createForm.locator("label").filter({ hasText: "Fim" }), end);
    await createForm.getByLabel("Local").selectOption({ label: LOCATION_B.name });
    await createForm.getByRole("button", { name: "Adicionar" }).click();
  }

  // Location dropdown offers the active location.
  await expect(createForm.getByLabel("Local").locator("option", { hasText: LOCATION_B.name })).toHaveCount(1);

  // Create a valid template → saved + listed.
  await create(weekday, "09:00", "17:00");
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("cell", { name: THERAPIST_NAME }).first()).toBeVisible();

  // Validation: end <= start rejected.
  await create(otherWeekday, "12:00", "11:00");
  await expect(page.getByText(/Não foi possível guardar/i)).toBeVisible({ timeout: 8_000 });

  // Validation: overlapping template (same therapist/weekday/location) rejected.
  await create(weekday, "10:00", "11:00");
  await expect(page.getByText(/Não foi possível guardar/i)).toBeVisible({ timeout: 8_000 });

  // The booking availability panel now reflects the created working hours.
  const dialog = await openNewAppointment(page, date);
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  // "Horário:" renders only when the therapist has working hours that day.
  await expect(dialog.getByText("Horário:")).toBeVisible({ timeout: 8_000 });
});
