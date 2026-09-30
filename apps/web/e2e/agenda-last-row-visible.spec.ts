/**
 * agenda-last-row-visible.spec.ts — SR-62 PU-2 (A2). THE LAST HOUR OF THE DAY IS ON SCREEN.
 *
 * ==========================================================================
 * THE REPORT
 * ==========================================================================
 * The agenda runs to 20:00, and JP works 09:00-20:00 at Linda-a-Velha, so the
 * 19:00 hour is live bookings, not padding. Reception's screenshot shows the
 * 19:00 row and the 20:00 label cut off by the grid's own card.
 *
 * ==========================================================================
 * WHAT IS ASSERTED, AND WHY NOT A HEIGHT
 * ==========================================================================
 * A "the grid is at least N px tall" check is a proxy for the complaint, and it
 * passes while the last row is clipped. So this asserts the complaint itself, on
 * the drawn page, at every width reception uses (1280 is the reception laptop,
 * 1024 the smallest supported, Q-AGENDA-02-1), in both Dia and Semana:
 *   - the 20:00 label and the 19:45 name line lie INSIDE the clipping card, and
 *     not inside its rounded bottom corner, which clips too;
 *   - the name line has no hidden overflow inside its hour band;
 *   - the point at the centre of the name is the card itself (elementFromPoint),
 *     and a real click on it opens the appointment drawer.
 *
 * MEASURED ONLY ONCE THE CARD IS VISIBLE. A count of one is not a layout: the
 * first version measured an element that existed but had no box yet, read every
 * rectangle as 0x0, and failed for a reason that had nothing to do with the grid.
 *
 * DAY 72, private to this file (scripts/e2e-spec-days-do-not-collide.test.mjs).
 * The spec writes its two appointments and deletes them again.
 *
 * ==========================================================================
 * PU-2b: A LONG NAME ON THE LAST ROW (SR62-PU2b, ruled 2026-09-29)
 * ==========================================================================
 * The arms above pass with the fixture's "Maria Filia" and failed with "Maria
 * Exemplo": at 1024px in week view a name wider than the column wrapped, and on
 * the last row the second line overflowed its band by 10px. Real names are
 * usually longer than the fixture's. The ruled fix truncates the name line to
 * ONE line with an ellipsis and puts the full name in a title attribute.
 *
 * So the PU-2b arms book an INVENTED patient this spec creates and removes
 * itself, never a seeded or real one, at 19:45 on a day of its own (DAY 85,
 * also private to this file, and more than a week from DAY 72 so neither
 * week view draws the other's rows). The name is long in its FIRST and LAST
 * words on purpose: PL-10 shows only those two on the card, so a long middle
 * name would never reach the screen and the arm would measure nothing.
 *
 *   - week, 1024px: CONTROL first, the drawn name is wider than its line (the
 *     ellipsis is actually exercised); then the line is one line high, it has no
 *     hidden overflow in its band either way, the title is the full name, and a
 *     click on it still opens the appointment;
 *   - day, 1024px: the same name has room and is NOT clipped, so truncation
 *     costs the day view nothing, and the title is the same full name.
 */
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import { LOCATION, PATIENTS, SERVICE, TENANT_A, futureWeekdayDate, RUN_DAY_BASE } from "./fixtures";
import { serviceClient } from "./helpers/confirm-code";

const DAY = futureWeekdayDate(RUN_DAY_BASE + 72);
const LATE = randomUUID();
const EARLIER = randomUUID();
/** PU-2b: an invented patient with a long first AND last name, created and removed here. */
const LONG_PATIENT = {
  id: "00000000-0000-4000-8000-00000062b201",
  name: "Maximiliana Inventada Exemplo Ficticiamente",
  /** What PL-10's shortPatientName draws on the card: first and last only. */
  shown: "Maximiliana Ficticiamente",
} as const;
const LONG_DAY = futureWeekdayDate(RUN_DAY_BASE + 85);
const LONG_APPT = randomUUID();
const WIDTHS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

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

test.beforeAll(async () => {
  const db = serviceClient();
  const practitioner = await therapistId(db);
  const rows = [
    { id: EARLIER, from: "19:00", to: "19:45" },
    { id: LATE, from: "19:45", to: "20:00" },
  ].map((r) => ({
    id: r.id,
    tenant_id: TENANT_A,
    patient_id: PATIENTS.maria.id,
    practitioner_id: practitioner,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    starts_at: lisbonDateTimeToUtc(DAY, r.from).toISOString(),
    ends_at: lisbonDateTimeToUtc(DAY, r.to).toISOString(),
    status: "scheduled",
    confirmation_state: "pending",
  }));
  const { error } = await db.from("appointments").upsert(rows);
  if (error) throw new Error(`appointment insert failed: ${error.message}`);
});

test.afterAll(async () => {
  const db = serviceClient();
  await db.from("appointments").delete().in("id", [LATE, EARLIER]).eq("tenant_id", TENANT_A);
});

type Box = { top: number; bottom: number; left: number; right: number };
type Measure = {
  card: Box;
  radius: number;
  label: Box;
  name: Box;
  bandOverflow: number;
  hitIsCard: boolean;
  viewportHeight: number;
};

async function measure(page: Page, id: string): Promise<Measure> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 2);
  const m = await page.evaluate((apptId) => {
    const btn = document.querySelector(`[data-appointment-id="${apptId}"]`);
    if (!(btn instanceof HTMLElement)) return null;
    const band = btn.closest('[data-testid="agenda-start-group"]');
    const card = btn.closest(".glass-card");
    const name = btn.querySelector('[data-testid="agenda-card-patient"]');
    const label = card?.querySelector('[data-testid="agenda-closing-label"]');
    if (!(band instanceof HTMLElement) || !(card instanceof HTMLElement) || !(name instanceof HTMLElement) || !(label instanceof HTMLElement)) return null;
    const box = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    };
    const nb = name.getBoundingClientRect();
    const hit = document.elementFromPoint(nb.left + nb.width / 2, nb.top + nb.height / 2);
    return {
      card: box(card),
      radius: parseFloat(getComputedStyle(card).borderBottomRightRadius) || 0,
      label: box(label),
      name: box(name),
      bandOverflow: band.scrollHeight - band.clientHeight,
      hitIsCard: hit instanceof Node && btn.contains(hit),
      viewportHeight: window.innerHeight,
    };
  }, id);
  if (!m) throw new Error(`appointment ${id} or its card, band, name or closing label is not rendered`);
  if (m.card.bottom - m.card.top <= 0) throw new Error(`the card has no height yet: ${JSON.stringify(m.card)}`);
  return m;
}

/**
 * Inside the card's box AND inside its rounded bottom corners, which clip along the
 * arc. Each bottom corner of the box is tested against the arc's centre, so a label
 * that merely sits in the corner's square but inside the curve counts as visible.
 */
function insideCard(b: Box, m: Measure) {
  const c = m.card;
  const r = m.radius;
  const inBox = b.top >= c.top && b.bottom <= c.bottom && b.left >= c.left && b.right <= c.right;
  if (inBox === false) return false;
  const corners: Array<[number, number]> = [
    [b.left, b.bottom],
    [b.right, b.bottom],
  ];
  return corners.every(([x, y]) => {
    const inCornerX = x < c.left + r || x > c.right - r;
    const inCornerY = y > c.bottom - r;
    if (inCornerX === false || inCornerY === false) return true;
    const cx = x < c.left + r ? c.left + r : c.right - r;
    const cy = c.bottom - r;
    return Math.hypot(x - cx, y - cy) <= r + 0.5;
  });
}

for (const view of ["day", "week"] as const) {
  for (const size of WIDTHS) {
    test(`PU-2: at ${size.width}px, ${view} view, a 19:45 appointment and the 20:00 label are fully visible and the card opens`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(size);
      await page.goto(`/agenda?view=${view}&date=${DAY}&location=${LOCATION.id}`);
      const late = page.locator(`[data-appointment-id="${LATE}"]`);
      await expect(late).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("agenda-closing-label")).toHaveText("20:00");

      const m = await measure(page, LATE);
      const top = Math.max(0, Math.min(m.card.bottom, m.viewportHeight) - 260);
      const shot = testInfo.outputPath(`bottom-${view}-${size.width}.png`);
      await page.screenshot({ path: shot, clip: { x: 0, y: top, width: size.width, height: m.viewportHeight - top } });
      await testInfo.attach(`bottom-${view}-${size.width}.png`, { path: shot, contentType: "image/png" });
      await testInfo.attach(`measure-${view}-${size.width}.json`, { body: JSON.stringify(m, null, 2), contentType: "application/json" });

      expect.soft(m.card.bottom, "the card's bottom edge is on screen").toBeLessThanOrEqual(m.viewportHeight + 0.5);
      expect.soft(insideCard(m.label, m), `the 20:00 label is inside the card: ${JSON.stringify({ label: m.label, card: m.card, radius: m.radius })}`).toBe(true);
      expect.soft(insideCard(m.name, m), `the 19:45 name is inside the card: ${JSON.stringify({ name: m.name, card: m.card, radius: m.radius })}`).toBe(true);
      expect.soft(m.bandOverflow, "the 19:45 name has no hidden overflow in its band").toBeLessThanOrEqual(0);
      expect.soft(m.hitIsCard, "the point at the centre of the 19:45 name is the card").toBe(true);

      await late.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText("Editar marcação");
    });
  }
}

type NameProbe = {
  title: string | null;
  text: string;
  scrollWidth: number;
  clientWidth: number;
  height: number;
  lineHeight: number;
  textOverflow: string;
  whiteSpace: string;
  bandScrollWidth: number;
  bandClientWidth: number;
};

/** The name element's own geometry and style, read on the drawn page. */
async function probeName(page: Page, id: string): Promise<NameProbe> {
  const p = await page.evaluate((apptId) => {
    const btn = document.querySelector(`[data-appointment-id="${apptId}"]`);
    const name = btn?.querySelector('[data-testid="agenda-card-patient"]');
    const band = btn?.closest('[data-testid="agenda-start-group"]');
    if (!(name instanceof HTMLElement) || !(band instanceof HTMLElement)) return null;
    const cs = getComputedStyle(name);
    return {
      title: name.getAttribute("title"),
      text: (name.textContent ?? "").trim(),
      scrollWidth: name.scrollWidth,
      clientWidth: name.clientWidth,
      height: name.getBoundingClientRect().height,
      lineHeight: parseFloat(cs.lineHeight),
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
      bandScrollWidth: band.scrollWidth,
      bandClientWidth: band.clientWidth,
    };
  }, id);
  if (!p) throw new Error(`appointment ${id}'s name line or its band is not rendered`);
  // A line height that does not parse would make the one-line check compare with
  // NaN, which is false and reads as neither a pass nor the defect.
  if (!Number.isFinite(p.lineHeight) || p.lineHeight <= 0) throw new Error(`the name's line height did not resolve: ${JSON.stringify(p)}`);
  if (p.clientWidth <= 0) throw new Error(`the name line has no width yet: ${JSON.stringify(p)}`);
  return p;
}

test.describe("PU-2b: a long patient name on the last row", () => {
  async function removeLong(db: ReturnType<typeof serviceClient>): Promise<void> {
    // Children first, and by PATIENT as well as by id, so a row left by a crashed
    // run under an earlier RUN_DAY_BASE is removed too.
    await db.from("appointments").delete().eq("tenant_id", TENANT_A).eq("patient_id", LONG_PATIENT.id);
    await db.from("patients").delete().eq("tenant_id", TENANT_A).eq("id", LONG_PATIENT.id);
  }

  test.beforeAll(async () => {
    const db = serviceClient();
    const practitioner = await therapistId(db);
    await removeLong(db);
    // Upsert, so a patient row a crashed run could not remove is reused, not refused.
    const patient = await db.from("patients").upsert({
      id: LONG_PATIENT.id,
      tenant_id: TENANT_A,
      full_name: LONG_PATIENT.name,
      primary_location_id: LOCATION.id,
    });
    if (patient.error) throw new Error(`PU-2b patient insert failed: ${patient.error.message}`);
    const appt = await db.from("appointments").insert({
      id: LONG_APPT,
      tenant_id: TENANT_A,
      patient_id: LONG_PATIENT.id,
      practitioner_id: practitioner,
      location_id: LOCATION.id,
      service_id: SERVICE.id,
      starts_at: lisbonDateTimeToUtc(LONG_DAY, "19:45").toISOString(),
      ends_at: lisbonDateTimeToUtc(LONG_DAY, "20:00").toISOString(),
      status: "scheduled",
      confirmation_state: "pending",
    });
    if (appt.error) throw new Error(`PU-2b appointment insert failed: ${appt.error.message}`);
  });

  test.afterAll(async () => {
    await removeLong(serviceClient());
  });

  async function open(page: Page, view: "day" | "week", testInfo: TestInfo) {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/agenda?view=${view}&date=${LONG_DAY}&location=${LOCATION.id}`);
    const card = page.locator(`[data-appointment-id="${LONG_APPT}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("agenda-closing-label")).toHaveText("20:00");
    const m = await measure(page, LONG_APPT);
    const p = await probeName(page, LONG_APPT);
    const top = Math.max(0, Math.min(m.card.bottom, m.viewportHeight) - 260);
    const shot = testInfo.outputPath(`pu2b-${view}-1024.png`);
    await page.screenshot({ path: shot, clip: { x: 0, y: top, width: 1024, height: m.viewportHeight - top } });
    await testInfo.attach(`pu2b-${view}-1024.png`, { path: shot, contentType: "image/png" });
    await testInfo.attach(`pu2b-${view}-1024.json`, { body: JSON.stringify({ measure: m, name: p }, null, 2), contentType: "application/json" });
    return { card, m, p };
  }

  test("PU-2b: at 1024px, week view, a long name on the 19:45 row is one line with an ellipsis, its full name in the title, and the card opens", async ({
    page,
  }, testInfo) => {
    const { card, m, p } = await open(page, "week", testInfo);

    // CONTROL. The drawn name is wider than its line, so the ellipsis is really
    // in play. Without this, a name that happened to fit would pass every
    // assertion below and prove nothing about a long one.
    expect(p.text, "the card draws PL-10's first and last name").toBe(LONG_PATIENT.shown);
    expect(p.scrollWidth, `the name is wider than its line: ${JSON.stringify(p)}`).toBeGreaterThan(p.clientWidth);

    expect.soft(p.textOverflow, "the cut end is an ellipsis").toBe("ellipsis");
    expect.soft(p.whiteSpace, "the name never wraps").toBe("nowrap");
    expect.soft(p.height, `the name is ONE line high: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.lineHeight + 1);
    expect.soft(m.bandOverflow, "the name has no hidden vertical overflow in its band").toBeLessThanOrEqual(0);
    expect.soft(p.bandScrollWidth, "nor does it push its band sideways").toBeLessThanOrEqual(p.bandClientWidth);
    expect.soft(insideCard(m.name, m), `the 19:45 name is inside the card: ${JSON.stringify({ name: m.name, card: m.card, radius: m.radius })}`).toBe(true);
    expect.soft(m.hitIsCard, "the point at the centre of the name is the card").toBe(true);
    expect.soft(p.title, "the title carries the FULL name, middle names included").toBe(LONG_PATIENT.name);

    await card.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Editar marcação");
  });

  test("PU-2b: at 1024px, day view, the same long name has room and is not cut, with the same title", async ({ page }, testInfo) => {
    const { card, m, p } = await open(page, "day", testInfo);

    expect(p.text, "the card draws PL-10's first and last name").toBe(LONG_PATIENT.shown);
    expect.soft(p.scrollWidth, `the name fits its line, so nothing is hidden behind an ellipsis: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.clientWidth);
    expect.soft(p.height, `the name is ONE line high: ${JSON.stringify(p)}`).toBeLessThanOrEqual(p.lineHeight + 1);
    expect.soft(m.bandOverflow, "the name has no hidden vertical overflow in its band").toBeLessThanOrEqual(0);
    expect.soft(p.title, "the title carries the FULL name").toBe(LONG_PATIENT.name);

    await card.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Editar marcação");
  });
});
