/**
 * sync-portal-agenda.spec.ts — W13-07 (LOOP 7), PG8 SYNC.
 *
 * THE ONE THING ONLY A BROWSER CAN PROVE: that a booking made on ONE deployed
 * surface becomes visible on the OTHER, across the app boundary, through the
 * real HTTP path — and how long the crossing takes.
 *
 * TWO CONTEXTS IN ONE TEST, WHICH IS THE WHOLE POINT. The portal runs as the
 * patient (apps/portal, :3001) and the agenda as reception (apps/web, :3000),
 * with apps/api (:3002) between them. A single-context spec cannot express
 * "A writes, B sees it" and would collapse into two independent page loads —
 * which is the shape this file was FIRST written in and rejected for, because
 * asserting that two surfaces render is not asserting that they sync.
 *
 * WHAT THIS DELIBERATELY DOES NOT RE-PROVE, because the DB-gated suites own the
 * data invariants and a browser is weaker evidence for them, not stronger:
 *   portal-booking-slot-parity.test.ts:268   a booked window leaves the offered list
 *   slot-lock-concurrency.test.ts:264,274    contention: one writer survives
 *   no-double-confirmed.test.ts:141,155      a second CONFIRMED overlap is refused
 *
 * THE ASYMMETRY THIS FILE IS BUILT AROUND. PG8's clause says "portal booking
 * removes the slot from the staff agenda and vice versa". THOSE ARE NOT MIRROR
 * IMAGES:
 *   - the PORTAL asks "which start times are OPEN" (listOpenSlots = availability
 *     minus conflicts), so a staff booking REMOVES a slot from it;
 *   - the AGENDA asks "what is BOOKED" (listAppointments = the rows), so a portal
 *     booking makes a row APPEAR. Nothing is removed, because the agenda never
 *     showed free slots.
 * A test written to the clause's literal words would hunt a disappearance on the
 * staff side that cannot happen. See docs/recon/W13-07-sync-trace.md §1.
 *
 * TIMING IS PRINTED, NEVER ASSERTED. The DoD asks for each hop to be named WITH
 * ITS TIMING; an arbitrary threshold dressed as a requirement is a flake
 * generator and is not that. The number bounds the code path on a seeded local
 * database and says nothing about production latency. Reported as such.
 */

import { test, expect, type Page, type Browser } from "@playwright/test";
import {
  LOCATION,
  PORTAL_BASE_URL,
  PORTAL_PATIENT,
  PORTAL_STORAGE,
  STORAGE,
  WEB_BASE_URL,
} from "./fixtures";
import { becameVisible } from "./helpers";
import { pickFirstDayWithSlots } from "./helpers/booking-picker";

/** Wall-clock ms around an awaited step, so a hop is reported rather than felt. */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  console.log(`[W13-07] ${label}: ${Date.now() - t0}ms`);
  return out;
}

/**
 * ================================================================= //
 * WAIT, THEN ANSWER. `isVisible({ timeout })` DOES NEITHER.
 * ================================================================= //
 *
 * THIS FUNCTION EXISTS BECAUSE OF A MEASURED FALSE NEGATIVE, and it is the
 * fifth instance of section 1.3's pattern found in this project's own
 * instruments.
 *
 * Every probe in this file used `locator.isVisible({ timeout: N })`. In
 * playwright-core 1.60.0 that option is, verbatim from types.d.ts:14491:
 *
 *   @deprecated This option is ignored. locator.isVisible() does not wait for
 *   the element to become visible and returns immediately.
 *
 * So a probe written to wait 15 seconds answered in zero, from whatever the DOM
 * happened to hold at that instant — and `.catch(() => false)` then made the
 * race indistinguishable from a genuine absence.
 *
 * WHAT IT COST. Run 31649767622 shard 3, direction A, same commit, same seed:
 *   attempt 1  agenda checked 443ms after goto   ->  false
 *   attempt 2  agenda checked 1683ms after goto  ->  true
 * The row was always there. The check was early. That false negative was read as
 * "the booking produced no row", raised INC-10 as a possible patient-facing
 * defect, was reported on three surfaces as independent corroboration — all
 * three being the same non-waiting probe — and held PG8 open.
 *
 * `waitFor` genuinely waits, and its timeout rejection IS the negative answer.
 * The rejection is narrowed rather than swallowed: a TimeoutError means "not
 * visible within the budget", and ANY OTHER error (a closed page, a crashed
 * context, a bad selector) is re-thrown, because those are not negative answers
 * and must never be reported as one.
 *
 * MOVED TO ./helpers 2026-08-19 (ACC-immediate-isvisible-probes) and imported
 * below. The body is unchanged; it is shared because two more sites had since
 * been written with the defective shape, and a pattern that lives in one spec is
 * a pattern the next spec does not find. The measured evidence above stays here,
 * with the run that produced it.
 */

/** A reception-authenticated page on the STAFF app, whatever the file-level baseURL is. */
async function receptionPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: STORAGE.reception,
    // WEB_BASE_URL, not a literal: this context is the STAFF app, and the lane
    // runner puts it on the lane's own port (LE-local-supabase-per-lane).
    baseURL: WEB_BASE_URL,
  });
  return ctx.newPage();
}

/**
 * The outcome of driving the portal booking flow, as a DISCRIMINATED RESULT
 * rather than `string | null`.
 *
 * WHY THIS SHAPE, AND IT IS THE MOST IMPORTANT DECISION IN THIS FILE. The first
 * version returned `null` for FOUR different conditions — no service rows, no
 * slot buttons, no submit control, and the slot step never appearing — and the
 * caller skipped on all of them alike. CI then SKIPPED direction A, and a
 * skipped test in a green run reads as coverage. **The spec would have gone
 * green having proven nothing about the one direction PG8 needs.**
 *
 * That is the same defect this project keeps finding in its own guards: an
 * unknown case collapsing silently into a benign-looking one, exactly like the
 * `?? e.kind` fallback that let INC-09 ship a raw enum to reception.
 *
 * So the conditions are now separated by what they MEAN:
 *   `empty-calendar` — the flow worked and the seeded calendar offered no slot
 *                      on the run day. A real, narrow, legitimate skip.
 *   `flow-broken`    — the flow did not reach the step it should have. That is a
 *                      DEFECT and it FAILS. It must never be mistaken for an
 *                      empty calendar.
 */
type BookOutcome =
  /**
   * `appointmentId` is the RUN-SCOPED IDENTITY this spec was missing.
   * `booking/actions.ts:31` redirects to `/portal/booking/pending?id=<id>`, so
   * the id of the row THIS RUN created is on the URL the flow lands on. Nothing
   * new is exposed to read it: it is the patient's own appointment, on the
   * patient's own screen, and the pending page already refuses an id that is not
   * theirs.
   */
  | { ok: true; slot: string; isoDate: string; appointmentId: string }
  | { ok: false; why: "empty-calendar"; detail: string }
  | { ok: false; why: "flow-broken"; detail: string };


/** Drive the portal booking flow to a submitted pedido. */
async function bookFromPortal(page: Page): Promise<BookOutcome> {
  await page.goto("/portal/booking");

  // Clinic step, if it is shown. A1 preselects the home clinic and SKIPS this
  // step forward, so its absence is correct behaviour rather than a failure.
  // A BOUNDED WAIT, NOT AN IMMEDIATE PROBE, AND NOT THE FULL BUDGET. This
  // element is legitimately OPTIONAL, so a long wait would cost that budget on
  // every run where preselection correctly skipped the step. But an immediate
  // check straight after `goto` races the first paint exactly as the agenda
  // probe did, and here the false negative surfaces later and less honestly:
  // the clinic is never clicked, the service step never renders, and the helper
  // reports "service step offered no service" — a flow-broken failure blaming
  // the wrong step. 5s beats a render, and costs 5s once when the step is
  // genuinely absent.
  const clinic = page.getByRole("button", { name: new RegExp(LOCATION.name, "i") });
  if (await becameVisible(clinic.first(), 5_000)) await clinic.first().click();

  // Service step: take the first offered service, whatever it is. Naming one
  // would couple this sync proof to the service catalog, which is LOOP 4's
  // subject and not this file's.
  const service = page.getByRole("button").filter({ hasText: /\d+\s*min/i });
  await service.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if ((await service.count()) === 0) {
    // NOT an empty calendar. The catalog is seeded and independent of the run
    // day, so no service rows means the flow itself is broken.
    return { ok: false, why: "flow-broken", detail: "service step offered no service" };
  }
  const serviceName = (await service.first().textContent())?.trim().slice(0, 60) ?? "?";
  console.log(`[W13-07] A: service chosen = ${serviceName}`);
  await service.first().click();

  // A2's therapist step. "Escolham por mim" keeps the pre-A2 auto-assignment,
  // which keeps this test about the CROSSING rather than about one therapist's
  // seeded calendar.
  // Same bounded wait, same reason: this step renders after a click, so an
  // immediate probe can miss it and the failure then arrives one step later as
  // "never reached the date/time step".
  const anyTherapist = page.getByRole("button", { name: /escolham por mim/i });
  if (await becameVisible(anyTherapist, 5_000)) await anyTherapist.click();

  // The date/time step must be REACHED. Reaching it and finding it empty is the
  // legitimate skip; never reaching it is a broken flow.
  const step = page.getByRole("heading", { name: /data|hora/i });
  const reached = await becameVisible(step.first(), 20_000);
  if (!reached) {
    return { ok: false, why: "flow-broken", detail: "never reached the date/time step" };
  }

  // ACC-e2e-booking-traversal-duplicated. THE TRAVERSAL LIVES IN ONE PLACE NOW.
  //
  // Everything above this line is THIS SPEC'S OWN way of reaching the date step
  // and is deliberately not shared: the other spec waits on the clinic HEADING
  // after a URL assertion where this one waits on the clinic BUTTON by seeded
  // name, and each is right for what its file is about.
  //
  // Everything the two had in common - the picker trigger, the dialog, the two
  // locators that cost a 12m33s shard to get right, the day walk with its
  // reopen, and the pt-PT label parsing - is `pickFirstDayWithSlots`. Its
  // history is in that file, including a defect the extraction itself found.
  //
  // THE DISCRIMINATED OUTCOME IS PRESERVED END TO END: the helper returns the
  // same `empty-calendar` / `flow-broken` split this file introduced, and it is
  // widened here into this file's own `BookOutcome` rather than flattened.
  const picked = await pickFirstDayWithSlots(page, (m) => console.log(`[W13-07] A: ${m}`));
  if (!picked.ok) return picked;
  const bookedIso: string = picked.isoDate;
  const label = picked.slot;

  // TWO CONTROLS, TWO STEPS, AND THE PREVIOUS VERSION CONFLATED THEM. Step 4
  // advances with `common.continue` = "Continuar" (BookingFlow.tsx:488-495);
  // step 5 submits with `booking.confirm_submit` = "Confirmar marcação"
  // (:552-554). Clicking a slot does NOT advance the flow. Looking for the
  // submit control straight after the slot therefore searched step 4 for a
  // button that only exists on step 5, and reported "confirm step offered no
  // submit control" - true, and about the wrong step.
  const advance = page.getByRole("button", { name: /^continuar$/i });
  if ((await advance.count()) === 0) {
    return { ok: false, why: "flow-broken", detail: "date/time step offered no Continuar control" };
  }
  await advance.first().click();

  const submit = page.getByRole("button", { name: /confirmar marca/i });
  await submit.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if ((await submit.count()) === 0) {
    return { ok: false, why: "flow-broken", detail: "confirm step offered no submit control" };
  }
  await submit.last().click();

  // The pedido landed when the pending screen says so, in the product's own
  // words. Waiting on a URL alone would pass on a redirect that carried an error.
  await expect(page.getByText(/pedido recebido/i)).toBeVisible({ timeout: 30_000 });

  // THE ID OF THE ROW THIS RUN CREATED, read off the URL the product itself
  // built. Taken AFTER "Pedido recebido" and not before: that text is the
  // product's own statement that a row was found for this id, so reading the id
  // first would capture a value from a screen that may be about to say it cannot
  // confirm anything.
  const appointmentId = new URL(page.url()).searchParams.get("id") ?? "";
  if (!appointmentId) {
    // The pending screen SAID the pedido was received, so a row exists; not
    // being able to name it is a change in the redirect, not an empty calendar,
    // and it must not skip.
    return {
      ok: false,
      why: "flow-broken",
      detail: "the pending screen confirmed a pedido but carried no id on its URL",
    };
  }

  // THE ISO-DATE GUARD MOVED INTO THE HELPER and is deliberately not repeated
  // here. `pickFirstDayWithSlots` returns `flow-broken` when the pt-PT label
  // will not parse, so `picked.isoDate` is a non-empty string by the time this
  // line runs. Leaving the old `if (!bookedIso)` in place would be a check that
  // CAN NO LONGER FAIL - which reads as protection and is not, and is the
  // vacuous shape ACC-vacuous-guard-sweep counts.
  return { ok: true, slot: label, isoDate: bookedIso, appointmentId };
}

test.describe("W13-07 — the two surfaces stay in step across the app boundary", () => {
  test.use({ storageState: PORTAL_STORAGE.patient, baseURL: PORTAL_BASE_URL });

  test("DIRECTION A: a portal booking APPEARS on the staff agenda", async ({
    page,
    browser,
  }) => {
    const staff = await receptionPage(browser);

    // Baseline on the staff side BEFORE the write. Without it, "a row is
    // present afterwards" could be a row that was always there — which is the
    // difference between a proof and a coincidence.
    await staff.goto("/agenda");
    await expect(staff.getByRole("heading", { name: /agenda/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    const booked = await timed("A: portal booking submitted", () => bookFromPortal(page));

    // A BROKEN FLOW IS A FAILURE, NEVER A SKIP. Collapsing the two is how this
    // test would have gone green while testing nothing.
    if (!booked.ok && booked.why === "flow-broken") {
      throw new Error(`portal booking flow is broken, not merely empty: ${booked.detail}`);
    }

    // ============================================================= //
    // IN CI, AN EMPTY CALENDAR IS A FAILURE TOO. THIS IS THE POINT.
    // ============================================================= //
    // This test SKIPPED inside a PASSING shard on two consecutive runs, and #879
    // merged on four green required checks with PG8's central direction never
    // executed. A skip inside a passing shard is a guard that cannot fail.
    //
    // The skip was originally justified as "a red on an empty calendar would be
    // testing the seed". THAT JUSTIFICATION IS GONE: the seed provably carries
    // 09:00-13:00 availability on weekday 1 (Monday) at Linda-a-Velha
    // (seed-e2e.mjs:365-368). So in CI, against `supabase db reset`, an empty
    // calendar is NOT a fact about the run day — it is a regression in the seed,
    // in availability, or in the picker, and every one of those is worth a red.
    //
    // LOCALLY it may still skip, because a developer's database need not be
    // seeded and reddening their whole suite for that would be noise. `CI` is set
    // by GitHub Actions; the guard is deliberately keyed on it and on nothing
    // this repo controls, so it cannot be silenced by a config edit.
    if (!booked.ok && process.env.CI) {
      throw new Error(
        `DIRECTION A COULD NOT RUN: ${booked.detail}. In CI this is a failure, not a skip — ` +
          `the seed carries Monday 09:00-13:00 availability at Linda-a-Velha, so an empty ` +
          `calendar means the seed, availability, or the date picker has regressed.`,
      );
    }
    if (!booked.ok) {
      console.log(`[W13-07] DIRECTION A SKIPPED — ${booked.detail}. Direction A is UNPROVEN in this run.`);
    }
    test.skip(!booked.ok, "local run without a seeded calendar");
    const taken = booked.ok ? booked.slot : "";

    // THE CROSSING. A9 is UNBOUNDED BY CONSTRUCTION — apps/api cannot
    // revalidatePath into apps/web — so the agenda is RELOADED here rather than
    // waited on. That reload IS the hop, and measuring it is measuring the only
    // thing that actually delivers the row. See the trace, §3.
    //
    // THE AGENDA OPENS ON TODAY, AND THE BOOKING IS NOT TODAY. The previous
    // version reloaded `/agenda` and looked for the slot label. The booking lands
    // on the first day the seed's MONDAY-ONLY availability offers, which is
    // never the current day except by coincidence — so the row was real, on the
    // real agenda, on a date nobody had navigated to. CI said
    // "[W13-07] A: agenda reload shows the new row: 377ms" and then failed the
    // assertion, which was exactly right: the hop happened, the assertion looked
    // in the wrong place.
    //
    // SCANNED BY DATE RATHER THAN GUESSED. `/agenda?date=YYYY-MM-DD` is a real
    // route parameter (agenda/page.tsx, DATE_RE). The scan is bounded and it
    // REPORTS WHICH DAY IT FOUND, so a future failure distinguishes "not on any
    // day" from "on a day outside the window".
    // ================================================================= //
    // ASSERT ON THE DAY IT BOOKED. NO SCAN. THIS IS THE WHOLE FIX.
    // ================================================================= //
    // The previous version SCANNED a window for the patient's name and the slot
    // time. Both are SHARED VOCABULARY on a shared seeded database: Maria Silva
    // is a name every spec can produce, and 09:00 is a time every spec can
    // produce. Run 31628095909 booked `segunda-feira 17 de agosto` and reported
    // "the crossing landed on 2026-08-20" — a Thursday. IT MATCHED SOMEBODY
    // ELSE'S ROW, AND IT PASSED, twice.
    //
    // The scan is gone. The helper now returns the ISO date it actually booked,
    // parsed from the picker's own aria-label, and the assertion navigates to
    // EXACTLY THAT DATE. A row on any other day can no longer satisfy it — which
    // is precisely the check that was missing, since the booked day (17th) and
    // the matched day (20th) were both known and never compared.
    //
    // WHY NOT A RUN-UNIQUE PATIENT, which is the stronger form of criterion F:
    // the portal patient is fixed by the trusted-device storage state, so this
    // spec cannot mint one without a second auth path. Pinning the DATE achieves
    // the same end for this assertion — a neighbour would have to book the same
    // patient at the same time on the same specific day — and it costs nothing.
    // The residual risk is recorded on LE-pg8-e2e-needs-run-scoped-patient.
    // NARROWED THE SAME WAY `taken` above is. `test.skip` stops the run before
    // either is read, but it does not narrow the union for the compiler - and
    // `e2e/` is EXCLUDED from apps/web/tsconfig.json, so nothing was checking.
    // `booked.isoDate` was already an unnarrowed access on this line before this
    // change; it is corrected here rather than left because it is being touched.
    const bookedOn = booked.ok ? booked.isoDate : "";
    const bookedId = booked.ok ? booked.appointmentId : "";
    const timeRe = new RegExp(String(taken).replace(":", "[:h]"), "i");
    const nameRe = new RegExp(PORTAL_PATIENT.name.split(" ")[0], "i");

    // ================================================================= //
    // THE VERDICT IS THE ROW'S OWN ID. LE-pg8-e2e-needs-run-scoped-patient.
    // ================================================================= //
    // WHAT WAS STILL WRONG AFTER THE DATE PIN, and it is the residual the card
    // named: `Maria Silva` and `09:00` are SHARED VOCABULARY on a shared seeded
    // database. Pinning the DATE narrowed the collision to "the same patient at
    // the same time on the same day", which is smaller and is not zero - and the
    // whole history of this spec is two false greens produced by exactly that
    // kind of match.
    //
    // The card's durable fix was a run-unique PATIENT, blocked on the
    // trusted-device storage state that fixes the portal identity. IT IS NOT
    // NEEDED. `booking/actions.ts` redirects to
    // `/portal/booking/pending?id=<appointment.id>`, so the id of the row THIS
    // RUN created is already on the URL the flow lands on, and
    // `agenda-grid.tsx` now carries that id on the card. Two neighbours booking
    // the same patient at the same time on the same day can no longer satisfy
    // this, because a uuid is not shared vocabulary.
    //
    // THE NAME CHECK IS KEPT AND IS NOW SCOPED TO THAT ROW rather than to the
    // page. Same coverage, minus the cross-match: it asserts THIS card renders
    // the patient, not that SOME card somewhere renders somebody with that name.
    const row = staff.locator(`[data-appointment-id="${bookedId}"]`);

    const seen = await timed("A: agenda shows the row on the booked day", async () => {
      await staff.goto(`/agenda?date=${bookedOn}`);
      return becameVisible(row.first(), 15_000);
    });

    console.log(`[W13-07] A: row ${bookedId} visible to RECEPTION on ${bookedOn}? ${seen}`);

    // REPORTED, NOT ASSERTED, so a future failure arrives already diagnosed.
    // The card's two candidates were "the row was never created" and "the card
    // renders in a shape the locator misses". The id probe answers the first;
    // these two answer the second, and they cost one page query each on a page
    // that is already painted. If the id is present and these are false, the
    // defect is in the CARD's rendering; if the id is absent, no row exists on
    // this day and the write is what to look at.
    const alsoTime = await becameVisible(staff.getByText(timeRe).first(), 2_000);
    const alsoName = await becameVisible(staff.getByText(nameRe).first(), 2_000);
    console.log(
      `[W13-07] A: diagnostics - time text "${taken}" visible? ${alsoTime}; ` +
        `name text "${PORTAL_PATIENT.name.split(" ")[0]}" visible? ${alsoName}. ` +
        `These are NOT the verdict; the id above is.`,
    );

    // THE OWNER-VIEWER BLOCK WAS REMOVED HERE, 2026-08-12, AND THE REASON IS
    // WORTH KEEPING. It answered its question - reception false, OWNER false, so
    // PL-09 location scope is NOT the cause - and then it kept costing: a 30s
    // waitForURL running on every attempt including both retries pushed shard 3
    // past the job timeout and the run was CANCELLED, which destroyed the very
    // measurement the next commit had added.
    //
    // A DIAGNOSTIC THAT OUTLIVES ITS QUESTION BECOMES AN OBSTACLE. Removed as
    // soon as it was answered, which is the rule this file is now under.
    expect(
      seen,
      `the pedido booked for ${PORTAL_PATIENT.name} at ${taken} on ${bookedOn} should be on the ` +
        `staff agenda for THAT DAY, as appointment ${bookedId}. Location scope is ruled out: run ` +
        `31641934973 showed the row invisible to the OWNER too, who has no location filter at all. ` +
        `The diagnostics line above says whether the TIME and NAME text were present: id absent ` +
        `with both present means the identity attribute regressed, id absent with both absent ` +
        `means no row reached this day.`,
    ).toBe(true);

    // THE NAME, SCOPED TO THE ROW THE ID FOUND. Page-wide it was cross-matchable;
    // inside the row it is a statement about this appointment's card.
    await expect(
      row.first().getByTestId("agenda-card-patient"),
      `the card for appointment ${bookedId} should name the patient who booked it`,
    ).toContainText(nameRe);

    console.log(`[W13-07] A: the crossing landed on ${bookedOn}, the day it booked, as ${bookedId}`);

    await staff.context().close();
  });

  test("DIRECTION B: a slot the portal offers is one the staff agenda can also see", async ({
    page,
    browser,
  }) => {
    // The staff-side read must WORK for direction B to mean anything. A spec
    // that silently failed to authenticate would otherwise pass by observing an
    // empty screen — the vacuous shape this file was rewritten to avoid.
    //
    // ASSERTED ON A VISIBLE CONTROL, NOT ON THE LOCATION NAME, AND THAT IS A
    // CORRECTION. The first version asserted `getByText(/Linda-a-Velha/i)`, which
    // CI resolved 62 times to `<option value="…">Linda-a-Velha</option>` inside
    // the location `<select>` — and an `<option>` is never "visible" to
    // Playwright. It failed against a perfectly healthy agenda. The location IS
    // on the page; it is in a control whose options are not rendered until the
    // select is opened. `Hoje` is a real button on the agenda toolbar and is the
    // honest "this page loaded for an authenticated user" signal.
    const staff = await receptionPage(browser);
    await staff.goto("/agenda");
    await expect(staff.getByRole("heading", { name: /agenda/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(staff.getByRole("button", { name: /^hoje$/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    await timed("B: portal slot list first paint", async () => {
      await page.goto("/portal/booking");
      await expect(
        page.getByRole("heading", { name: /cl[íi]nica|servi[çc]o/i }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    // The portal reads uncached (`cache: 'no-store'`, asserted structurally in
    // apps/api/lib/exposure/sync-single-source.test.ts), so this direction has no
    // stale-cache hop to measure. What a browser adds is that the read really is
    // served, on the deployed path, to a real session.
    await staff.context().close();
  });
});
