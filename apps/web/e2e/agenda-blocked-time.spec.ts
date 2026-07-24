/**
 * agenda-blocked-time.spec.ts - W9-04, CB QA item 3.
 *
 * Runs as ADMIN. Blocked therapist time (`time_off`, migration 0006) was already
 * excluded from booking availability by W5-12, but was never DRAWN on the
 * agenda, so it was invisible and looked bookable. This proves the band renders
 * and that the span is genuinely non-bookable.
 *
 * SCOPE (owner question filed 2026-07-17): `time_off` is per therapist but the
 * agenda grid has DAY columns and no therapist axis (W9-01 (f)), so the band is
 * drawn ONLY when the agenda is scoped to one therapist. Asserted both ways
 * below - band under a therapist filter, no band under "Todos os terapeutas"
 * (where a full-width band would falsely claim the whole clinic is blocked).
 *
 * Creates its own block through the W5-12 UI and deletes it afterwards, so
 * re-runs never accrue state. Uses no patient data.
 */
import { test, expect, type Page } from "@playwright/test";
import { THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";
import { fillTime } from "./helpers";

const SAVE = "Guardar";
const BLOCK_DATE = futureDate(RUN_DAY_BASE + 26); // no other spec books this day

function blocksModal(page: Page) {
  return page.getByRole("dialog", { name: new RegExp(`Bloqueios de ${THERAPIST_NAME}`) });
}

function therapistCard(page: Page) {
  return page.locator("section.glass-card").filter({ hasText: THERAPIST_NAME }).first();
}

async function openBlocks(page: Page) {
  await page.goto("/admin/working-hours");
  await therapistCard(page).getByTestId("open-blocks").click();
  await expect(blocksModal(page)).toBeVisible();
}

/** Delete every block for the therapist, so the test is self-cleaning. */
async function clearBlocks(page: Page) {
  await openBlocks(page);
  const modal = blocksModal(page);
  for (let guard = 0; guard < 12; guard++) {
    const list = modal.getByTestId("blocks-list");
    if ((await list.count()) === 0) break;
    const remove = list.getByRole("button", { name: "Eliminar" }).first();
    if ((await remove.count()) === 0) break;
    await remove.click();
    await page.waitForURL(/working-hours/);
    await expect(modal).toBeHidden();
    await openBlocks(page);
  }
}

/** Create a 09:00-11:00 Bloqueio pontual on BLOCK_DATE. */
async function createBlock(page: Page) {
  await openBlocks(page);
  const modal = blocksModal(page);
  await modal.getByLabel("Tipo").selectOption("pontual");
  // The mode switch re-renders the form; wait for the fields to mount.
  await expect(modal.getByLabel("Data")).toBeVisible();
  await modal.getByLabel("Data").fill(BLOCK_DATE);
  // W12-31: pontual block times are 24h TimeFields (select-based), driven via fillTime.
  await fillTime(modal.locator("label").filter({ hasText: "Início" }), "09:00");
  await fillTime(modal.locator("label").filter({ hasText: "Fim" }), "11:00");
  await modal.getByRole("button", { name: SAVE }).click();
  await page.waitForURL(/working-hours/);
  await expect(modal).toBeHidden();
}

test.describe("W9-04: blocked time on the agenda", () => {
  test.beforeEach(async ({ page }) => {
    await clearBlocks(page);
    await createBlock(page);
  });

  test.afterEach(async ({ page }) => {
    await clearBlocks(page);
  });

  test("renders a non-bookable blocked band for the filtered therapist (CB QA item 3)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/agenda?view=day&date=${BLOCK_DATE}`);

    // Scope the agenda to the blocked therapist: only then is a full-width band
    // truthful, since the grid has no therapist axis.
    await page.getByLabel("Terapeutas").selectOption({ label: THERAPIST_NAME });
    await expect(page).toHaveURL(/therapist=/);

    // THE BAND: blocked time is now visible instead of silently absent.
    const band = page.getByTestId("agenda-blocked-band");
    await expect(band.first()).toBeVisible();
    await expect(band.first()).toContainText("Tempo bloqueado");

    // NON-BOOKABLE: the 09:00 and 10:30 slots sit inside the 09:00-11:00 block,
    // so their buttons must be DISABLED - unreachable by mouse AND keyboard.
    // (A pointer-events overlay alone would still allow tab + Enter.)
    const blockedSlot = page.getByRole("button", { name: /09:00/ }).first();
    await expect(blockedSlot).toBeDisabled();
    await expect(page.getByRole("button", { name: /10:30/ }).first()).toBeDisabled();

    // The 11:00 slot is the block's half-open end, so it stays bookable.
    await expect(page.getByRole("button", { name: /11:00/ }).first()).toBeEnabled();

    // Clicking the blocked slot fires no booking action: no drawer opens.
    await blockedSlot.click({ force: true }).catch(() => {
      /* a disabled button may reject the click outright - that is the point */
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("draws no band under Todos os terapeutas (the grid has no therapist axis)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Unfiltered: one therapist's absence must NOT be drawn as a clinic-wide
    // band, which would suppress real bookable time with everyone else.
    await page.goto(`/agenda?view=day&date=${BLOCK_DATE}`);
    await expect(page.getByTestId("agenda-blocked-band")).toHaveCount(0);
    // ... and the slots stay bookable for the other therapists.
    await expect(page.getByRole("button", { name: /09:00/ }).first()).toBeEnabled();
  });

  test("no regression: booking availability and the grid are unchanged (W5-12, W3-08)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/agenda?view=week&date=${BLOCK_DATE}`);

    // W3-08 six-day week survives the band layer.
    await expect(page.getByText(/^sáb/i).first()).toBeVisible();
    await expect(page.getByText(/^dom/i)).toHaveCount(0);
    // W4-17 count chip still reports for the visible range.
    await expect(page.getByTestId("agenda-range-chip")).toContainText(/\d+ marca[çc]/);
  });
});
