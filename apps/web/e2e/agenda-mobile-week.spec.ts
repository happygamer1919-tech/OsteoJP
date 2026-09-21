/**
 * agenda-mobile-week.spec.ts — AGMOB-01: the week is reachable on a phone.
 *
 * THE REPORT THIS ENCODES. A therapist said the weekly view is not possible on
 * the phone version. It was not: agenda-view.tsx forced the Dia view below the
 * `lg` breakpoint with a client-side matchMedia override and hid the Dia/Semana
 * toggle, so no press could reach the week.
 *
 * WHY 390x844 AND WHY IT IS IN THE REQUIRED GATE. Two specs already run at that
 * viewport with `hasTouch` (ficha-signature-consent.spec.ts,
 * portal-a11y-experience.spec.ts), and chromium's `testIgnore` is only
 * `reminders` and `perf-*`, so this file needs no config change, no new project
 * and no new dependency to run on every PR.
 *
 * WHAT THIS SPEC CANNOT SAY, STATED HERE SO NOBODY READS IT AS MORE THAN IT IS.
 * No CI job on this repository runs WebKit or Firefox: `--project=chromium`
 * alone (.github/workflows/e2e.yml), and `git grep -ic webkit -- .github/`
 * exits 1. Chromium at 390x844 emulates a VIEWPORT, not an ENGINE. It bounds
 * the failure modes this file names - the toggle is reachable and not painted
 * under another control, six day sections exist, nothing scrolls sideways, the
 * names fit, a row opens the right appointment, the tap targets are 44px - and
 * it cannot say the thing is usable on the iPhone the clinic is holding. That
 * is what the acceptance line in the PR body and the therapist's own thumb are
 * for.
 *
 * NOT IN `HARD_REQUIRED` (.github/scripts/assert-e2e-executed.mjs). That list's
 * own comment says a test belongs there for being LOAD-BEARING ON A GATE, not
 * for being important.
 */
import { test, expect } from "@playwright/test";

import { LOCATION, PATIENTS, RUN_DAY_BASE, THERAPIST_NAME, futureDate } from "./fixtures";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** This file's day. One offset per spec file (e2e-spec-days-do-not-collide). */
const DAY = futureDate(RUN_DAY_BASE + 140);

/** Monday of DAY's week, and the six Mon-Sat days after it. Computed here from
 *  the date arithmetic, never read back off the page - a test that asks the page
 *  which days it is showing cannot notice it showing the wrong ones. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  const mon0 = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mon0);
  return d.toISOString().slice(0, 10);
}
function monToSat(monday: string): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${monday}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Do two boxes not overlap? `toBeVisible()` is true of a control painted
 *  underneath another one - agenda-toolbar-compact.spec.ts recorded that lesson
 *  - so reachability is asserted as geometry, not as visibility. */
function disjoint(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

const MONDAY = mondayOf(DAY);

test.describe("the agenda week on a phone (AGMOB-01)", () => {
  test("Semana is reachable at 390px and renders six Mon-Sat day sections", async ({ page }) => {
    // ---- fixture: one appointment in this week, so the arms below have a
    // subject. Booked at desktop width, which is where the grid's slot buttons
    // are; the phone half of the test starts after it.
    await page.setViewportSize(DESKTOP);
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();

    await page.getByRole("button", { name: /10:00$/ }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 8_000 });
    const patient = drawer.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.joao.name);
    await drawer.getByRole("option", { name: PATIENTS.joao.name }).click();
    await drawer.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
    await drawer.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
    await drawer.getByRole("button", { name: "Guardar" }).click();
    await expect(drawer).toBeHidden({ timeout: 12_000 });

    // ---- now the phone. Arrive the way the dashboard tile arrives: it links to
    // `/agenda?view=day&date=…`, and `navigate()` preserves `view` on every
    // later press, so ?view=day is the state a therapist is most likely in.
    await page.setViewportSize(PHONE);
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();

    // ARM 1 - THE REPORT ITSELF. Located by ACCESSIBLE NAME, never by class.
    const toggle = page.getByRole("radiogroup", { name: "Agenda" });
    const semana = toggle.getByRole("radio", { name: "Semana" });
    await expect(semana).toBeVisible();

    const semanaBox = await semana.boundingBox();
    const pickerBox = await page.getByRole("button", { name: /Escolher data/i }).boundingBox();
    expect(semanaBox, "Semana has a box at all").not.toBeNull();
    expect(pickerBox, "the date picker has a box at all").not.toBeNull();
    expect(
      disjoint(semanaBox!, pickerBox!),
      "Semana does not sit on top of the date picker",
    ).toBe(true);

    await semana.tap();
    await expect(page).toHaveURL(/view=week/);

    // ARM 2 - six sections, the RIGHT six, in order, and never a Sunday.
    const sections = page.locator("[data-list-day]");
    await expect(sections).toHaveCount(6);
    expect(
      await sections.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.listDay)),
    ).toEqual(monToSat(MONDAY));

    // ARM 3 - no horizontal page scroll. THE NON-VACUITY CONTROL COMES FIRST: a
    // display:none box has scrollWidth === clientWidth === 0 and would pass the
    // comparison below while showing nothing at all.
    const m = await page.evaluate(() => ({
      c: document.documentElement.clientWidth,
      s: document.documentElement.scrollWidth,
    }));
    expect(m.c, "the page has a width at all").toBeGreaterThan(0);
    expect(m.s).toBeLessThanOrEqual(m.c);

    // ARM 4 - THE VALUE FITS, not merely the box. A width floor asks "is the box
    // big"; the clinic asked "does the name fit". The two came apart before.
    const names = page.locator("[data-list-day] [data-testid='week-list-patient']");
    expect(await names.count(), "the fixture put a name on the screen").toBeGreaterThan(0);
    expect(
      await names.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length),
    ).toBe(0);

    // ARM 5 - a row opens the RIGHT appointment. By id, never by name: a patient
    // name is shared vocabulary on a seeded database and would be satisfied by
    // somebody else's row.
    const row = page.locator("[data-list-day] [data-list-appointment-id]").first();
    const id = await row.getAttribute("data-list-appointment-id");
    expect(id, "the row carries its own id").toBeTruthy();
    await row.tap();
    const opened = page.getByRole("dialog");
    await expect(opened).toBeVisible({ timeout: 8_000 });
    // The drawer renders the appointment's own id, for the reason its comment
    // gives (the messaging-check round trip needs one). That is the only value
    // on the panel a neighbouring row could not also produce, so it is what the
    // assertion reads - the panel being open proves nothing about WHICH row.
    await expect(opened.getByTestId("drawer-appointment-id")).toHaveText(id!);
    await page.keyboard.press("Escape");

    // ARM 6 - tap targets, MEASURED rather than asserted through a class name.
    const boxes = await page
      .locator("[data-list-day] [data-list-appointment-id]")
      .evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return [r.width, r.height];
        }),
      );
    expect(boxes.length).toBeGreaterThan(0);
    for (const [w, h] of boxes) {
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThanOrEqual(44);
    }

    await page.screenshot({ path: "test-results/agenda-390-semana.png" });
  });

  // ==================================================================
  // THE CONTROL ARM. It is what makes the six above non-vacuous, and it
  // is simultaneously the desktop-regression guard: if the list ever
  // became the read surface on a desktop, this fails.
  // ==================================================================
  test("CONTROL - at 1440 the grid is the read surface and the list is not", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();

    // The list is in the DOM at every width - the swap is CSS - and hidden here.
    await expect(page.locator("[data-list-day]")).toHaveCount(6);
    await expect(page.locator("[data-list-day]").first()).toBeHidden();

    // And the grid, which agenda-grid.tsx marks with `data-day`, is visible.
    await expect(page.locator("[data-day]")).toHaveCount(6);
    await expect(page.locator("[data-day]").first()).toBeVisible();

    // ======================================================================
    // THE SECOND TREE MUST NOT ANSWER TO THE FIRST TREE'S SELECTORS.
    // Measured here rather than reasoned about, because the first push of this
    // card got it wrong: the list row carried `data-appointment-id`, and
    // therapist-cancel-uncancel.spec.ts failed in this very gate with
    // `toHaveCount(1) ... Received: 2`. Eleven e2e files select on that
    // attribute and e2e/helpers/index.ts does so UNSCOPED, so this arm is the
    // one standing between the rename and a repeat.
    // ======================================================================
    const gridRows = page.locator("[data-day] [data-appointment-id]");
    const listRows = page.locator("[data-list-day] [data-list-appointment-id]");
    // Non-vacuity FIRST: there is something on this week to double.
    expect(await listRows.count(), "the fixture put a row in the list").toBeGreaterThan(0);
    // The grid's attribute is answered ONLY by the grid, at page scope.
    expect(await page.locator("[data-appointment-id]").count()).toBe(await gridRows.count());
    // And an id that exists resolves to exactly one element page-wide, which is
    // the exact shape the broken version failed.
    const anId = await listRows.first().getAttribute("data-list-appointment-id");
    await expect(page.locator(`[data-appointment-id="${anId}"]`)).toHaveCount(1);

    // ROLE LOCATORS: `md:hidden` is display:none, so the list's buttons are out
    // of the accessibility tree and getByRole does not see them. Asserted, not
    // assumed - a dozen agenda specs locate a card by its patient's name.
    const named = page.getByRole("button", { name: new RegExp(PATIENTS.joao.name) });
    await expect(named, "a patient name still names exactly one button").toHaveCount(1);
  });

  test("CONTROL - 767 gets the list, 768 gets the grid. The threshold is a DECISION, so it is pinned both ways", async ({
    page,
  }) => {
    for (const [width, visibleList, visibleGrid] of [
      [767, 6, 0],
      [768, 0, 6],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/agenda?view=week&date=${DAY}`);
      await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
      await expect(
        page.locator("[data-list-day]:visible"),
        `at ${width}px the day list`,
      ).toHaveCount(visibleList);
      await expect(page.locator("[data-day]:visible"), `at ${width}px the grid`).toHaveCount(
        visibleGrid,
      );
    }
  });
});
