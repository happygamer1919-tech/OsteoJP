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

/**
 * Wait for a WRITE to actually land before touching the page again.
 *
 * Every Bloquear-horário / Horários write is a server action that ends in
 * `redirect("/admin/staff?m=<code>")`. The old wait here was
 * `waitForURL(/admin\/staff/)`, which the CURRENT url already satisfies - so it
 * waited for nothing, and the next click raced the redirect: Playwright found
 * the button in the outgoing DOM and the incoming render detached it
 * mid-click. Locally that race is won; on CI it was lost every time, which is
 * what "element is not stable / element was detached from the DOM" meant in the
 * 2026-07-27 failure that got this test quarantined as "runners degraded".
 *
 * The `?m=` param is the redirect's OWN marker, and the banner is the rendered
 * proof the new page committed - so this waits on the app's real signal rather
 * than on a timer or on networkidle.
 */
async function settleAfterWrite(page: Page) {
  await page.waitForURL(/\/admin\/staff\?m=/);
  await expect(page.getByTestId("equipa-banner")).toBeVisible({ timeout: 15_000 });
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
  await settleAfterWrite(page);
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
    await settleAfterWrite(page);
    // The save closes the dialog (page reload); wait for it to be gone before
    // re-opening so its ::backdrop can't intercept the next open-blocks click.
    await expect(modal).toBeHidden();
    await openBlocks(page);
  }
}

test("W5-12: both modes create time_off blocks; pontual excluded from availability; overlap warns not cancels", async ({
  page,
}) => {
  // Was QUARANTINED ON CI 2026-07-27 (owner-approved): GitHub's shared runners
  // were degraded 24h+, running this long multi-dialog flow ~26x slower than
  // local (7s → 186s), timing out the 25-min e2e job and blocking every PR on
  // pure infra.
  //
  // UN-QUARANTINED 2026-07-31. The recovery condition the quarantine named has
  // been met and measured, not assumed: seven consecutive Playwright jobs on
  // this repo the same day finished GREEN in 12.4-14.5 min (PRs #720-#727),
  // tightly clustered and well inside the 25-min budget - the low variance is
  // the actual health signal, since a degraded runner shows as a wide spread,
  // not a uniform slowdown.
  //
  // The generous per-test budget STAYS. It was never the quarantine: this is a
  // genuinely long multi-dialog flow, and 180s absorbs normal CI variance
  // without masking a hang. If this test ever times out again, quarantine is
  // the wrong first move - read which assertion failed first.
  //
  // RE-QUARANTINED ON CI 2026-08-02 (owner-ruled), issue #738. The advice above
  // was followed before reaching for the skip: the artifact was read, and it is
  // NOT an assertion failure and NOT a slow runner.
  //
  //   locator resolved to <button data-testid="open-blocks">
  //     - element is visible, enabled and stable
  //     - element is not visible
  //     - element was detached from the DOM, retrying   <- for the full 180s
  //
  // The button is always FOUND; the click never lands. That is the same race
  // #730 shipped a fix for. Measured, not assumed: this spec was run twice on
  // clean origin/main (ecbc40d1) and twice on an unrelated apps/api branch
  // (aa4b4ab1), single-attempt, retries=0. All four failed, with identical
  // durations because the fixed 180s timeout dominates. Failing on clean main
  // is what makes this the spec's problem and not any branch's.
  //
  // The other four tests in this file are UNTOUCHED and still run.
  //
  // EXIT CONDITION: un-quarantine only when this test passes twice
  // consecutively on CI at --retries=0 on an otherwise-main tree. The evidence
  // is the run, not the reasoning. Do not re-enable on a hunch a second time.
  test.skip(
    !!process.env.CI,
    "Quarantined on CI - open-blocks detaches mid-click, see issue #738",
  );
  test.setTimeout(180_000);

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
  await settleAfterWrite(page);
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
  await settleAfterWrite(page);
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
