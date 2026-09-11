/**
 * perf-agenda-density.spec.ts — AGENDA-01 ON A REAL PRODUCTION-SCALE WEEK.
 *
 * ==========================================================================
 * WHY THIS EXISTS BESIDE agenda-sticky-header.spec.ts
 * ==========================================================================
 * The owner's instruction was explicit: "Prove it on the real production-scale
 * week, not a three-appointment fixture." The CI spec proves the pin on the
 * ordinary fixture database, where the empty grid is already taller than the
 * viewport - that is the regression guard and it runs on every commit.
 *
 * THIS ONE PROVES THE THING DENSITY ACTUALLY CHANGES, and there are two:
 *
 *   1. Z-ORDER. At 310 appointments there are patient-name lines under the
 *      pinned row at every scroll position. Those lines are `z-10` and the
 *      current-time line is `z-20`, inside `.glass-card`'s own stacking context.
 *      A header that renders correctly over EMPTY grid lines and paints UNDER a
 *      name line is a defect no sparse fixture can see, and it is the one that
 *      would look exactly like the original report.
 *   2. HEIGHT. STAFF-03 grows an hour row to fit what starts inside it, so a
 *      dense week is thousands of pixels tall rather than ~1150. The pin has to
 *      hold at 11:00 on that grid, which is where the report came from.
 *
 * ==========================================================================
 * IT IS IN THE `perf` PROJECT, WHICH CI NEVER NAMES
 * ==========================================================================
 * A 310-appointment week is a seeded shape, not a fixture, so this cannot be a
 * CI check. It is a PROJECT rather than a `test.skip` for the reason
 * playwright.config.ts gives: a skipped test is invisible inside a green shard,
 * and `scripts/perf-project-is-pinned.test.mjs` fails if the project is ever
 * deleted or the specs renamed out from under it.
 *
 * PREREQUISITE, and it fails loudly rather than measuring the wrong week:
 *   DATABASE_URL=<lane> node scripts/perf-seed-agenda-week.mjs
 *
 * Run:
 *   node scripts/lane-stack.mjs e2e --lane purple -- --project=perf \
 *     --grep "production-scale week"
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const LAPTOP = { width: 1280, height: 800 };
const MANIFEST = join(__dirname, ".perf-agenda-week.json");

/** The density reception reported, and the floor this spec refuses to run below. */
const REPORTED_DENSITY = 300;

function manifest(): { anchor: string; days: string[]; seeded: number; locationName: string } {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    throw new Error(
      `${MANIFEST} is missing. This suite measures a SEEDED production-scale week and will not ` +
        "fall back to the sparse fixture - that would report a pass about a three-appointment " +
        "grid. Seed it first:\n" +
        "  DATABASE_URL=<lane url> node scripts/perf-seed-agenda-week.mjs",
    );
  }
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box - it is not rendered");
  return b;
}
function maxScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
}
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

test("Agenda: the weekday row holds on a production-scale week (AGENDA-01)", async ({ page }) => {
  const week = manifest();
  await page.setViewportSize(LAPTOP);
  await page.goto(`/agenda?view=week&date=${week.anchor}`);

  const header = page.getByTestId("agenda-weekday-header");
  await expect(header).toBeVisible();

  /* ====================================================================== */
  /* THE PREMISE, READ OFF THE SCREEN AND NOT OFF THE SEED'S OWN MANIFEST.   */
  /* ====================================================================== */
  // The manifest is an ADDRESS - which week to open. The DENSITY is taken from
  // the agenda's own range chip, which counts exactly what the grid renders
  // (agenda-view.tsx computes it from viewDates + the Lisbon calendar day). A
  // spec that trusted the seed's number could report "proven at 310" about a
  // page showing four, which is the failure mode this whole card is about.
  const chip = page.getByTestId("agenda-range-chip");
  await expect(chip).toBeVisible();
  const shown = Number((await chip.innerText()).match(/(\d+)\s+marca/)?.[1] ?? 0);
  expect(
    shown,
    `the week of ${week.anchor} shows ${shown} appointments on screen. This suite exists to prove ` +
      `the pinned header at reception's density (~${week.seeded}); below ${REPORTED_DENSITY} it ` +
      "would be asserting about a sparse grid while claiming otherwise. Re-run " +
      "scripts/perf-seed-agenda-week.mjs against the lane this suite is pointed at.",
  ).toBeGreaterThanOrEqual(REPORTED_DENSITY);

  // AND THE GRID IS THE EXPANDED ONE, NOT MERELY A FULL ONE.
  //
  // MEASURED, AND THE FIRST VERSION OF THIS ASSERTION WAS WRONG. A flat 310 -
  // one appointment in each half-hour slot - renders a grid EXACTLY as tall as
  // an empty week (12 hours x 96px = 1152px), because STAFF-03 only grows an
  // hour when the lines starting in it need more than that: `lines * 20 + 8`,
  // which takes five. So "310 appointments" is not by itself a dense grid, and a
  // spec that assumed it was would have been asserting about the ordinary one
  // while reporting production scale.
  //
  // What makes it dense is the SHAPE - concurrent starts through the middle of
  // the day - which is what the seed builds and what this checks. The column
  // being taller than 1152px is the observable consequence of the hour rows
  // having grown, so it is the premise assertion, not the scroll distance.
  const columnHeight = (await box(page.locator(`[data-day="${week.days[0]}"]`))).height;
  expect(
    columnHeight,
    "the seeded week renders a grid no taller than an EMPTY one (12 x 96px). The appointments " +
      "either did not land inside 08:00-20:00, or they are spread so evenly that no hour row " +
      "expanded - either way this is not the dense grid the card is about",
  ).toBeGreaterThan(12 * 96);

  const limit = await maxScroll(page);
  expect(
    limit,
    "the page does not scroll a full screen at this density, so the reader never loses the header",
  ).toBeGreaterThan(LAPTOP.height * 0.75);

  /* ====================================================================== */
  /* IT HOLDS AT MID-MORNING, WHICH IS WHERE THE REPORT CAME FROM.          */
  /* ====================================================================== */
  // Not a pixel count: find the 11:00 hour label and scroll until it is at the
  // top of the reading area. That is literally the reader's position in the
  // report - "by 11:00 the reader is looking at a column of patient names".
  // SCOPED TO THE GUTTER: the sticky toolbar's "Atualizar" button prints the
  // render time as a bare HH:MM, so a page-wide "11:00" on a page loaded at
  // 11:00 would anchor this scroll to the toolbar and test nothing.
  const elevenTop = await page
    .getByTestId("agenda-time-gutter")
    .getByText("11:00", { exact: true })
    .evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  await scrollTo(page, Math.min(Math.round(elevenTop - 200), limit));

  await expect(
    header,
    "at 11:00 on a 310-appointment week the weekday row is off screen - this is the reported " +
      "defect, unfixed",
  ).toBeInViewport();

  await expectPinnedBelowToolbar(page);
  const h = await box(header);

  /* ====================================================================== */
  /* Z-ORDER: THE THING ONLY DENSITY CAN TEST.                              */
  /* ====================================================================== */
  // Take the topmost appointment name line that is inside the header's own band
  // and assert the HEADER is the element the reader's eye (and a click) lands
  // on there. `elementFromPoint` is the browser's own answer to "what is painted
  // here", so this cannot be satisfied by a z-index that merely looks right.
  const covered = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        insideHeader: !!el?.closest('[data-testid="agenda-weekday-header"]'),
        tag: el?.tagName ?? "none",
        testid: el?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
      };
    },
    { x: Math.round(h.x + h.width / 2), y: Math.round(h.y + h.height / 2) },
  );
  expect(
    covered.insideHeader,
    `something is painted OVER the pinned weekday row (${covered.tag}, testid=${covered.testid}). ` +
      "At this density there are z-10 name lines and a z-20 now-line under it; the header is z-30 " +
      "and must win, or the reader is back to a column of names with no day on it",
  ).toBe(true);

  /* ====================================================================== */
  /* THE GUTTER, STILL ALIGNED, ON THE TALL GRID.                           */
  /* ====================================================================== */
  const days = await header
    .locator("[data-header-day]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-header-day")!));
  expect(days).toEqual(week.days);
  for (const d of days) {
    const cell = await box(header.locator(`[data-header-day="${d}"]`));
    const column = await box(page.locator(`[data-day="${d}"]`));
    expect(
      Math.abs(cell.x - column.x),
      `header cell and body column for ${d} drifted apart on the dense grid`,
    ).toBeLessThan(1.5);
    expect(Math.abs(cell.width - column.width)).toBeLessThan(1.5);
  }

  // A closing reading for the report: how tall reception's week actually is.
  console.log(
    `[agenda-density] week ${week.anchor} at ${week.locationName}: ${shown} appointments, ` +
      `${Math.round(columnHeight)}px of time grid, ${limit}px of scroll on a ${LAPTOP.height}px screen`,
  );
});
