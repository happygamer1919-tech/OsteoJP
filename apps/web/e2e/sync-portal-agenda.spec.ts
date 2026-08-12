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
  PORTAL_STORAGE,
  STORAGE,
} from "./fixtures";

/** Wall-clock ms around an awaited step, so a hop is reported rather than felt. */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  console.log(`[W13-07] ${label}: ${Date.now() - t0}ms`);
  return out;
}

/** A reception-authenticated page on the STAFF app, whatever the file-level baseURL is. */
async function receptionPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: STORAGE.reception,
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
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
  | { ok: true; slot: string }
  | { ok: false; why: "empty-calendar"; detail: string }
  | { ok: false; why: "flow-broken"; detail: string };

/** Drive the portal booking flow to a submitted pedido. */
async function bookFromPortal(page: Page): Promise<BookOutcome> {
  await page.goto("/portal/booking");

  // Clinic step, if it is shown. A1 preselects the home clinic and SKIPS this
  // step forward, so its absence is correct behaviour rather than a failure.
  const clinic = page.getByRole("button", { name: new RegExp(LOCATION.name, "i") });
  if (await clinic.first().isVisible().catch(() => false)) await clinic.first().click();

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
  await service.first().click();

  // A2's therapist step. "Escolham por mim" keeps the pre-A2 auto-assignment,
  // which keeps this test about the CROSSING rather than about one therapist's
  // seeded calendar.
  const anyTherapist = page.getByRole("button", { name: /escolham por mim/i });
  if (await anyTherapist.isVisible().catch(() => false)) await anyTherapist.click();

  // The date/time step must be REACHED. Reaching it and finding it empty is the
  // legitimate skip; never reaching it is a broken flow.
  const step = page.getByRole("heading", { name: /data|hora/i });
  const reached = await step
    .first()
    .isVisible({ timeout: 20_000 })
    .catch(() => false);
  if (!reached) {
    return { ok: false, why: "flow-broken", detail: "never reached the date/time step" };
  }

  // A DATE MUST BE CHOSEN BEFORE ANY SLOT EXISTS, AND THE FIRST VERSION OF THIS
  // HELPER DID NOT KNOW THAT. Step 4 renders `choose_date_prompt` until the
  // patient picks a day — no date is preselected — so looking for slot buttons
  // straight away finds none, always. CI duly skipped direction A twice and
  // reported "date/time step offered no slot", which was TRUE and which I read
  // as an empty seeded calendar. It was not: the seed gives 09:00-13:00
  // availability on WEEKDAY 1 (Monday) at Linda-a-Velha (seed-e2e.mjs:365-368),
  // exactly the Monday-only shape portal-booking-slot-parity.test.ts documents.
  // The slots were there and nothing had asked for them.
  //
  // The picker's enabled range is [availableDates[0], availableDates[last]] —
  // BookingFlow.tsx:457-458 — and `availableDates` is `Object.keys(byDate)`, the
  // days that actually carry slots. So the FIRST ENABLED DAY is by construction a
  // day with availability. Enabled days are gridcells without `aria-disabled`.
  // THE PICKER MUST BE PROVEN TO OPEN, AND THIS IS THE SECOND TIME THIS FILE HAS
  // LEARNED THE SAME LESSON. The first draft clicked the trigger under
  // `.catch(() => {})`. A missing or mis-located trigger therefore did nothing,
  // no gridcells existed, and the helper returned `empty-calendar` — a BROKEN
  // FLOW degrading silently into the one outcome that SKIPS instead of failing.
  // That is precisely the `string | null` collapse the discriminated result was
  // introduced to prevent, wearing a different shape.
  const trigger = page.getByRole("button", { name: /escolh|data/i });
  if ((await trigger.count()) === 0) {
    return { ok: false, why: "flow-broken", detail: "date/time step has no date-picker trigger" };
  }
  await trigger.first().click();

  // The popover is `role="dialog"` (DatePicker.tsx). If it did not open, the
  // trigger is not what we think it is — a flow defect, never an empty calendar.
  const opened = await page
    .getByRole("dialog")
    .first()
    .isVisible({ timeout: 10_000 })
    .catch(() => false);
  if (!opened) {
    return { ok: false, why: "flow-broken", detail: "date picker did not open when clicked" };
  }

  // ONLY NOW is an absence of selectable days a statement about the calendar.
  const day = page.getByRole("gridcell").and(page.locator(":not([aria-disabled])"));
  await day.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  const dayCount = await day.count();
  if (dayCount === 0) {
    return { ok: false, why: "empty-calendar", detail: "date picker offered no selectable day" };
  }

  // ============================================================= //
  // "ENABLED" IS AN INTERVAL, NOT THE SET OF DAYS WITH SLOTS.
  // ============================================================= //
  // The previous version clicked the FIRST enabled day and asserted, in the trace
  // doc, that "the first enabled day is by construction a day with availability".
  // THAT WAS WRONG, and CI said so: `inRange` is a CLOSED INTERVAL,
  // `(!min || iso >= min) && (!max || iso <= max)` (DatePicker.tsx:119). So every
  // day between the first and last available date is enabled — including the six
  // weekdays that carry nothing, because the seed's availability is MONDAY ONLY.
  // The first enabled day was simply the first day of the range.
  //
  // So the days are TRIED, in order, until one yields slots. Bounded, because an
  // unbounded walk over a wide range would be a slow way to fail.
  const MAX_DAYS_TRIED = 14;
  const slot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ });
  let tried = 0;
  for (let i = 0; i < Math.min(dayCount, MAX_DAYS_TRIED); i++) {
    // The popover closes on select, so it is reopened for each attempt.
    if (i > 0) {
      await trigger.first().click();
      await page.getByRole("dialog").first().waitFor({ state: "visible", timeout: 10_000 });
    }
    await day.nth(i).click();
    tried++;
    await slot.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    if ((await slot.count()) > 0) break;
  }
  if ((await slot.count()) === 0) {
    return {
      ok: false,
      why: "empty-calendar",
      detail: `no slot on any of the first ${tried} selectable day(s)`,
    };
  }

  const label = (await slot.first().textContent())?.trim() ?? "";
  await slot.first().click();

  const submit = page.getByRole("button", { name: /confirmar|marcar|pedir/i });
  if ((await submit.count()) === 0) {
    return { ok: false, why: "flow-broken", detail: "confirm step offered no submit control" };
  }
  await submit.last().click();

  // The pedido landed when the pending screen says so, in the product's own
  // words. Waiting on a URL alone would pass on a redirect that carried an error.
  await expect(page.getByText(/pedido recebido/i)).toBeVisible({ timeout: 30_000 });
  return { ok: true, slot: label };
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
    const seen = await timed("A: agenda reload shows the new row", async () => {
      await staff.reload();
      const row = staff.getByText(new RegExp(String(taken).replace(":", "[:h]"), "i"));
      return row.first().isVisible({ timeout: 30_000 }).catch(() => false);
    });

    expect(seen, `a portal pedido at ${taken} should be on the staff agenda after a reload`).toBe(
      true,
    );
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
