/**
 * agenda-sticky-header.spec.ts — AGENDA-01. THE WEEKDAY ROW STAYS ON SCREEN.
 *
 * ==========================================================================
 * THE REPORT, AND WHY IT IS A CORRECTNESS DEFECT AND NOT A POLISH ONE
 * ==========================================================================
 * Reception (CB): the week view carries 310 appointments and the day-of-week row
 * scrolls out of view, so by 11:00 the reader is looking at a column of patient
 * names with nothing on screen saying which day it is. On a week that dense that
 * is how an appointment gets read against the wrong day.
 *
 * ==========================================================================
 * WHAT THIS FILE PROVES, AND WHAT `perf-agenda-density.spec.ts` PROVES INSTEAD
 * ==========================================================================
 * THE DEFECT DOES NOT NEED DENSITY TO REPRODUCE, and that is worth stating
 * because "prove it on a real week" could otherwise be read as "this test is not
 * enough". The grid's visible window is 08:00-20:00 = twelve hours at a 96px
 * base (lib/scheduling/time.ts, agenda-grid.tsx), so an EMPTY week is already
 * ~1150px tall against a 900px viewport minus the toolbar. Scroll is guaranteed
 * on every fixture database, which is what lets this run on every commit in CI.
 *
 * WHAT DENSITY ADDS is the z-order and the reader's experience: at 310
 * appointments there are always name lines (`z-10`) and possibly the now-line
 * (`z-20`) passing UNDER the pinned row, and the STAFF-03 hour expansion makes
 * the grid several thousand pixels tall. `perf-agenda-density.spec.ts` runs that
 * on a seeded production-scale week; it is in the `perf` project because a
 * 310-appointment seed is not a shape any CI shard has. Both exist on purpose:
 * this one cannot be skipped, that one cannot be faked.
 *
 * ==========================================================================
 * THE TWO CONSTRAINTS THE OWNER SET, ASSERTED RATHER THAN ASSUMED
 * ==========================================================================
 *   (1) IT MUST NOT STEAL VERTICAL SPACE ON A SMALL LAPTOP. Asserted at
 *       1280x800 - the geometry of the grid body is compared BEFORE and AFTER
 *       the change is in force by comparing the first slot's box against the
 *       header's bottom at scroll-top: a pinned row that reserved space would
 *       push the grid down, and the card's own top would no longer sit flush
 *       under the toolbar.
 *   (2) THE HOUR GUTTER MUST NOT DRIFT OUT OF ALIGNMENT WITH THE COLUMNS. Each
 *       header cell's x/width is compared against its own day column's after a
 *       deep scroll, paired by date rather than by index.
 *
 * AND THE THIRD THING THE OWNER ASKED FOR - "if the header and the hour column
 * need to pin independently, say so rather than pinning one and calling it
 * done". THE HOUR COLUMN MUST NOT PIN, and the reason is asserted below rather
 * than argued: the gutter is the VERTICAL axis, so its labels have to travel
 * with the rows they name. The test asserts a gutter label MOVES with its row
 * under scroll while the header does not - i.e. that the two behaviours are
 * deliberately different. A pinned gutter is only ever needed against HORIZONTAL
 * scroll, and this grid has none.
 *
 * Runs as admin (the default project storage state).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { futureDate, RUN_DAY_BASE } from "./fixtures";

/** A laptop, not a workstation: the constraint is about a small screen. */
const LAPTOP = { width: 1280, height: 800 };

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box - it is not rendered");
  return b;
}

/** How far this page can scroll. Every scroll below is a FRACTION of it. */
function maxScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
}

/** Scroll to an absolute offset, then wait for it to actually be there. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await page.waitForFunction((to) => Math.abs(window.scrollY - to) < 2, y);
}


/**
 * WAIT FOR THE PAGE TO BE LIVE BEFORE MEASURING WHERE THE HEADER PINS.
 *
 * `--agenda-header-top` is written by a client effect (AgendaView measures the
 * sticky toolbar, which wraps and therefore has no compile-time height). Until
 * hydration runs, the CSS fallback is 0px and the row would pin AT the viewport
 * top - behind the toolbar. That window is real and it is harmless: nothing is
 * scrolled yet, so nothing is pinned yet, and /agenda needs hydration for the
 * drawer and every control anyway. It is NOT harmless in a test, where a
 * one-shot geometry read on a 310-appointment page can land inside it.
 *
 * So the pin is asserted with a POLL rather than waited for by a sleep or by
 * reading the custom property back. The claim under test stays "the row sits
 * below the toolbar", not "the variable was set".
 */
async function expectPinnedBelowToolbar(page: Page) {
  const header = page.getByTestId("agenda-weekday-header");
  const toolbar = page.getByTestId("agenda-toolbar");
  await expect
    .poll(
      async () => {
        const h = await header.boundingBox();
        const t = await toolbar.boundingBox();
        if (!h || !t) return -1;
        return Math.round(h.y - (t.y + t.height));
      },
      {
        timeout: 10_000,
        message:
          "the weekday row is pinned BEHIND the sticky toolbar rather than below it. It is in " +
          "the DOM and not on the screen; the measured --agenda-header-top is wrong for this " +
          "viewport (a negative number here is how far behind the bar the row is sitting)",
      },
    )
    .toBeGreaterThanOrEqual(-1);
}

test("Agenda: the weekday row stays visible while the grid scrolls (AGENDA-01)", async ({
  page,
}) => {
  await page.setViewportSize(LAPTOP);
  const anchor = futureDate(RUN_DAY_BASE + 12);
  await page.goto(`/agenda?view=week&date=${anchor}`);

  const header = page.getByTestId("agenda-weekday-header");
  const toolbar = page.getByTestId("agenda-toolbar");
  await expect(header).toBeVisible();

  // PREMISE FIRST: the page must actually be scrollable, or every assertion
  // below is vacuously true on a grid that never left the viewport.
  const limit = await maxScroll(page);
  expect(
    limit,
    "the agenda page does not scroll far enough at 1280x800 for this test to observe the defect " +
      "it exists for - the grid window (08:00-20:00) must be well taller than the viewport",
  ).toBeGreaterThan(400);

  // ---- (1) IT STEALS NO VERTICAL SPACE ---------------------------------
  // At scroll-top the header sits exactly where it always did: immediately
  // under the toolbar's bottom edge (the card's 24px gap is the toolbar's own
  // mb-6), and the grid body starts immediately under the header. A pinned row
  // that reserved space would open a gap here.
  const atTop = { header: await box(header), toolbar: await box(toolbar) };
  expect(atTop.header.y).toBeGreaterThanOrEqual(atTop.toolbar.y + atTop.toolbar.height);
  const firstSlot = page.locator("[data-day] > button").first();
  const slotTop = (await box(firstSlot)).y;
  expect(
    Math.abs(slotTop - (atTop.header.y + atTop.header.height)),
    "the grid body no longer starts immediately under the weekday row - the pinned header is " +
      "reserving vertical space, which the owner's constraint forbids on a small laptop",
  ).toBeLessThan(2);

  // ---- THE DEFECT ITSELF ------------------------------------------------
  // ALL THE WAY DOWN, not an arbitrary number of pixels. The report is about
  // mid-morning, but the bottom of the page is the strictly stronger claim and
  // it is the one that cannot go stale when the grid's height changes.
  await scrollTo(page, limit);

  await expect(
    header,
    "the weekday row left the viewport once the grid scrolled - the reader now has a column of " +
      "patient names with nothing on screen saying which day it is (AGENDA-01)",
  ).toBeInViewport();

  // IT PINS UNDER THE TOOLBAR, NOT UNDERNEATH IT. The toolbar is itself sticky
  // and wraps to three rows at 1280px; a hardcoded offset would leave the row in
  // the DOM and hidden behind the bar - present to every locator, invisible to
  // the reader, which is the failure this assertion exists to catch.
  await expectPinnedBelowToolbar(page);

  // The day names are still readable, not merely present.
  await expect(header.locator("[data-header-day]").first()).toBeVisible();

  // ---- (2) THE GUTTER STAYS ALIGNED WITH ITS COLUMNS --------------------
  // Paired by DATE, never by index: the week is Mon-Sat and an index pairing
  // would keep passing if the header and the body ever fell out of order.
  const days = await header.locator("[data-header-day]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-header-day")!),
  );
  expect(days.length, "the week view should render six day columns (Mon-Sat)").toBe(6);
  for (const d of days) {
    const cell = await box(header.locator(`[data-header-day="${d}"]`));
    const column = await box(page.locator(`[data-day="${d}"]`));
    expect(
      Math.abs(cell.x - column.x),
      `header cell and body column for ${d} are horizontally out of alignment while the header ` +
        "is pinned - the hour gutter no longer lines up with the columns",
    ).toBeLessThan(1.5);
    expect(Math.abs(cell.width - column.width)).toBeLessThan(1.5);
  }

  // ---- (3) THE HOUR GUTTER DOES *NOT* PIN, DELIBERATELY ------------------
  // An hour label means "this row is 09:00". If the gutter were frozen the
  // label would sit beside whatever happened to be scrolled level with it -
  // the same class of lie as the weekday row being absent, and louder, because
  // it would still look authoritative. So: the header holds still under a
  // further scroll and the hour labels move with their rows.
  // Both readings are taken while the header is ALREADY pinned, so "it did not
  // move" is a claim about the pin and not about the flow position it started
  // in. The step is a fraction of this page's own scroll range, so nothing here
  // depends on the grid being a particular height.
  const from = Math.round(limit * 0.4);
  const step = limit - from;
  expect(step, "not enough scroll range left to observe the gutter travelling").toBeGreaterThan(100);

  const label = page.getByText("14:00", { exact: true }).first();
  await scrollTo(page, from);
  const before = { header: (await box(header)).y, label: (await box(label)).y };
  await scrollTo(page, limit);
  const after = { header: (await box(header)).y, label: (await box(label)).y };

  expect(
    Math.abs(after.header - before.header),
    "the pinned header moved with the page",
  ).toBeLessThan(2);
  expect(
    before.label - after.label,
    "the hour label did not travel with its row under scroll - the gutter has been pinned too, " +
      "which decouples every hour label from the row it names",
  ).toBeCloseTo(step, 0);
});

test("Agenda: the weekday row pins in the Dia view too (AGENDA-01)", async ({ page }) => {
  // The day view is the same grid with one column, and it is what the agenda
  // collapses to below the lg breakpoint - so a fix that only held in the week
  // view would leave every phone and every narrow window with the old defect.
  await page.setViewportSize(LAPTOP);
  const anchor = futureDate(RUN_DAY_BASE + 13);
  await page.goto(`/agenda?view=day&date=${anchor}`);

  const header = page.getByTestId("agenda-weekday-header");
  await expect(header).toBeVisible();
  await expect(header.locator("[data-header-day]")).toHaveCount(1);

  await scrollTo(page, await maxScroll(page));
  await expect(header).toBeInViewport();

  const cell = await box(header.locator("[data-header-day]"));
  const column = await box(page.locator("[data-day]"));
  expect(Math.abs(cell.x - column.x)).toBeLessThan(1.5);
  expect(Math.abs(cell.width - column.width)).toBeLessThan(1.5);
});
