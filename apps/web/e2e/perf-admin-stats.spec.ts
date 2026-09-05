/**
 * perf-admin-stats.spec.ts - THE MEASUREMENT for PERF-timing-admin-stats.
 *
 * ==========================================================================
 * THE CONTRADICTION THIS EXISTS TO RESOLVE
 * ==========================================================================
 * The owner clicked *Pacientes* as an admin on production and waited about ten
 * seconds. The last recorded `/patients` p75 is 184 ms. Both cannot describe the
 * same path, and until now nothing in this application could say which part of
 * one request took the time.
 *
 * ==========================================================================
 * IT MEASURES, IT DOES NOT ASSERT A BUDGET
 * ==========================================================================
 * There is no `expect(ms).toBeLessThan(...)` anywhere below, on purpose. A
 * threshold here would turn a slow machine into a red suite and would tempt the
 * next person to "fix" the number rather than read it. Every test prints a
 * table and asserts only that the INSTRUMENT worked - that the panel rendered
 * and that the spans it claims exist do.
 *
 * ==========================================================================
 * ADMIN, RLS ON, AND LOCATION-ASSIGNED. SR-24 ONE LEVEL DEEPER.
 * ==========================================================================
 * It runs on the `perf` project, whose storage state is the seeded ADMIN. Every
 * query therefore runs through `runScoped` as `authenticated`, with the admin's
 * claims and 0073's `viewer_visible_patient_ids()` in play. A reading taken as
 * the owner principal, or with RLS off, describes a different plan and has
 * misled this project twice.
 *
 * PERF-14: RLS ON IS NOT ENOUGH IF THE PRINCIPAL NEVER TRIGGERS THE EXPENSIVE
 * HALF OF IT. Until 2026-09-05 the e2e admin held no `staff_locations` row, so
 * `viewerLocationScope` returned null, `scopeConditions` added no predicate, and
 * `viewer_has_location_assignment()` was false inside the policies. Every
 * performance number this project has taken on a lane was taken by that cheap
 * principal, and it is why the lane could not reproduce the production cost of
 * the /patients list at all. The seed now assigns the admin two locations; the
 * `total` below is what checks that it did.
 *
 * PREREQUISITE, and it fails loudly rather than measuring the wrong database:
 *   node scripts/perf-seed-admin-stats.mjs
 * The first test asserts the four counts on screen ARE the owner's four.
 */

import { test, expect, type Page } from "@playwright/test";

/**
 * THE FOUR NUMBERS THIS PRINCIPAL SEES, AND `total` IS THE PREMISE ASSERTION.
 *
 * ==========================================================================
 * PERF-14: THE MEASURING PRINCIPAL IS LOCATION-ASSIGNED, AND THAT IS THE POINT
 * ==========================================================================
 * The owner's screen shows 8,413, and `perf-seed-admin-stats.mjs` still hits
 * that exactly for an UNASSIGNED viewer. This suite runs as an admin the seed
 * gives TWO `staff_locations` rows, and such a viewer sees 8,409 - four fixture
 * patients are reachable at neither of those locations.
 *
 * SO 8,409 IS A CHECK ON THE PRINCIPAL, not a weaker version of the owner's
 * number. If this reads 8,413 the admin is UNASSIGNED, `viewerLocationScope`
 * returned null, `patientLocationScope` added no predicate and
 * `viewer_has_location_assignment()` was false inside the RLS policies - and
 * every timing below would be the cheap principal's, which is the defect
 * PERF-14 exists to end. Measured on this lane at production scale: the same
 * stat strip costs 12.2 ms unassigned and 512.4 ms assigned, and the list count
 * 2.4 ms against 178.1 ms, because the two correlated EXISTS run at loops=8409.
 */
const OWNER_STATS = { total: 8409, seenThisMonth: 56, withUpcoming: 153, inRecovery: 88 };

/**
 * The seed assigns exactly this many locations; an unassigned admin is offered
 * every ACTIVE one.
 *
 * THIS ASSERTION COULD NOT FAIL WHEN IT WAS FIRST WRITTEN, and that is worth
 * recording rather than quietly fixing. Tenant A had exactly two ACTIVE
 * locations - the third fixture location is archived - so an unassigned admin
 * was offered two as well and the check discriminated nothing. It was found by
 * counting them, not by reading the fixture. PERF-15 gives the seed a third
 * active location that the admin is deliberately NOT assigned to, so the two
 * principals separate again: assigned 2, unassigned 3.
 *
 * The `total` above is the stronger half and always was. This one is the visible
 * half, and a reader can check it on the screen.
 */
const ASSIGNED_LOCATIONS = 2;

type Reading = {
  route: string;
  serverMs: number;
  statStrip: "MISS" | "HIT";
  spans: { name: string; ms: number }[];
  ttfbMs: number | null;
  downloadMs: number | null;
  hydrateMs: number | null;
  totalFeltMs: number | null;
};

/**
 * Read the panel the page rendered.
 *
 * THROWS RATHER THAN RETURNING NULLS when the panel is absent. An absent panel
 * means the principal is not an admin, or the instrument is not wired on that
 * route - two facts a caller given `null` would treat alike, and both of which
 * make every number that follows meaningless.
 */
async function readPanel(page: Page, route: string): Promise<Reading> {
  const panel = page.getByRole("region", { name: "Medição de desempenho" });

  /**
   * IT WAITS. IT DOES NOT SAMPLE, AND THE FIRST VERSION OF THIS FUNCTION DID.
   *
   * That version called `.count()` immediately after `goto` and threw "no timing
   * panel" when it was zero. On `/estatisticas/painel` that produced a confident
   * and WRONG finding - "the route rendered an EMPTY <main>" - which read as a
   * blank page for an admin. The page was fine; the panel is the LAST element on
   * it, so it is the last thing to arrive, and `goto` resolves on `load` rather
   * than on the server component finishing.
   *
   * A measurement instrument that reads the page before the page exists reports
   * the instrument's impatience as the product's failure. Waiting is not a
   * convenience here, it is the difference between measuring and guessing.
   */
  try {
    await panel.waitFor({ state: "attached", timeout: 60_000 });
  } catch {
    // NOT a swallow: the state is re-read and reported. The previous version of
    // this diagnostic used `.catch(() => "")` around `innerText`, which turned a
    // strict-mode violation ("resolved to 2 elements") into "0 chars" and made
    // an unread page look like an empty one - for both principals, which is what
    // made it look like a finding. PORTAL-REHYDRATE 1.3, in the instrument.
    const landed = page.url();
    const body = (await page.locator("body").innerText()).trim();
    const headings = await page.getByRole("heading").allInnerTexts();
    throw new Error(
      `No timing panel on ${route} after 60s. Landed at ${landed}. Body holds ${body.length} ` +
        `chars, headings ${JSON.stringify(headings.slice(0, 5))}. Either this principal is not ` +
        "admin/owner (the panel is rendered for nobody else, so the data is never sent), or the " +
        "route is not instrumented, or the page never finished.",
    );
  }

  await panel.getByRole("button", { expanded: false }).click();

  const rows = await panel.locator("tbody tr").all();
  const spans: { name: string; ms: number }[] = [];
  let serverMs = 0;
  let ttfbMs: number | null = null;
  let downloadMs: number | null = null;
  let hydrateMs: number | null = null;
  let totalFeltMs: number | null = null;

  for (const r of rows) {
    const cells = await r.locator("td").allInnerTexts();
    if (cells.length < 2) continue;
    const label = cells[0]!.trim();
    const raw = cells[1]!.trim();
    const ms = raw === "—" ? 0 : Number(raw);
    if (label === "Primeiro byte (TTFB)") ttfbMs = ms;
    else if (label === "Transferência") downloadMs = ms;
    else if (label === "Hidratação") hydrateMs = ms;
    else if (label === "Total sentido") totalFeltMs = ms;
    else if (label === "Função do servidor") serverMs = ms;
    else spans.push({ name: label, ms });
  }

  return {
    route,
    serverMs,
    statStrip: spans.some((s) => s.name === "stat-strip:MISS") ? "MISS" : "HIT",
    spans,
    ttfbMs,
    downloadMs,
    hydrateMs,
    totalFeltMs,
  };
}

function report(title: string, readings: Reading[]): void {
  const lines = [`\n===== ${title} =====`];
  for (const [i, r] of readings.entries()) {
    lines.push(
      `  run ${i + 1}  ${r.route}  server ${r.serverMs} ms  stat-strip ${r.statStrip}  ` +
        `TTFB ${r.ttfbMs} ms  hydrate ${r.hydrateMs} ms  felt ${r.totalFeltMs} ms`,
    );
    for (const s of r.spans) lines.push(`           ${s.name.padEnd(34)} ${s.ms} ms`);
  }
  console.log(lines.join("\n"));
}

test.describe.configure({ mode: "serial" });

test("/patients as ADMIN: the seeded shape is the owner's, and the first click is measured", async ({
  page,
}) => {
  await page.goto("/patients");

  // THE PREMISE, ASSERTED BEFORE ANY NUMBER IS BELIEVED. A database with the
  // right row count and the wrong distribution runs different filters over a
  // different fraction of the scan, and would answer a question nobody asked.
  // SCOPED TO THE STAT GRID, not to `.glass-card` anywhere in main. The table's
  // own GlassPanel carries the same class, so the looser locator matched a
  // fifth element whose concatenated digits overflowed to Infinity - the first
  // run of this spec caught exactly that, which is what a premise assertion is
  // for.
  const strip = page.locator("main div.grid .glass-card");
  const values = (await strip.allInnerTexts()).map((t) => Number(t.replace(/\D/g, "")));
  expect(
    values,
    "the stat strip does not show the owner's four numbers - run scripts/perf-seed-admin-stats.mjs",
  ).toEqual([
    OWNER_STATS.total,
    OWNER_STATS.seenThisMonth,
    OWNER_STATS.withUpcoming,
    OWNER_STATS.inRecovery,
  ]);

  // THE SECOND HALF OF THE PREMISE, and it is visible rather than inferred: a
  // location-assigned viewer's filter offers ONLY their own locations, so the
  // select carries exactly the two the seed granted. An unassigned admin would
  // be offered every active location in the tenant, which the seed now makes
  // THREE - see ASSIGNED_LOCATIONS for why that number had to change before
  // this check meant anything.
  await expect(
    page.locator("select option[value]:not([value=''])"),
    "the filter offers a different number of locations than the seed assigned - this principal is " +
      "not the assigned one, so every timing below would be the cheap principal's (PERF-14)",
  ).toHaveCount(ASSIGNED_LOCATIONS);

  const first = await readPanel(page, "/patients (first click)");
  report("HYPOTHESIS 1+2: the first click after login", [first]);

  // The instrument itself must have worked. Not a budget - a wiring check.
  expect(first.serverMs).toBeGreaterThan(0);
  expect(first.spans.some((s) => s.name.startsWith("db:"))).toBe(true);

  /**
   * A HIT HERE MEANS THE FOUR NUMBERS ABOVE CAME OUT OF A CACHE, AND ON
   * 2026-09-06 THEY CAME OUT OF THE PREVIOUS FIXTURE'S.
   *
   * `unstable_cache` in `next dev` persists to `.next/dev/cache/fetch-cache` ON
   * DISK, so the entry survives the dev server that playwright starts and stops
   * around this suite. After `perf-seed-admin-stats.mjs` was corrected and the
   * database demonstrably held 56 and 153 - asserted by the seed, and read back
   * under `role authenticated` with the admin's own claims - this spec kept
   * failing its premise with 55 and 150, which were the numbers the PREVIOUS
   * seed produced. Clearing that directory made it pass on the next run.
   *
   * So the premise assertion above is only as good as the strip being fresh, and
   * this is the assertion that says so. It also matters for the TIMING: a cached
   * strip costs 0.3 ms and does not contend for the connection pool, which moves
   * `db:patients-list` on this lane from 722 ms to about 100.
   *
   *   rm -rf apps/web/.next/dev/cache/fetch-cache
   */
  expect(
    first.statStrip,
    "the stat strip was served from cache on the FIRST click, so both the four numbers asserted " +
      "above and every timing below describe an earlier state. Clear the dev data cache before " +
      "measuring: rm -rf apps/web/.next/dev/cache/fetch-cache",
  ).toBe("MISS");
});

test("/patients repeated: a stat-strip MISS against a HIT, same page, same principal", async ({
  page,
}) => {
  /**
   * A FRESH CACHE KEY IS FORCED, and the first version of this test is why.
   *
   * It loaded `/patients?probe=0..3` four times and demanded at least one MISS.
   * Every load was a HIT and it failed - correctly, by its own rule, and for a
   * reason that was about the TEST rather than the instrument: `probe` is not
   * part of the cache key, the previous test had already warmed the default
   * key, and the entry lives 60 seconds. Four loads inside one second can only
   * ever be four hits.
   *
   * `locationId` IS part of the key (`fetchPatientListStats` is keyed on tenant,
   * role, user and location), so filtering by a location nobody has queried
   * yet is a guaranteed miss, and repeating it is a guaranteed hit. Both arms
   * are now deterministic instead of depending on a clock.
   */
  await page.goto("/patients");
  const locationId = await page
    .locator("select option[value]:not([value=''])")
    .first()
    .getAttribute("value");
  if (!locationId) {
    throw new Error(
      "no location option on the filter bar, so a fresh cache key cannot be forced - the " +
        "MISS/HIT pair below would depend on a 60-second clock instead of on the key",
    );
  }

  const readings: Reading[] = [];
  for (let i = 0; i < 4; i++) {
    await page.goto(`/patients?location=${locationId}`);
    readings.push(await readPanel(page, `/patients?location=… load ${i + 1}`));
  }
  report("HYPOTHESIS 2: stat-strip cache miss vs hit", readings);

  // THE INSTRUMENT'S OWN NEGATIVE CONTROL, and it is the one measurement that
  // validates every other stat-strip number. `unstable_cache` must invoke its
  // callback on the caller's async context or the MISS mark is lost and every
  // miss reports as a hit. Across four consecutive loads at least one MISS and
  // at least one HIT must appear; if every reading says HIT, the mark is not
  // reaching the store and the instrument is lying in the safe-looking
  // direction.
  expect(
    readings[0]!.statStrip,
    "the FIRST load of a fresh cache key must be a MISS. If it reports HIT, the mark is not " +
      "reaching the span store and every miss in this report is a lie in the safe-looking " +
      "direction - see the note on the cached callback in list-queries.ts",
  ).toBe("MISS");
  expect(
    readings.slice(1).map((r) => r.statStrip),
    "loads 2-4 repeat the same key inside the 60s window and must all be HITs",
  ).toEqual(["HIT", "HIT", "HIT"]);
});

test("/patients paged and filtered: the list query away from page one", async ({ page }) => {
  const readings: Reading[] = [];
  await page.goto("/patients?page=40");
  readings.push(await readPanel(page, "/patients?page=40"));
  await page.goto("/patients?q=Silva");
  readings.push(await readPanel(page, "/patients?q=Silva"));
  report("The list query under paging and search", readings);
});

/**
 * THE READING THE OWNER'S IS COMPARABLE TO, AND THE OTHER TESTS ARE NOT.
 *
 * His production readings are of `/patients` with NO query string, taken more
 * than once: servidor 798.5 ms, `db:patients-list` 654.3 ms on the first load
 * and 657.6 / 626.1 on reload. Test 2 above deliberately loads
 * `/patients?location=…` to force a MISS then three HITs, and test 3 loads page
 * 40 and a search - all three are different queries. Neither can be set beside
 * his numbers without an asterisk, so this loads the default key, repeatedly,
 * the way a person clicking Pacientes twice does.
 *
 * IT ASSERTS NOTHING ABOUT THE DURATION, like every other test in this file. It
 * prints, and the reading goes on the card next to production's.
 */
test("/patients reloaded on the DEFAULT key: the shape the owner's reading has", async ({ page }) => {
  const readings: Reading[] = [];
  for (let i = 0; i < 4; i++) {
    await page.goto("/patients");
    readings.push(await readPanel(page, `/patients reload ${i + 1}`));
  }
  report("The owner's comparison: /patients, no query string, four loads", readings);
  expect(readings.every((r) => r.serverMs > 0)).toBe(true);
});

test("/admin/staff and /estatisticas: the other two surfaces the owner named", async ({ page }) => {
  const readings: Reading[] = [];
  await page.goto("/admin/staff");
  readings.push(await readPanel(page, "/admin/staff"));
  await page.goto("/estatisticas/painel");
  readings.push(await readPanel(page, "/estatisticas/painel"));
  await page.goto("/estatisticas/indicadores");
  readings.push(await readPanel(page, "/estatisticas/indicadores"));
  report("Administracao and Estatisticas", readings);
});
