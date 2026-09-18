/**
 * agenda-never-hides.spec.ts — AN APPOINTMENT OUTSIDE THE CLINIC'S HOURS IS
 * STILL ON THE PAGE, AND STILL OPENS.
 *
 * ==========================================================================
 * THE PRODUCTION INCIDENT
 * ==========================================================================
 * Opening moved to 09:00 on 2026-09-16. An existing 08:00 booking at
 * Linda-a-Velha on 16 September rendered UNDERNEATH the 09:00 row and could not
 * be opened. It was never deleted: `gridWindow` read the clinic's hours and
 * nothing else, and `makeMinToPx` clamps a minute below the window to the first
 * drawn hour, so two different times were painted at one offset.
 *
 * Hours went back to 08:00 the next day, so the SYMPTOM is gone from production
 * and the DEFECT CLASS is not: any appointment outside the hours hides. That is
 * what this spec pins, at both ends of the day.
 *
 * ==========================================================================
 * WHAT NO UNIT TEST CAN DO HERE
 * ==========================================================================
 * `clinic-hours-appointment-span.test.ts` proves the window arithmetic and
 * `agenda-outside-hours.test.tsx` proves the component draws two rows at two
 * offsets. Neither loads the page, and "could not be opened" is a claim about
 * the page: this books a real appointment outside a real clinic's real hours,
 * loads the real agenda, and CLICKS it.
 *
 * IT CREATES ITS OWN CLINIC, for the reason agenda-2100-last-row.spec.ts gives:
 * opening hours are a property of the CLINIC, true of every day at once, so
 * borrowing LOCATION_B would fight that spec's own closing-label assertion.
 *
 * DAYS 130-132, private to this file per scripts/e2e-spec-days-do-not-collide.
 */
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

// The form submits lisbonDateTimeToUtc(date, time), and this spec is entirely
// about a WALL-CLOCK hour relative to the clinic's opening hour, so it builds
// its instants the same way rather than with a Z-suffixed string.
import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";

import { PATIENTS, RUN_DAY_BASE, SERVICE, TENANT_A, futureWeekdayDate } from "./fixtures";
import { serviceClient } from "./helpers/confirm-code";

/** This spec's own clinic. No other spec books, reads or asserts here. */
const CLINIC = {
  id: "00000000-0000-0000-0000-00000000a1fe",
  name: "Clínica Nunca Esconde (E2E)",
} as const;

const OPENS = "09:00:00";
const CLOSES = "21:00:00";

/**
 * One day per case, so a failure names which end of the day broke.
 *
 * THREE APART, NOT CONSECUTIVE. `futureWeekdayDate` walks a weekend date forward
 * to the next weekday - a Saturday by two days, a Sunday by one - so two offsets
 * one apart can land on the SAME Monday. At 130/131/132 that happened: the
 * 21:30 booking meant for DAY_LATE appeared on DAY_CLEAN, whose whole point is
 * that nothing sits outside the hours, and the control failed with exactly the
 * four slots (21:00, 21:30, 22:00, 22:30) that booking widens the grid by.
 * Spacing by three is larger than the largest shift, so they cannot converge.
 */
const DAY_EARLY = futureWeekdayDate(RUN_DAY_BASE + 130);
const DAY_LATE = futureWeekdayDate(RUN_DAY_BASE + 133);
const DAY_CLEAN = futureWeekdayDate(RUN_DAY_BASE + 136);

async function therapistId(db: ReturnType<typeof serviceClient>): Promise<string> {
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

async function createClinic() {
  const db = serviceClient();
  const { data, error } = await db
    .from("locations")
    .upsert(
      {
        id: CLINIC.id,
        tenant_id: TENANT_A,
        name: CLINIC.name,
        is_active: true,
        opens_at: OPENS,
        closes_at: CLOSES,
      },
      { onConflict: "id" },
    )
    .select("id, opens_at, closes_at");
  if (error) throw new Error(`could not create the clinic: ${error.message}`);
  // READ IT BACK: a PostgREST write matching nothing returns no error and no
  // rows, and the symptom would be an afternoon spent in the component.
  if (data?.length !== 1) throw new Error(`clinic write matched ${data?.length ?? 0} rows`);
  if (data[0]?.opens_at?.slice(0, 5) !== "09:00") {
    throw new Error(`the clinic reads opens_at ${data[0]?.opens_at}, expected 09:00`);
  }
}

async function dropClinic() {
  const db = serviceClient();
  await db.from("appointments").delete().eq("tenant_id", TENANT_A).eq("location_id", CLINIC.id);
  await db.from("locations").delete().eq("id", CLINIC.id).eq("tenant_id", TENANT_A);
}

/** Book at a Lisbon WALL-CLOCK time on `day`, at this spec's clinic. */
async function book(day: string, hhmm: string, minutes = 60): Promise<string> {
  const db = serviceClient();
  const id = randomUUID();
  // `lisbonDateTimeToUtc`, NOT a Z-suffixed string. The whole spec is about a
  // wall-clock hour relative to the clinic's opening hour, and Lisbon is UTC+1
  // in summer: `${day}T08:00Z` is 09:00 on the grid, which is INSIDE the hours
  // and would have tested nothing while looking green.
  const start = new Date(lisbonDateTimeToUtc(day, hhmm));
  const { error } = await db.from("appointments").insert({
    id,
    tenant_id: TENANT_A,
    patient_id: PATIENTS.maria.id,
    practitioner_id: await therapistId(db),
    location_id: CLINIC.id,
    service_id: SERVICE.id,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
    status: "scheduled",
    confirmation_state: "pending",
  });
  if (error) throw new Error(`appointment insert failed: ${error.message}`);
  return id;
}

/**
 * The agenda's clinic list is cached for 60 seconds and nothing invalidates it
 * when hours change (there is no hours editor; SQL is the only writer). So poll
 * until the page has caught up, exactly as the 2100 spec does.
 */
async function reloadUntilClosing(page: Page, url: string, label: string) {
  await expect
    .poll(
      async () => {
        await page.goto(url);
        return page.getByTestId("agenda-closing-label").textContent();
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000, 10_000] },
    )
    .toBe(label);
}

/**
 * ONE early booking, shared by the three tests that read it.
 *
 * Booking it per-test put THREE appointments in the same slot, on the same day,
 * with the same therapist - a conflict this spec creates for itself, which the
 * day-collision guard cannot see because it compares FILES and these collide
 * inside one.
 */
let earlyApptId = "";

test.beforeAll(async () => {
  await createClinic();
  earlyApptId = await book(DAY_EARLY, "08:00");
});
test.afterAll(async () => {
  await dropClinic();
});

test("an 08:00 booking under a 09:00 opening is drawn in its own row and OPENS", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  const apptId = earlyApptId;
  const url = `/agenda?view=day&date=${DAY_EARLY}&location=${CLINIC.id}`;
  await reloadUntilClosing(page, url, "21:00");

  // (1) The row exists at all. Before the fix the window started at 09:00.
  await expect(page.getByText("08:00", { exact: true }).first()).toBeVisible();

  // (2) THE REPORTED SYMPTOM: it must be reachable, not merely present in the
  //     DOM. The old unit test asserted presence and passed all through this.
  const card = page.locator(`[data-appointment-id="${apptId}"]`);
  await expect(card).toBeVisible();

  const shot = testInfo.outputPath(`never-hides-day-${DAY_EARLY}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await testInfo.attach("never-hides-day-1280.png", { path: shot, contentType: "image/png" });

  // (3) It OPENS, ON THE RIGHT ROW. This is the half the incident was reported
  //     as. The drawer is identified by the APPOINTMENT ID it prints, not by the
  //     patient name: the name lives in a <select>'s value, which is not the
  //     dialog's text at all, and a name is shared vocabulary on a seeded
  //     database while the id cannot be produced by a neighbouring row.
  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(apptId);
});

test("the 08:00 row is marked as outside the clinic's hours, and its empty slots are not bookable", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  // The shared booking from beforeAll. Booking again here would put a second
  // appointment in the same slot with the same therapist.
  await reloadUntilClosing(
    page,
    `/agenda?view=day&date=${DAY_EARLY}&location=${CLINIC.id}`,
    "21:00",
  );
  // Marked, and the marking is text rather than colour alone.
  const outside = page.locator('[data-outside-hours="true"]').first();
  await expect(outside).toHaveCount(1);
  await expect(outside).toBeDisabled();
  await expect(page.getByRole("button", { name: /Fora do hor.rio da cl.nica$/ }).first()).toBeDisabled();
});

test("the week view does not hide it either, at 1280", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const apptId = earlyApptId; // shared, for the same reason as above
  await reloadUntilClosing(
    page,
    `/agenda?view=week&date=${DAY_EARLY}&location=${CLINIC.id}`,
    "21:00",
  );
  await expect(page.locator(`[data-appointment-id="${apptId}"]`)).toBeVisible();

  const shot = testInfo.outputPath(`never-hides-week-${DAY_EARLY}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await testInfo.attach("never-hides-week-1280.png", { path: shot, contentType: "image/png" });
});

test("a 21:30 booking at a clinic closing 21:00 gets the 21:00 row", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const apptId = await book(DAY_LATE, "21:30");
  await reloadUntilClosing(
    page,
    `/agenda?view=day&date=${DAY_LATE}&location=${CLINIC.id}`,
    "21:00",
  );
  await expect(page.getByText("21:00", { exact: true }).first()).toBeVisible();
  await expect(page.locator(`[data-appointment-id="${apptId}"]`)).toBeVisible();
});

test("with NO booking outside the hours, the grid is exactly the clinic's day", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await book(DAY_CLEAN, "10:00");
  await reloadUntilClosing(
    page,
    `/agenda?view=day&date=${DAY_CLEAN}&location=${CLINIC.id}`,
    "21:00",
  );
  // Nothing widened it, so 08:00 is not drawn and nothing is marked.
  await expect(page.getByText("08:00", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-outside-hours="true"]')).toHaveCount(0);
});
