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
import { becameVisible } from "./helpers";

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

  // ACC-immediate-isvisible-probes. This was `clinicHeading.isVisible()` - an
  // IMMEDIATE POLL, taken microseconds after a URL assertion that says nothing
  // about whether the heading has painted. A false reading here does not fail:
  // it SKIPS the clinic pick and carries on, which is the skip-shaped branch
  // that reads as a pass. Same question, same answer as sync-portal-agenda.
  const clinicHeading = page.getByRole("heading", { name: /cl[ií]nica/i });
  if (await becameVisible(clinicHeading, 5_000)) {
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

/**
 * Drive the booking flow to a submitted pedido. Returns false ONLY when the
 * seeded calendar offers no slot; every other failure THROWS.
 *
 * THAT SPLIT IS THE POINT AND IT IS THE LOOP 7 LESSON. The first version of the
 * sync spec's equivalent helper returned `null` for four different conditions -
 * no services, no slots, no submit control, the step never appearing - and the
 * caller skipped on all of them alike, so a BROKEN FLOW silently became a
 * skipped test inside a green run. Here an empty calendar is a legitimate skip
 * (it depends on the run day) and everything else is a defect that must be red.
 */
async function bookFirstAvailable(page: Page): Promise<boolean> {
  await openServiceStep(page);

  const service = serviceRows(page);
  if ((await service.count()) === 0) {
    throw new Error("service step offered no service - the catalog is seeded, so this is a defect");
  }
  await service.first().click();

  // A2's therapist step. "Escolham por mim" keeps the auto-assignment, which
  // keeps this test about the CONFIRMATION SCREEN rather than about one
  // therapist's calendar.
  const anyTherapist = page.getByRole("button", { name: /escolham por mim/i });
  await anyTherapist.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  if (await anyTherapist.count()) await anyTherapist.click();

  const dateTime = page.getByRole("heading", { name: /data|hora/i });
  // THE COMMENT THAT USED TO SIT HERE CLAIMED A WAIT THAT NEVER HAPPENED. It
  // read: "here it follows an explicit waitFor-style timeout on a heading that
  // is either present or the flow is broken". Two things were wrong with that.
  // The `{ timeout: 15_000 }` passed to `isVisible` is THE OPTION
  // playwright-core 1.60.0 IGNORES - it is the exact INC-10 shape - so there was
  // no waitFor-style timeout on this heading at all. And the `waitFor` a few
  // lines above is on `anyTherapist`, a DIFFERENT locator, so it could not have
  // been the wait the comment meant. A justification that names a wait which is
  // not there is worse than no justification: it stops the next reader looking.
  if (!(await becameVisible(dateTime.first(), 15_000))) {
    throw new Error("never reached the date/time step");
  }

  const trigger = page.getByRole("button", { name: /escolh|data/i });
  if ((await trigger.count()) === 0) throw new Error("date/time step has no date-picker trigger");
  await trigger.first().click();

  const dialog = page.getByRole("dialog");
  // Same shape, no justification comment at all: an ignored timeout polled
  // immediately after a click, so it read the frame before the dialog mounted.
  if (!(await becameVisible(dialog.first(), 10_000))) {
    throw new Error("the date picker did not open when clicked");
  }

  // THE LOCATORS ARE COPIED VERBATIM FROM sync-portal-agenda.spec.ts:244,273,
  // WHICH IS PROVEN IN CI. The first version of this helper invented its own and
  // both were wrong:
  //
  //   `getByRole("gridcell").filter({ hasNot: locator("[aria-disabled='true']") })`
  //     `hasNot` filters by DESCENDANT, not by the element's own attribute, so it
  //     matched every gridcell INCLUDING the disabled ones. The click then hung
  //     on a disabled button for the full 120s test budget - "element is not
  //     enabled", retried until timeout - three times, at 2.1 minutes each.
  //   `getByRole("radio")` unnamed
  //     matches any radio on the step, not only a time.
  //
  // `.and()` intersects on the ELEMENT, which is what was wanted. Enabled cells
  // carry no `aria-disabled` attribute at all, which is why `:not([aria-disabled])`
  // is right and `[aria-disabled='false']` would find nothing.
  //
  // DUPLICATED RATHER THAN SHARED, AND CARDED. sync-portal-agenda.spec.ts has a
  // fuller version of this traversal that took five sessions to stabilise.
  // Extracting it into a shared helper is the correct end state and is NOT done
  // here: that spec is PG8's, and refactoring it mid-bucket to save a duplication
  // would risk the one gate-bearing e2e in the repo for a tidy-up.
  // ACC-e2e-booking-traversal-duplicated.
  const days = page.getByRole("gridcell").and(page.locator(":not([aria-disabled])"));
  const slot = page.getByRole("radio", { name: /^\d{2}:\d{2}$/ });
  const dayCount = Math.min(await days.count(), 8);
  for (let i = 0; i < dayCount; i += 1) {
    await days.nth(i).click();
    await slot.first().waitFor({ state: "visible", timeout: 1_500 }).catch(() => {});
    if ((await slot.count()) > 0) break;
  }
  if ((await slot.count()) === 0) return false; // THE ONE LEGITIMATE SKIP.

  await slot.first().click();
  const advance = page.getByRole("button", { name: /^continuar$/i });
  if ((await advance.count()) === 0) throw new Error("date/time step offered no Continuar control");
  await advance.first().click();

  const submit = page.getByRole("button", { name: /confirmar marca/i });
  await submit.first().waitFor({ state: "visible", timeout: 15_000 });
  await submit.last().click();
  return true;
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

  // Forward: A2 INSERTED THE THERAPIST STEP HERE. This assertion used to expect
  // date/time directly and was correctly invalidated by A2 rather than being
  // wrong before - the flow genuinely gained a step, and the counter went 4 to 5.
  await expect(page.getByRole("heading", { name: /terapeuta/i })).toBeVisible({
    timeout: 15_000,
  });

  // "Escolham por mim" is FIRST and is a real button, not an absence. Taking it
  // preserves the pre-A2 auto-assignment exactly, which is what keeps this test
  // about SERVICE narrowing rather than about therapist availability - a
  // specific therapist would make the next step depend on that person's seeded
  // calendar.
  await page.getByRole("button", { name: /escolham por mim/i }).click();

  // Forward again: NOW the date/time step.
  await expect(page.getByRole("heading", { name: /data|hora/i })).toBeVisible({
    timeout: 15_000,
  });

  // Back TWICE, through the therapist step, to the service list. The SAME set of
  // services is still offered. A flow that narrowed the list after a first
  // choice would be a restriction introduced by the act of choosing, which is
  // the same defect Decision C forbids at the start.
  const backButton = page.getByRole("button", { name: /voltar|anterior/i }).first();
  await backButton.click();
  await expect(page.getByRole("heading", { name: /terapeuta/i })).toBeVisible({
    timeout: 15_000,
  });
  await backButton.click();
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

test("request-mode: the confirmation screen REFUSES to claim a booking it cannot verify", async ({
  page,
}) => {
  // ================================================================= //
  // THIS TEST WAS INVERTED 2026-08-13. SEC-pending-screen-asserts-nothing.
  // ================================================================= //
  // It used to navigate here directly and assert "Pedido recebido" was visible,
  // and its own comment explained why: "The pending screen is reachable directly
  // and is what the flow lands on after a submit. Asserting it here rather than
  // driving a full booking keeps this test independent of slot availability."
  //
  // THAT COMMENT WAS CORRECT ABOUT THE TEST AND WAS DESCRIBING A PRODUCT DEFECT.
  // The screen took an `id`, printed a decorative reference from it, and read no
  // row — so it told anyone who arrived that a request had been received. A back
  // button, a refresh after a FAILED submit, or a stale bookmark all produced a
  // success message for a booking that did not exist. The clinic learns nothing,
  // because nothing was written.
  //
  // AND THIS TEST WAS PINNING IT IN PLACE. It depended on the defect to stay
  // cheap, so fixing the product would have broken the test and the test would
  // have looked like the thing that was wrong.
  //
  // The screen now reads the patient's OWN appointment list (RLS self-scoped, so
  // a wrong id returns nothing rather than someone else's row) and fails closed.
  await page.goto("/portal/booking/pending");
  await expect(page).toHaveURL(/\/portal\/booking\/pending(\?|$)/, { timeout: 15_000 });

  // NO SUCCESS CLAIM, because no id was carried and nothing could be verified.
  await expect(
    page.getByText(/pedido recebido/i),
    "arriving with no id must NOT produce a success message",
  ).toHaveCount(0);

  // It says what happened and offers something to do, which is PG9's standard
  // for a dead end.
  await expect(page.getByText(/n[ãa]o encontr[áa]mos este pedido/i)).toBeVisible();
  await expect(page.getByText(/contacte a cl[íi]nica/i)).toBeVisible();

  // A FABRICATED ID IS REFUSED THE SAME WAY. This is the arm that matters most:
  // an implementation that merely checked `id` was PRESENT would satisfy the
  // assertions above and still confirm any booking anyone invented.
  await page.goto("/portal/booking/pending?id=00000000-0000-0000-0000-0000000000ff");
  await expect(
    page.getByText(/pedido recebido/i),
    "an id that belongs to no appointment of this patient must NOT be confirmed",
  ).toHaveCount(0);
  await expect(page.getByText(/n[ãa]o encontr[áa]mos este pedido/i)).toBeVisible();
});

test("request-mode: a REAL pedido still says PEDIDO, never a finished booking", async ({
  page,
}) => {
  // THE POSITIVE HALF, AND IT IS NOW LOAD-BEARING. With the screen failing
  // closed, every assertion in the test above is satisfied by a page that says
  // "not found" unconditionally — including for a patient who really did book.
  // This proves the success path still exists and still says the right thing.
  //
  // The copy assertions are the ones the original test carried: "Pedido
  // recebido" and not "Marcação recebida", the slot not promised, and reception
  // named as who decides.
  const booked = await bookFirstAvailable(page);
  test.skip(!booked, "no slot available on the seeded calendar for this run");

  await expect(page).toHaveURL(/\/portal\/booking\/pending\?id=/, { timeout: 30_000 });
  await expect(page.getByText(/pedido recebido/i)).toBeVisible();
  await expect(page.getByText(/marcação recebida/i)).toHaveCount(0);
  await expect(page.getByText(/só fica reservado depois de confirmado/i)).toBeVisible();
  await expect(page.getByText(/rece[çc][ãa]o/i).first()).toBeVisible();
});
