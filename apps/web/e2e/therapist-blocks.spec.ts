/**
 * therapist-blocks.spec.ts — W5-12 therapist availability blocks (Bloquear
 * horário). Runs as admin (settings:manage). Migration-free: both modes write a
 * `time_off` row (0006). Proves the loop's Definition of Done end to end:
 *
 *  1. Both modes create a block (Bloqueio pontual = date + hour range; Ausência
 *     prolongada = date range), both listed in the Bloqueios modal.
 *  2. A pontual block is EXCLUDED from the availability panel (the blocked free
 *     slot chip disappears) — the same getTherapistAvailability the batch/Agendar
 *     lote engine consumes.
 *  3. A block overlapping an existing appointment surfaces a WARNING and the
 *     appointment SURVIVES (never auto-cancelled — Q-W5-4).
 *
 * Determinism: derives its day from RUN_DAY_BASE (the seed creates no
 * appointments), sets the therapist's hours through the UI first, and cleans up
 * every block it creates so re-runs never accrue state.
 *
 * Strict-mode: the card renders TWO dialogs per therapist — "Horário de …"
 * (schedule) and "Bloqueios de …" (blocks). Every dialog locator here is scoped
 * to the blocks modal by its exact accessible name so the two never collide.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment, fillTime } from "./helpers";
import { LOCATION_B, THERAPIST_NAME, futureDate, RUN_DAY_BASE, PATIENTS } from "./fixtures";

const SAVE = "Guardar";

/** The blocks modal for the E2E therapist, scoped by its exact accessible name. */
function blocksModal(page: Page) {
  return page.getByRole("dialog", { name: new RegExp(`Bloqueios de ${THERAPIST_NAME}`) });
}

/** The therapist's card on /admin/working-hours. */
function therapistCard(page: Page) {
  return page.locator("section.glass-card").filter({ hasText: THERAPIST_NAME }).first();
}

/** Set the E2E therapist to 09:00-13:00 at LOCATION_B on `weekday`, via the
 *  schedule modal, so the availability panel has a working window to block. */
async function setWorkingHours(page: Page, weekday: number) {
  await page.goto("/admin/working-hours");
  const card = therapistCard(page);
  await card.getByTestId("edit-schedule").click();
  const modal = page.getByRole("dialog", { name: new RegExp(`Horário de ${THERAPIST_NAME}`) });
  await expect(modal).toBeVisible();
  const row = modal.locator("fieldset").filter({
    has: page.locator(`select[name="d${weekday}_location"]`),
  });
  const worksToggle = row.locator(`input[name="d${weekday}_on"]`);
  if (!(await worksToggle.isChecked())) await worksToggle.check();
  await fillTime(row.locator("label").filter({ hasText: "Início" }), "09:00");
  await fillTime(row.locator("label").filter({ hasText: "Fim" }), "13:00");
  await row.locator(`select[name="d${weekday}_location"]`).selectOption({ label: LOCATION_B.name });
  await modal.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/working-hours/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });
}

/** Delete every block currently shown for the therapist (leave a clean slate). */
async function clearBlocks(page: Page) {
  await page.goto("/admin/working-hours");
  const card = therapistCard(page);
  await card.getByTestId("open-blocks").click();
  const modal = blocksModal(page);
  await expect(modal).toBeVisible();
  // Each delete redirects + revalidates; re-open and repeat until the list empties.
  for (let guard = 0; guard < 12; guard++) {
    const list = modal.getByTestId("blocks-list");
    if ((await list.count()) === 0) break;
    const firstRemove = list.getByRole("button", { name: "Eliminar" }).first();
    if ((await firstRemove.count()) === 0) break;
    await firstRemove.click();
    await page.waitForURL(/working-hours/);
    await therapistCard(page).getByTestId("open-blocks").click();
    await expect(blocksModal(page)).toBeVisible();
  }
}

test("W5-12: both modes create time_off blocks; pontual excluded from availability; overlap warns not cancels", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 24);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  // Clean any residue from a previous run, then give the therapist working hours.
  await clearBlocks(page);
  await setWorkingHours(page, weekday);

  // --- Baseline: the 09:00 free-slot chip is offered before any block. ---
  const dialogBefore = await openNewAppointment(page, date);
  await dialogBefore.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialogBefore.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  const slotsBefore = dialogBefore.getByRole("radiogroup", { name: "Horários livres" });
  await expect(slotsBefore.getByRole("radio", { name: "09:00" })).toBeVisible({ timeout: 8_000 });

  // --- Book a 09:00 appointment so a later block overlaps a real appointment. ---
  const dialogBook = await openNewAppointment(page, date);
  await fillAppointment(dialogBook, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION_B.name,
    date,
    time: "09:00",
  });
  await dialogBook.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/agenda/);

  // --- Create an Ausência prolongada (date range) — a time_off row, reason vacation. ---
  await page.goto("/admin/working-hours");
  await therapistCard(page).getByTestId("open-blocks").click();
  let modal = blocksModal(page);
  await expect(modal).toBeVisible();
  await modal.getByLabel("Tipo").selectOption("prolongada");
  await modal.getByLabel("De").fill(futureDate(RUN_DAY_BASE + 40));
  await modal.getByLabel("Até").fill(futureDate(RUN_DAY_BASE + 42));
  await modal.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/working-hours/);

  // --- Create a Bloqueio pontual (date + hour range) OVER the booked 09:00 slot. ---
  await therapistCard(page).getByTestId("open-blocks").click();
  modal = blocksModal(page);
  await expect(modal).toBeVisible();
  await modal.getByLabel("Tipo").selectOption("pontual");
  await modal.getByLabel("Data").fill(date);
  await modal.getByLabel("Início").fill("09:00");
  await modal.getByLabel("Fim").fill("13:00");
  await modal.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/working-hours/);

  // WARNING shown (block overlaps the existing 09:00 appointment), NOT cancelled.
  await expect(page.getByTestId("wh-banner")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("wh-banner")).toContainText(/não foram canceladas/i);

  // Both blocks are listed in the modal (pontual + prolongada).
  await therapistCard(page).getByTestId("open-blocks").click();
  modal = blocksModal(page);
  await expect(modal).toBeVisible();
  const list = modal.getByTestId("blocks-list");
  await expect(list.getByText("Bloqueio pontual")).toHaveCount(1);
  await expect(list.getByText("Ausência prolongada")).toHaveCount(1);
  await page.keyboard.press("Escape");

  // --- Exclusion: the 09:00 free-slot chip is now GONE from the availability panel. ---
  const dialogAfter = await openNewAppointment(page, date);
  await dialogAfter.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialogAfter.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  // The whole working window is blocked, so there are no free slots that day.
  await expect(dialogAfter.getByText("Sem horários livres neste dia.")).toBeVisible({ timeout: 8_000 });

  // --- The overlapped appointment SURVIVES (still on the agenda that day). ---
  await page.goto(`/agenda?view=day&date=${date}`);
  await expect(page.getByText(PATIENTS.maria.name).first()).toBeVisible({ timeout: 8_000 });

  // Cleanup: remove the blocks this test created.
  await clearBlocks(page);
});
