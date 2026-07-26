/**
 * therapist-blocks.spec.ts — W5-12 therapist availability blocks (Bloquear
 * horário), re-pointed to the W12-40 consolidated Equipa surface. The blocks
 * editor is now opened from inside a member's Gerir modal → Horários section (the
 * "Bloquear horário" button), stacking the "Bloqueios de …" dialog above the
 * manage modal. Runs as admin. Migration-free: both modes write a `time_off` row
 * (0006). Proves the loop's Definition of Done end to end:
 *
 *  1. Both modes create a block (pontual = date + hour range; prolongada = date
 *     range), both listed in the Bloqueios modal.
 *  2. A pontual block is EXCLUDED from the availability panel.
 *  3. A block overlapping an existing appointment surfaces a WARNING and the
 *     appointment SURVIVES (never auto-cancelled — Q-W5-4).
 *
 * Determinism: derives its day from RUN_DAY_BASE, sets the therapist's hours
 * through the UI first, and cleans up every block it creates so re-runs never
 * accrue state.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment, fillTime } from "./helpers";
import { LOCATION_B, THERAPIST_NAME, futureDate, RUN_DAY_BASE, PATIENTS } from "./fixtures";

const SAVE = "Guardar";

/** The member card for THERAPIST_NAME. */
function therapistCard(page: Page) {
  return page.locator('[data-testid="equipa-card"]').filter({ hasText: THERAPIST_NAME }).first();
}
/** The (single open) Gerir modal. */
function manageModal(page: Page) {
  return page.getByRole("dialog", { name: /Gerir/i });
}
/** The blocks modal for the E2E therapist, scoped by its exact accessible name. */
function blocksModal(page: Page) {
  return page.getByRole("dialog", { name: new RegExp(`Bloqueios de ${THERAPIST_NAME}`) });
}

/** Open THERAPIST_NAME's Gerir modal, switched to the Horários section. */
async function openManageHours(page: Page) {
  const modal = manageModal(page);
  if (!(await modal.isVisible())) {
    await therapistCard(page).getByRole("button", { name: "Gerir", exact: true }).click();
    await expect(modal).toBeVisible();
  }
  await modal.getByRole("radio", { name: "Horários", exact: true }).click();
  return modal;
}

/**
 * Open the Bloqueios modal: ensure the manage modal is open on the Horários
 * section, then click its "Bloquear horário" trigger. The blocks dialog stacks in
 * the top layer above the manage modal.
 */
async function openBlocks(page: Page) {
  const manage = await openManageHours(page);
  await manage.getByTestId("open-blocks").click();
  await expect(blocksModal(page)).toBeVisible();
}

/** Set the E2E therapist to 09:00-13:00 at LOCATION_B on `weekday`, via the Gerir
 *  modal's Horários section, so the availability panel has a window to block. */
async function setWorkingHours(page: Page, weekday: number) {
  await page.goto("/admin/staff");
  const modal = await openManageHours(page);
  const row = modal.locator("fieldset").filter({
    has: page.locator(`select[name="d${weekday}_location"]`),
  });
  const worksToggle = row.locator(`input[name="d${weekday}_on"]`);
  if (!(await worksToggle.isChecked())) await worksToggle.check();
  await fillTime(row.locator("label").filter({ hasText: "Início" }), "09:00");
  await fillTime(row.locator("label").filter({ hasText: "Fim" }), "13:00");
  await row.locator(`select[name="d${weekday}_location"]`).selectOption({ label: LOCATION_B.name });
  await modal.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });
}

/** Delete every block currently shown for the therapist (leave a clean slate). */
async function clearBlocks(page: Page) {
  await page.goto("/admin/staff");
  await openBlocks(page);
  const modal = blocksModal(page);
  for (let guard = 0; guard < 12; guard++) {
    const list = modal.getByTestId("blocks-list");
    if ((await list.count()) === 0) break;
    const firstRemove = list.getByRole("button", { name: "Eliminar" }).first();
    if ((await firstRemove.count()) === 0) break;
    await firstRemove.click();
    await page.waitForURL(/admin\/staff/);
    // The save closes the dialog (page reload); wait for it to be gone before
    // re-opening so its ::backdrop can't intercept the next open-blocks click.
    await expect(modal).toBeHidden();
    await openBlocks(page);
  }
}

test("W5-12: both modes create time_off blocks; pontual excluded from availability; overlap warns not cancels", async ({
  page,
}) => {
  // Long multi-dialog flow (clearBlocks → setWorkingHours → book → 2 blocks →
  // assertions → clearBlocks). ~7s locally, but overloaded CI runners have been
  // seen 26x slower (186s), exceeding even 180s — this is the single longest test
  // in the suite. Proven correct locally (7.1s, repeatedly). Give it wide headroom
  // so slow-runner variance can't red it; revisit downward once CI infra is stable.
  test.setTimeout(420_000);

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
  await page.goto("/admin/staff");
  await openBlocks(page);
  let modal = blocksModal(page);
  await modal.getByLabel("Tipo").selectOption("prolongada");
  await expect(modal.getByLabel("De")).toBeVisible();
  await modal.getByLabel("De").fill(futureDate(RUN_DAY_BASE + 40));
  await modal.getByLabel("Até").fill(futureDate(RUN_DAY_BASE + 42));
  await modal.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(modal).toBeHidden();

  // --- Create a Bloqueio pontual (date + hour range) OVER the booked 09:00 slot. ---
  await openBlocks(page);
  modal = blocksModal(page);
  await modal.getByLabel("Tipo").selectOption("pontual");
  await expect(modal.getByLabel("Data")).toBeVisible();
  await modal.getByLabel("Data").fill(date);
  // W12-31: pontual block times are 24h TimeFields (select-based), driven via fillTime.
  await fillTime(modal.locator("label").filter({ hasText: "Início" }), "09:00");
  await fillTime(modal.locator("label").filter({ hasText: "Fim" }), "13:00");
  await modal.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(modal).toBeHidden();

  // WARNING shown (block overlaps the existing 09:00 appointment), NOT cancelled.
  await expect(page.getByTestId("equipa-banner")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("equipa-banner")).toContainText(/não foram canceladas/i);

  // Both blocks are listed in the modal (pontual + prolongada).
  await openBlocks(page);
  modal = blocksModal(page);
  const list = modal.getByTestId("blocks-list");
  await expect(list.getByText("Bloqueio pontual")).toHaveCount(1);
  await expect(list.getByText("Ausência prolongada")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

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
