/**
 * weekend-two-period.spec.ts — SCHED-12.
 *
 * REPORTED: a therapist with Sábado 08:00-13:00 plus a second period
 * 14:00-19:00 is refused for a Saturday booking with "O terapeuta não tem
 * horário de trabalho definido neste dia."; the same therapist books fine on
 * Friday.
 *
 * ==========================================================================
 * WHAT THIS SPEC IS FOR, given the unit tests already pass.
 * ==========================================================================
 * `lib/scheduling/weekend-two-period.test.ts` proves the RESOLVER returns both
 * periods for weekday 6 and weekday 0, and that the weekday index for
 * 2026-09-05 is 6. The write path's field names (`d6_on`, `d6p2_on`, …) match
 * what the editor posts, and `reconcileWeek` loops 0..6.
 *
 * So every code-level candidate is eliminated in isolation, and what is NOT
 * covered is the ROUND TRIP: save a weekend two-period day through the real
 * editor, reload, and ask the real booking panel about it. If this passes, the
 * production symptom is DATA - the schedule was never persisted, or was
 * persisted at another clinic - and not code. That is a conclusion worth being
 * able to state with evidence rather than by elimination.
 *
 * SATURDAY *AND* SUNDAY, because they are the two boundaries: Saturday is 6,
 * the top of the weekday range, Sunday is 0, the bottom, and the editor renders
 * them at opposite ends of its own [1,2,3,4,5,6,0] order. An off-by-one in
 * either direction lands on exactly one of them.
 *
 * ==========================================================================
 * RESTORED 2026-09-03, AND TWO THINGS CHANGED - NEITHER OF THEM AN ASSERTION.
 * ==========================================================================
 * It was REMOVED (not skipped) after three failed attempts, because it could not
 * be stabilised on a database that never returned to a known state. Both causes
 * are now fixed in the FIXTURE:
 *
 *   1. THE SEED IS IDEMPOTENT (LE-seed-not-idempotent). It no longer dies on its
 *      second run, and it RESETS every seeded therapist's availability rows, so
 *      a run starts from a declared schedule rather than from whatever the last
 *      run left.
 *   2. THIS SPEC HAS ITS OWN THERAPIST. The old version wrote the weekend days
 *      of the SHARED "E2E Therapist" and left them there, which turned
 *      working-hours.spec.ts red whenever RUN_DAY_BASE + 20 landed on a weekend -
 *      a spec this one never touches, failing on a calendar.
 *
 * The assertions are the ones the spec always had.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillTime, expectTime } from "./helpers";
import { LOCATION_B, THERAPIST_WEEKEND, futureDate, RUN_DAY_BASE } from "./fixtures";

/** The next date at or after `from` whose UTC weekday is `weekday` (0=Sun..6=Sat). */
function nextWeekday(fromOffset: number, weekday: number): string {
  for (let i = 0; i < 14; i++) {
    const iso = futureDate(fromOffset + i);
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === weekday) return iso;
  }
  throw new Error(`no weekday ${weekday} found`);
}

function therapistCard(page: Page) {
  return page.locator('[data-testid="equipa-card"]').filter({ hasText: THERAPIST_WEEKEND }).first();
}
function manageModal(page: Page) {
  return page.getByRole("dialog", { name: /Gerir/i });
}
async function openHours(page: Page) {
  const modal = manageModal(page);
  if (!(await modal.isVisible())) {
    await therapistCard(page).getByRole("button", { name: "Gerir", exact: true }).click();
    await expect(modal).toBeVisible();
  }
  await modal.getByRole("radio", { name: "Horários", exact: true }).click();
  return modal;
}

/** Save a two-period day for `weekday`, then assert it survives a reload. */
async function saveTwoPeriodDay(page: Page, weekday: number) {
  await page.goto("/admin/staff");
  let modal = await openHours(page);
  const row = modal.locator("fieldset").filter({
    has: page.locator(`select[name="d${weekday}_location"]`),
  });

  const worksToggle = row.locator(`input[name="d${weekday}_on"]`);
  if (!(await worksToggle.isChecked())) await worksToggle.check();
  await fillTime(row.locator("label").filter({ hasText: "Início" }), "08:00");
  await fillTime(row.locator("label").filter({ hasText: "Fim" }), "13:00");
  await row.locator(`select[name="d${weekday}_location"]`).selectOption({ label: LOCATION_B.name });

  if ((await row.locator(`input[name="d${weekday}p2_on"]`).count()) === 0) {
    await row.getByRole("button", { name: /2\.º período/ }).click();
  }
  const p2 = row.locator("div").filter({ hasText: /^2\.º período/ }).last();
  await fillTime(p2.locator("label").filter({ hasText: "Início" }), "14:00");
  await fillTime(p2.locator("label").filter({ hasText: "Fim" }), "19:00");

  // SCHED-11 GUARD: the first period must still read 08:00-13:00 at this point.
  // The "+ 2.º período" button once overwrote it with the afternoon's
  // suggestion, and the save that followed was refused - which is a different
  // failure from the one this spec is about and must not be confused with it.
  await expectTime(row.locator("label").filter({ hasText: "Início" }).first(), "08:00");
  await expectTime(row.locator("label").filter({ hasText: "Fim" }).first(), "13:00");

  await modal.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText("Horário guardado")).toBeVisible({ timeout: 8_000 });

  // IT PERSISTED. Without this the booking assertion below could pass on a day
  // the editor never actually wrote.
  await page.goto("/admin/staff");
  modal = await openHours(page);
  const reloaded = modal.locator("fieldset").filter({
    has: page.locator(`select[name="d${weekday}_location"]`),
  });
  await expect(reloaded.locator(`input[name="d${weekday}p2_on"]`)).toHaveCount(1);
  await expectTime(reloaded.locator("label").filter({ hasText: "Início" }).first(), "08:00");
  await expectTime(reloaded.locator("label").filter({ hasText: "Fim" }).first(), "13:00");
  await expectTime(reloaded.locator("label").filter({ hasText: "Início" }).last(), "14:00");
  await expectTime(reloaded.locator("label").filter({ hasText: "Fim" }).last(), "19:00");
  await modal.getByRole("button", { name: /Fechar/i }).click();
}

/** The booking panel must NOT claim the therapist has no hours that day. */
async function expectBookable(page: Page, date: string) {
  const dialog = await openNewAppointment(page, date);
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_WEEKEND });
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });

  // THE EXACT SENTENCE THE OWNER SAW. availability-panel.tsx renders it on one
  // condition only: the resolver returned zero working windows for the day.
  await expect(
    dialog.getByText(/não tem horário de trabalho definido neste dia/i),
  ).toHaveCount(0);
  // And the positive arm: the morning period is actually offered.
  await expect(dialog.getByText(/08:00/).first()).toBeVisible({ timeout: 10_000 });
}

test("SCHED-12: a two-period SATURDAY saves, persists, and is bookable at 08:00", async ({
  page,
}) => {
  const saturday = nextWeekday(RUN_DAY_BASE + 60, 6);
  expect(new Date(`${saturday}T12:00:00Z`).getUTCDay()).toBe(6);
  await saveTwoPeriodDay(page, 6);
  await expectBookable(page, saturday);
});

test("SCHED-12: a two-period SUNDAY saves, persists, and is bookable at 08:00", async ({
  page,
}) => {
  const sunday = nextWeekday(RUN_DAY_BASE + 60, 0);
  expect(new Date(`${sunday}T12:00:00Z`).getUTCDay()).toBe(0);
  await saveTwoPeriodDay(page, 0);
  await expectBookable(page, sunday);
});
