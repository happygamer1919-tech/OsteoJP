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
 */
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import { LOCATION, PATIENTS, SERVICE, TENANT_A, futureWeekdayDate, RUN_DAY_BASE } from "./fixtures";
import { serviceClient } from "./helpers/confirm-code";

const DAY = futureWeekdayDate(RUN_DAY_BASE + 72);
const LATE = randomUUID();
const EARLIER = randomUUID();
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
