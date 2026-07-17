/**
 * agenda-location-filter.spec.ts - W9-02, CB QA item 1.
 *
 * Runs as ADMIN (default storageState). Selecting a location in the agenda
 * toolbar narrows the Terapeutas dropdown to that location's ASSIGNED
 * therapists. Before W9-02 no such predicate existed at all (W9-01 finding (f)),
 * so Castelo Branco listed Linda-a-Velha therapists. Consultório B stands in for
 * CB here: an LV-only therapist must not appear under it.
 *
 * OWNER RULING (2026-07-17), asserted below:
 *   Filter therapists by assigned location. Therapists with NO location
 *   assignment appear ONLY under "Todas as localizações", never inside a
 *   specific location view.
 *
 * This matches the Equipa list's already-shipped behaviour (W5-32,
 * equipa-location-filter.spec.ts) - the agenda was the surface still missing it.
 *
 * Seeded team↔location (seed-e2e.mjs:340-343):
 *   "E2E Terapeuta Clinica Unica"   → Linda-a-Velha only
 *   "E2E Terapeuta Varias Clinicas" → Linda-a-Velha + Consultório B
 *   "E2E Therapist"                 → NO availability rows (unassigned)
 *
 * Each filter change is a router transition, so every assertion waits on the URL
 * first and then polls the live option list - never a bare read that could race
 * the re-render.
 */
import { test, expect, type Page } from "@playwright/test";
import { LOCATION, LOCATION_B, futureDate, RUN_DAY_BASE } from "./fixtures";

const UNICA = "E2E Terapeuta Clinica Unica"; // Linda-a-Velha only
const MULTI = "E2E Terapeuta Varias Clinicas"; // Linda-a-Velha + Consultório B
const UNASSIGNED = "E2E Therapist"; // no availability anywhere

/**
 * Assert which therapists the Terapeutas select offers. Polls the live option
 * list so the check survives the router transition each filter change triggers.
 */
async function expectTherapists(
  page: Page,
  { present, absent }: { present: string[]; absent: string[] },
) {
  const options = () =>
    expect.poll(async () =>
      (await page.getByLabel("Terapeutas").locator("option").allTextContents()).map((t) =>
        t.trim(),
      ),
    );
  for (const name of present) await options().toContain(name);
  for (const name of absent) await options().not.toContain(name);
}

test("W9-02: agenda location filter narrows therapists to the selected location (CB QA item 1)", async ({
  page,
}) => {
  // Desktop viewport so the toolbar filters render.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/agenda?view=week&date=${futureDate(RUN_DAY_BASE + 30)}`);

  const locationFilter = page.getByLabel("Localização");
  await expect(locationFilter).toHaveValue("");

  // Default "Todas as localizações": the full roster, assigned or not.
  await expectTherapists(page, { present: [UNICA, MULTI, UNASSIGNED], absent: [] });

  // THE REPORTED BUG: pick a location the LV-only therapist does NOT work at.
  // Before W9-02 they were listed here. Also the OWNER RULING: the unassigned
  // therapist must not appear in a specific location view.
  await locationFilter.selectOption(LOCATION_B.id);
  await expect(page).toHaveURL(new RegExp(`location=${LOCATION_B.id}`));
  await expectTherapists(page, { present: [MULTI], absent: [UNICA, UNASSIGNED] });

  // Linda-a-Velha: both assigned therapists listed, the unassigned one not.
  await locationFilter.selectOption(LOCATION.id);
  await expect(page).toHaveURL(new RegExp(`location=${LOCATION.id}`));
  await expectTherapists(page, { present: [UNICA, MULTI], absent: [UNASSIGNED] });

  // "Todas as localizações" (value="") restores everyone, unassigned included.
  await locationFilter.selectOption("");
  await expect(page).not.toHaveURL(/location=/);
  await expectTherapists(page, { present: [UNICA, MULTI, UNASSIGNED], absent: [] });
});

test("W9-02: changing location clears a therapist filter the new location does not offer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/agenda?view=week&date=${futureDate(RUN_DAY_BASE + 30)}`);

  const therapistFilter = page.getByLabel("Terapeutas");
  const locationFilter = page.getByLabel("Localização");

  // Filter by the LV-only therapist at Linda-a-Velha.
  await locationFilter.selectOption(LOCATION.id);
  await expect(page).toHaveURL(new RegExp(`location=${LOCATION.id}`));
  await therapistFilter.selectOption({ label: UNICA });
  await expect(page).toHaveURL(/therapist=/);

  // Switch to a location where that therapist is not assigned. The therapist
  // filter must CLEAR rather than stay active-but-unselectable: otherwise the
  // grid silently narrows to a therapist the toolbar can no longer show.
  await locationFilter.selectOption(LOCATION_B.id);
  await expect(page).toHaveURL(new RegExp(`location=${LOCATION_B.id}`));
  await expect(page).not.toHaveURL(/therapist=/);
  await expect(therapistFilter).toHaveValue("");
});

test("W9-02: no regression - the 6-day grid and range chip survive the filter (W3-08, W4-17)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/agenda?view=week&date=${futureDate(RUN_DAY_BASE + 30)}`);
  await page.getByLabel("Localização").selectOption(LOCATION.id);
  await expect(page).toHaveURL(new RegExp(`location=${LOCATION.id}`));

  // W4-17 count chip still reports for the visible range under the filter.
  await expect(page.getByTestId("agenda-range-chip")).toContainText(/\d+ marca[çc]/);
  // W3-08 six-day week: Saturday present, Sunday never.
  await expect(page.getByText(/^sáb/i).first()).toBeVisible();
  await expect(page.getByText(/^dom/i)).toHaveCount(0);
});
