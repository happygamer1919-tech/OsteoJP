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
 * A CORRECTION THIS FILE CARRIES ON PURPOSE. An earlier draft asserted that the
 * seeded portal patient had NO history, and carded the positive preselection
 * case as impossible to cover. That was wrong, and it was wrong for an
 * embarrassing reason: the grep behind it searched `apps/web/e2e/seed-e2e.mjs`,
 * a path that does not exist (the file is `apps/web/e2e/seed/seed-e2e.mjs`), and
 * the empty result was read as evidence of absence.
 *
 * THE SEED DOES CREATE ONE. `ensureDeclaracaoAppointment` gives Maria Silva a
 * COMPLETED Osteopatia appointment (2022-03-15), and fixtures.ts:238 records that
 * "Maria Silva's patient row doubles as the portal test patient". So the portal
 * patient has exactly the history Decision C preselects from, and the positive
 * case is not only coverable, it is the DEFAULT state of the fixture.
 *
 * So this file now asserts the WHOLE rule rather than half of it: the usual
 * service is marked, AND every other bookable service is still offered. The
 * second half is the one that fails if someone turns preselection into a
 * filter — the mistake Decision C exists to forbid.
 *
 * Runs against the portal on http://localhost:3001 with apps/api on 3002, both
 * declared as webServers in playwright.config.ts. Chromium only, as with the
 * other portal spec.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  LOCATION,
  PORTAL_BASE_URL,
  PORTAL_STORAGE,
  SERVICE,
  SERVICE_UNMAPPED,
} from "./fixtures";

test.use({
  storageState: PORTAL_STORAGE.patient,
  baseURL: PORTAL_BASE_URL,
});

/**
 * The service step's rows. Each renders "<duration> min", which the step's own
 * heading and the "Anterior" control do not, so the duration is what identifies
 * a service row without depending on a class name.
 */
function serviceRows(page: Page) {
  return page.getByRole("button").filter({ hasText: /\d+\s*min/ });
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
    // Multi-clinic: pick the SEEDED clinic BY NAME. The first draft clicked the
    // first button on the page, which is the "Anterior" control in the header -
    // it navigated away and every assertion then timed out waiting for a step it
    // had already left. locations[].name is passed through locationDisplayName,
    // which only rewrites "OsteoJP (LV)"-style short codes and returns anything
    // else verbatim, so the seeded "Linda-a-Velha" is the accessible name.
    await page.getByRole("button", { name: LOCATION.name }).click();
  }

  // The service step is identified by its own heading, never by position.
  await expect(page.getByRole("heading", { name: /servi[çc]o/i })).toBeVisible({
    timeout: 15_000,
  });
}

test("Decision C: the usual service is MARKED, and every other bookable service is still offered", async ({
  page,
}) => {
  await openServiceStep(page);

  const rows = serviceRows(page);

  // PRECONDITION, ASSERTED RATHER THAN ASSUMED. An empty catalog would make
  // every assertion below pass vacuously, so the emptiness itself fails here and
  // names why. This exact assertion caught the seed never setting
  // patient_bookable — migrations run BEFORE the seed, so 0057's backfill saw an
  // empty services table and flipped nothing.
  await expect(
    rows,
    "the portal catalog is EMPTY - no service has patient_bookable set in the E2E database",
  ).not.toHaveCount(0);

  // PRESELECTION HAPPENED. The seeded portal patient (Maria Silva) has one
  // COMPLETED appointment, for Osteopatia, so that is her usual service.
  const badge = page.getByText("O seu serviço habitual");
  await expect(badge).toHaveCount(1); // exactly one, never several

  // AND IT IS ON THE RIGHT ROW. A badge on the wrong service would still satisfy
  // a bare count, so the row that carries it is named.
  await expect(
    rows.filter({ hasText: SERVICE.name }).filter({ hasText: "O seu serviço habitual" }),
  ).toHaveCount(1);

  // *** THE DECISION C INVARIANT, AND THE REASON THIS TEST EXISTS. *** The other
  // bookable service is STILL OFFERED. History preselects; it never removes an
  // option the patient is entitled to book. This is the assertion that fails the
  // moment someone turns the preselection into a filter.
  await expect(rows.filter({ hasText: SERVICE_UNMAPPED.name })).toHaveCount(1);

  // THE STEP IS NOT SKIPPED. Advancing on the patient's behalf would remove the
  // choice rather than preselect within it.
  await expect(page.getByRole("heading", { name: /servi[çc]o/i })).toBeVisible();

  // EVERY ROW IS SELECTABLE — the preselected one and the others alike.
  const offered = await rows.count();
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

/*
 * REMOVED, and the reason is recorded rather than the test quietly deleted: a
 * draft here asserted the option-B slot wording on the DATE/TIME step. It
 * renders on step 4, the confirm summary (BookingFlow.tsx:283-305), which is
 * only reachable after picking a date AND a free slot - so the assertion would
 * have depended on the seeded calendar having availability on the run day.
 *
 * The same wording is asserted twice already, without that dependency: on the
 * pending screen below, and against the string itself in
 * apps/web/lib/notifications/pending-requests.test.ts, which pins
 * booking.step_info_pending to the phrase. Nothing is lost by dropping it here.
 */

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
