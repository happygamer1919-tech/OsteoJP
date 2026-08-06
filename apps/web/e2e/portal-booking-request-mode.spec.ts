/**
 * portal-booking-request-mode.spec.ts — W13-04 (LOOP 4), the portal booking flow.
 *
 * Covers the two things LOOP 4 shipped that only a browser can prove:
 *
 *   1. DECISION C — preselection is never a restriction. The service step lists
 *      EVERY patient-bookable service. Nothing is filtered by the patient's
 *      history, and the step is never skipped on their behalf.
 *   2. REQUEST-MODE — a portal booking submits a PEDIDO, not a confirmed
 *      appointment, and the patient is told the time is only reserved once
 *      reception confirms (JP's option-B ruling, 2026-08-06).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT COVER, so the gap is visible rather than
 * assumed away: the POSITIVE preselection case, where a patient WITH a completed
 * appointment sees that service marked and lifted. seed-e2e.mjs creates no
 * appointments at all, so the seeded portal patient has no history and
 * `preselectedServiceId` resolves to null by design. Seeding a completed
 * appointment would change a fixture 55 specs share. That case is proven instead
 * by apps/api/lib/appointments/preselection.test.ts (14/14), which asserts the
 * wave doc's own DoD line on the SET of offered services. The remaining e2e gap
 * is carded on W13-04.
 *
 * THE NEGATIVE HALF IS THE HALF THAT CAN BREAK. "No history, so nothing is
 * preselected and everything is still offered" is exactly what fails if someone
 * turns the preselection into a filter — which is the mistake Decision C exists
 * to forbid. That is what this file asserts.
 *
 * Runs against the portal on http://localhost:3001 with apps/api on 3002, both
 * declared as webServers in playwright.config.ts. Chromium only, as with the
 * other portal spec.
 */

import { test, expect, type Page } from "@playwright/test";
import { PORTAL_BASE_URL, PORTAL_STORAGE } from "./fixtures";

test.use({
  storageState: PORTAL_STORAGE.patient,
  baseURL: PORTAL_BASE_URL,
});

/** The service step's rows. The flow renders one button per bookable service. */
function serviceRows(page: Page) {
  return page.getByRole("button").filter({ hasText: /min/ });
}

/**
 * Open /portal/booking and advance to the service step.
 *
 * The flow starts at step 1 (clinic) only when more than one active location
 * exists; with a single clinic it opens directly on step 2. Both are handled,
 * because which one applies depends on the seed and this spec is about the
 * SERVICE step either way.
 */
async function openServiceStep(page: Page): Promise<void> {
  await page.goto("/portal/booking");
  await expect(page).toHaveURL(/\/portal\/booking(\?|$)/, { timeout: 15_000 });

  const clinicHeading = page.getByRole("heading", { name: /cl[ií]nica/i });
  if (await clinicHeading.isVisible().catch(() => false)) {
    // Multi-clinic: pick the first offered clinic to reach the service step.
    await page.getByRole("button").filter({ hasText: /\S/ }).first().click();
  }

  // The service step is identified by its own heading, never by position.
  await expect(page.getByRole("heading", { name: /servi[çc]o/i })).toBeVisible({
    timeout: 15_000,
  });
}

test("Decision C: the service step offers every bookable service and preselects nothing for a patient with no history", async ({
  page,
}) => {
  await openServiceStep(page);

  const rows = serviceRows(page);

  // PRECONDITION, ASSERTED RATHER THAN ASSUMED. An empty catalog would make
  // every assertion below pass vacuously, so the emptiness itself fails here
  // and names why. patient_bookable is set by migration 0057's backfill, which
  // the E2E database runs; zero rows means that backfill did not reach the
  // seeded services, which is a real finding and not a flake.
  await expect(
    rows,
    "the portal catalog is EMPTY - no service has patient_bookable set in the E2E database",
  ).not.toHaveCount(0);

  const offered = await rows.count();

  // NOTHING IS MARKED. The seeded patient has no completed appointment, so
  // there is no usual service and the badge must not appear. If this ever fails,
  // preselection is being derived from something other than completed history.
  await expect(page.getByText("O seu serviço habitual")).toHaveCount(0);

  // THE STEP IS NOT SKIPPED. Advancing on the patient's behalf would remove the
  // choice rather than preselect within it. The service heading is still the one
  // on screen after the page settles.
  await expect(page.getByRole("heading", { name: /servi[çc]o/i })).toBeVisible();

  // EVERY ROW IS SELECTABLE. Not one is disabled or filtered out by history.
  for (let i = 0; i < offered; i += 1) {
    await expect(rows.nth(i)).toBeEnabled();
  }
});

test("Decision C: choosing a service advances the flow and does not narrow what was on offer", async ({
  page,
}) => {
  await openServiceStep(page);

  const rows = serviceRows(page);
  await expect(rows).not.toHaveCount(0);
  const before = await rows.count();

  await rows.first().click();

  // Forward: the date/time step.
  await expect(page.getByRole("heading", { name: /data|hora/i })).toBeVisible({
    timeout: 15_000,
  });

  // Back: the SAME set of services is still offered. A flow that narrowed the
  // list after a first choice would be a restriction introduced by the act of
  // choosing, which is the same defect Decision C forbids at the start.
  await page.getByRole("button", { name: /voltar|anterior/i }).first().click();
  await expect(page.getByRole("heading", { name: /servi[çc]o/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(serviceRows(page)).toHaveCount(before);
});

test("request-mode: the patient is told the time is NOT reserved until reception confirms", async ({
  page,
}) => {
  await openServiceStep(page);

  const rows = serviceRows(page);
  await expect(rows).not.toHaveCount(0);
  await rows.first().click();

  // JP's option-B wording, on the step where the patient is still choosing.
  // The exact sentence is the ruling in the patient's own words: the pedido
  // must not promise the slot.
  await expect(
    page.getByText(/só fica reservado depois de confirmado/i),
    "the option-B slot wording is missing from the date/time step",
  ).toBeVisible({ timeout: 15_000 });
});

test("request-mode: the confirmation screen says PEDIDO, never a finished booking", async ({
  page,
}) => {
  // The pending screen is reachable directly and is what the flow lands on after
  // a submit. Asserting it here rather than driving a full booking keeps this
  // test independent of slot availability on the seeded calendar, which varies
  // with the run day and would otherwise make a copy assertion flaky.
  await page.goto("/portal/booking/pending");
  await expect(page).toHaveURL(/\/portal\/booking\/pending(\?|$)/, { timeout: 15_000 });

  // "Pedido recebido", not "Marcação recebida". A pedido is not yet a marcação
  // and the heading no longer says it is.
  await expect(page.getByText(/pedido recebido/i)).toBeVisible();
  await expect(page.getByText(/marcação recebida/i)).toHaveCount(0);

  // The slot is not promised, and reception is named as who decides.
  await expect(page.getByText(/só fica reservado depois de confirmado/i)).toBeVisible();
  await expect(page.getByText(/rece[çc][ãa]o/i).first()).toBeVisible();
});
