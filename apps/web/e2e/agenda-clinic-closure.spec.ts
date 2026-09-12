/**
 * agenda-clinic-closure.spec.ts — 0085, SCHED-16 + SCHED-24.
 *
 * ==========================================================================
 * WHAT THIS PROVES THAT NO UNIT TEST CAN
 * ==========================================================================
 * `clinic-hours.test.ts` proves the arithmetic and `day-availability.test.ts`
 * proves the composition, but neither of them ever renders a grid. The three
 * facts below are only true of the DRAWN page, and each of them is a way the
 * card could ship looking finished and be wrong:
 *
 *   1. THE LAST HOUR LABEL. The reported symptom was "the agenda ends at
 *      19:00 and we work until 20:00". The grid always ran to 20:00; the
 *      LABEL stopped an hour early. A test that reads hours from a function
 *      cannot see that.
 *   2. THE BAND IS ON THE RIGHT CLINIC ONLY. A closure column read from the
 *      wrong location, or a band drawn under "Todas as localizações", tells
 *      LV that it shuts at lunch. Asserted three ways: CB has it, LV does
 *      not, the union view does not.
 *   3. THE HOUR IS NOT BOOKABLE, on the screen, by the mouse. The server
 *      refuses it too (actions.ts, outside the allowConflict gate), but a
 *      slot that still looks clickable is the September outage's shape:
 *      the screen inviting an action the server will refuse.
 *
 * ==========================================================================
 * IT SETS THE CLOSURE ITSELF, AND PUTS IT BACK
 * ==========================================================================
 * The seed has no closed clinic — deliberately, since seeding one would
 * silently remove an hour from every other agenda spec's bookable day. So
 * this spec writes the closure onto LOCATION_B for its own duration and
 * clears it in `afterAll`, the same self-cleaning shape
 * agenda-blocked-time.spec.ts uses for its block.
 */
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

// The app's own Lisbon conversion, for the same reason marcar-novamente.spec.ts
// imports it: the form submits lisbonDateTimeToUtc(date, time), and a
// hard-coded offset is right for half the year.
import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import {
  LOCATION,
  LOCATION_B,
  PATIENTS,
  SERVICE,
  TENANT_A,
  futureDate,
  RUN_DAY_BASE,
} from "./fixtures";
import { dateField, fillDate, fillTime } from "./helpers";
import { serviceClient } from "./helpers/confirm-code";

/** A weekday nothing else books, so the band is the only thing under test. */
const DAY = futureDate(RUN_DAY_BASE + 41);

const FROM = "13:00:00";
const TO = "14:00:00";

async function setClosure(from: string | null, to: string | null) {
  const db = serviceClient();
  const { data, error } = await db
    .from("locations")
    .update({ midday_closed_from: from, midday_closed_to: to })
    .eq("tenant_id", TENANT_A)
    .eq("id", LOCATION_B.id)
    .select("id, midday_closed_from");
  if (error) throw new Error(`could not set the closure: ${error.message}`);
  // READ IT BACK. A PostgREST update whose filter matches nothing returns no
  // error and no rows, so a silent no-op here would surface as "the band does
  // not render" and cost an afternoon looking at the component.
  if (!data || data.length !== 1) {
    throw new Error(`the closure write matched ${data?.length ?? 0} rows, expected 1`);
  }
}

/**
 * THE AGENDA'S CLINIC LIST IS CACHED FOR 60 SECONDS.
 *
 * `fetchAgendaReferenceData` is an `unstable_cache` entry with
 * `{ revalidate: 60, tags: ["agenda-reference-data"] }`, and nothing invalidates
 * that tag when a clinic's hours change — there is no hours editor yet, so the
 * only writer is SQL, which cannot revalidate anything. That is REAL PRODUCT
 * BEHAVIOUR and it is on the card: after the owner applies 0085, CB's band
 * appears within a minute, not instantly.
 *
 * So this reloads until the page has caught up rather than asserting once and
 * calling a cache a bug. Reloading is what makes it terminate: the TTL is
 * stale-while-revalidate, so the request after expiry serves the stale list and
 * refreshes it, and the one after that is fresh.
 */
async function reloadUntilBanded(page: Page, url: string) {
  await expect
    .poll(
      async () => {
        await page.goto(url);
        return page.getByTestId("agenda-closure-band").count();
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000, 10_000] },
    )
    .toBe(1);
}

test.beforeAll(async () => {
  await setClosure(FROM, TO);
});

test.afterAll(async () => {
  // Both ends together: the pair constraint refuses a half-cleared row, and a
  // lane left half-closed would fail the NEXT run for a reason that has nothing
  // to do with the diff being tested.
  await setClosure(null, null);
});

test("0085: the closed hour is banded, labelled and not bookable at that clinic", async ({
  page,
}) => {
  // Generous, because of the 60s reference-data cache documented above. The
  // assertions themselves are fast; only the first paint waits.
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = `/agenda?view=day&date=${DAY}&location=${LOCATION_B.id}`;
  await reloadUntilBanded(page, url);
  await expect(page).toHaveURL(new RegExp(`location=${LOCATION_B.id}`));

  // (1) THE REPORTED SYMPTOM, and it is about the GUTTER rather than the rows.
  //     The last hour ROW is 19:00, correctly - 19:30 is the last bookable
  //     slot. What the clinic read as "the agenda ends at 19:00" was that the
  //     last LABEL said 19:00. The closing time now ends the gutter.
  await expect(page.getByTestId("agenda-closing-label")).toHaveText("20:00");

  // (2) The band itself, on this clinic.
  const band = page.getByTestId("agenda-closure-band");
  await expect(band).toBeVisible();
  await expect(band).toContainText(/Cl[ií]nica encerrada/i);

  // (3) Not bookable, and not merely styled as such: the slot is DISABLED, so a
  //     click cannot open Nova marcação for an hour the server will refuse.
  //     ASSERTED UNCONDITIONALLY. A `if (await count())` guard here would pass
  //     silently on the day the slot stops rendering at all, which is the same
  //     hole `becameVisible` exists to close one file over.
  const closed = page.getByRole("button", { name: /13:30 - Cl[ií]nica encerrada/i });
  await expect(closed).toHaveCount(1);
  await expect(closed).toBeDisabled();

  // (4) A slot OUTSIDE the closure is still bookable, so the band is not
  //     disabling the day. Without this control a component that disabled every
  //     slot would pass every assertion above.
  const open0930 = page.getByRole("button", { name: /09:30$/ });
  await expect(open0930.first()).toBeEnabled();
});

test("0085: the band belongs to the clinic, not to the agenda", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Linda-a-Velha has no closure. A band here would tell a clinic that is open
  // all day that it shuts at lunch.
  await page.goto(`/agenda?view=day&date=${DAY}&location=${LOCATION.id}`);
  await expect(page).toHaveURL(new RegExp(`location=${LOCATION.id}`));
  await expect(page.getByTestId("agenda-closure-band")).toHaveCount(0);

  // "Todas as localizações" is the union of both clinics. The owner ruled it
  // draws NO band: at 13:30 one clinic is open and the other is not, and a band
  // across the whole column would be false for LV.
  await page.goto(`/agenda?view=day&date=${DAY}`);
  await expect(page).not.toHaveURL(/location=/);
  await expect(page.getByTestId("agenda-closure-band")).toHaveCount(0);
});

/* ======================================================================== */
/* MARCAR NOVAMENTE PAYS THE CLOSURE TOO                                     */
/* ======================================================================== */
/* Found while reconciling the clinic-hours record (the MIG-0085 card): a new */
/* booking and a reschedule were refused inside the closed hour, and          */
/* `cloneAppointment` - the write behind Marcar novamente on the agenda drawer */
/* and on the patient's appointment list - was not. So "not blockable-around" */
/* was untrue for anybody who booked by copying a finished visit.             */
/*                                                                           */
/* ASSERTED ON THE SCREEN AND ON THE ROW. The sentence has to name the CLINIC */
/* and the hour, and say there is no therapist absence to remove; a refusal  */
/* that fell through to the generic "could not schedule" would send reception */
/* looking for a block. And the row count at that minute must not move: an    */
/* error that arrived AFTER the insert would satisfy every screen assertion.  */
/*                                                                           */
/* COUNTED AS A DELTA, NOT AN ABSOLUTE, because a lane database accumulates   */
/* (seed-e2e upserts and never deletes), and a row a previous run left at     */
/* 13:30 must not make this one fail or pass for the wrong reason.            */
/*                                                                           */
/* DAY 46, PRIVATE TO THIS TEST. Retries move 100 days out.                   */

async function e2eTherapistId(db: ReturnType<typeof serviceClient>): Promise<string> {
  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("email", "e2e-therapist@osteojp.test")
    .limit(1);
  if (error) throw new Error(`users lookup failed: ${error.message}`);
  const id = data?.[0]?.id as string | undefined;
  if (!id) throw new Error("Seeded therapist missing. Run: node apps/web/e2e/seed/seed-e2e.mjs");
  return id;
}

/** Appointments for the fixture patient at the CLOSED clinic starting at `at`. */
async function rowsAt(db: ReturnType<typeof serviceClient>, at: Date): Promise<number> {
  const { count, error } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT_A)
    .eq("patient_id", PATIENTS.maria.id)
    .eq("location_id", LOCATION_B.id)
    .eq("starts_at", at.toISOString());
  if (error) throw new Error(`appointment count failed: ${error.message}`);
  return count ?? 0;
}

test("0085: Marcar novamente into the closed hour is refused, and the refusal names the clinic", async ({
  page,
}, testInfo) => {
  const db = serviceClient();

  // A COMPLETED visit in the past AT THE CLOSED CLINIC. A clone inherits the
  // source's location, so this is what puts the copy at LOCATION_B.
  const sourceId = randomUUID();
  const srcStart = new Date(Date.now() - 5 * 86_400_000);
  srcStart.setUTCHours(9, 0, 0, 0);
  const src = await db.from("appointments").insert({
    id: sourceId,
    tenant_id: TENANT_A,
    patient_id: PATIENTS.maria.id,
    practitioner_id: await e2eTherapistId(db),
    location_id: LOCATION_B.id,
    service_id: SERVICE.id,
    starts_at: srcStart.toISOString(),
    ends_at: new Date(srcStart.getTime() + 55 * 60_000).toISOString(),
    status: "completed",
    confirmation_state: "confirmed",
  });
  if (src.error) throw new Error(`source appointment insert failed: ${src.error.message}`);

  const day = futureDate(RUN_DAY_BASE + 46 + testInfo.retry * 100);
  const closedAt = lisbonDateTimeToUtc(day, "13:30");
  const openAt = lisbonDateTimeToUtc(day, "10:00");
  const closedBefore = await rowsAt(db, closedAt);
  const openBefore = await rowsAt(db, openAt);

  await page.goto(`/patients/${PATIENTS.maria.id}?tab=consultas`);
  const row = page.locator(`[data-appointment-id="${sourceId}"]`);
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.getByRole("button", { name: "Marcar novamente" }).click();

  const drawer = page.getByRole("dialog").filter({ hasText: "Marcar novamente" });
  await expect(drawer).toBeVisible();
  await fillDate(dateField(drawer), day);
  await fillTime(drawer, "13:30");
  await drawer.getByRole("button", { name: "Marcar", exact: true }).click();

  // THE SCREEN. The clinic by name, the hour, and the sentence that stops
  // reception looking for a block that does not exist.
  const refusal = drawer.getByRole("alert");
  await expect(
    refusal,
    "Marcar novamente booked into the clinic's closed hour - the clone path skips the closure",
  ).toContainText(/encerrada/i);
  await expect(refusal).toContainText(LOCATION_B.name);
  await expect(refusal).toContainText("13:00");
  await expect(refusal).toContainText("14:00");
  await expect(refusal).toContainText("Não é uma ausência do terapeuta");
  // No override. The closure sits outside the allowConflict gate on the
  // server; offering "Marcar mesmo assim" here would be a button that cannot
  // succeed.
  await expect(drawer.getByRole("button", { name: /mesmo assim/i })).toHaveCount(0);

  // THE ROW. Nothing was written at 13:30.
  expect(await rowsAt(db, closedAt)).toBe(closedBefore);

  // NEGATIVE ARM, same drawer: 10:00 at the same clinic books. Without it, a
  // drawer that refused every slot would pass everything above.
  await fillTime(drawer, "10:00");
  await drawer.getByRole("button", { name: "Marcar", exact: true }).click();
  await expect(page.getByText("Nova marcação criada.")).toBeVisible();
  expect(await rowsAt(db, openAt)).toBe(openBefore + 1);
});
