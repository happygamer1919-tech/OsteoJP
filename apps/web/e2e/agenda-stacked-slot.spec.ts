/**
 * agenda-stacked-slot.spec.ts - AGENDA-STACK-01. SEVERAL APPOINTMENTS AT ONE
 * START TIME ARE ALL ON SCREEN, AND NOTHING SCROLLS INSIDE THE SLOT.
 *
 * Runs as ADMIN (the default project storage state), on the desktop grid, at
 * 1440 by 900, in Dia and in Semana. The phone list and the compact week are
 * other components and are not driven here.
 *
 * ==========================================================================
 * THE REQUEST, AND THE GATE
 * ==========================================================================
 * Reception: when several appointments share a time slot, all are shown with no
 * scroll inside the slot; the row grows and the page scrolls. The gate is six
 * appointments at the same hour, in both views: all six visible, no inner
 * scroll, no overlap with the next hour.
 *
 * ==========================================================================
 * WHAT IS ASSERTED, AND WHY EACH ARM EXISTS
 * ==========================================================================
 * app/agenda/agenda-grid.test.tsx pins the arithmetic. It cannot say what a
 * browser draws: a name line's real height is a font and a line-height, and the
 * scale only ASSUMES a line is no taller than it reserved. So this measures the
 * drawn page:
 *   - each of the six cards is visible, inside every clipping box around it,
 *     and is the element at its own centre (nothing is drawn over it);
 *   - nothing between the day column and a card can scroll: no box there has a
 *     scrolling overflow, and the start group holds its content exactly;
 *   - the last card ends at or above the top of the next hour's row, and the
 *     gutter's label for that hour sits on that row;
 *   - a click on the next hour opens Nova marcação FOR THAT HOUR;
 *   - a quiet hour of the same day is as tall as it always was (where the
 *     lane's database left that hour quiet).
 *
 * THE SECOND PAIR OF ARMS ADDS A SEVENTH APPOINTMENT AT THE HALF HOUR, and it
 * is the pair that fails on the layout this card replaced. Six lines alone fit
 * the old grown hour; with a neighbour at 10:30 the old scale gave the six only
 * the top half of it and scrolled the rest. The six must end at or above the
 * 10:30 card, and the 10:30 card at or above 11:00.
 *
 * ==========================================================================
 * ISOLATION
 * ==========================================================================
 * Seven INVENTED patients with fixed ids, created and removed here, never a
 * seeded or a real one. The therapists are the seed's own bookable roster (the
 * disposable ones other specs delete are left out); the rows are written with
 * the service role, so no availability or conflict rule is exercised, and the
 * appointments are removed afterwards by patient, which also clears a crashed
 * run's rows from an earlier RUN_DAY_BASE.
 *
 * ITS DAY IS RUN_DAY_BASE + 180 (181 when that lands on a Sunday), which no
 * other spec derives (scripts/e2e-spec-days-do-not-collide.test.mjs).
 *
 * THE HOURS ARE 10:00 AND 11:00, AND THE QUIET HOUR IS 15:00. Other specs move
 * Linda-a-Velha's opening hours and midday closure while they run; these are
 * inside any of those clinic days and outside 13:00 to 14:00.
 */
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import { LOCATION, RUN_DAY_BASE, SERVICE, TENANT_A, futureWeekdayDate } from "./fixtures";
import { expectTime } from "./helpers";
import { serviceClient } from "./helpers/confirm-code";

const DAY = futureWeekdayDate(RUN_DAY_BASE + 180);
const DESKTOP = { width: 1440, height: 900 };

/**
 * Seven invented patients: six for 10:00 and one for the 10:30 arm. PL-10 draws
 * the first and the last word of each.
 */
const PATIENTS = ["Um", "Dois", "Tres", "Quatro", "Cinco", "Seis", "Sete"].map((word, i) => ({
  id: `00000000-0000-4000-8000-0000005ac${String(i + 1).padStart(3, "0")}`,
  name: `Pilha Inventada ${word}`,
}));
const APPOINTMENTS = PATIENTS.map((_, i) => `00000000-0000-4000-8000-0000005ad${String(i + 1).padStart(3, "0")}`);
const SIX = APPOINTMENTS.slice(0, 6);
const SEVENTH = APPOINTMENTS[6]!;

type Db = ReturnType<typeof serviceClient>;

async function removeAll(db: Db): Promise<void> {
  const ids = PATIENTS.map((p) => p.id);
  // Children first, and by PATIENT, so a crashed run's rows go too.
  await db.from("appointments").delete().eq("tenant_id", TENANT_A).in("patient_id", ids);
  await db.from("patients").delete().eq("tenant_id", TENANT_A).in("id", ids);
}

/** The seed's bookable therapists, in a stable order, without the disposable ones. */
async function therapists(db: Db): Promise<string[]> {
  const { data, error } = await db
    .from("users")
    .select("id, full_name")
    .eq("tenant_id", TENANT_A)
    .eq("is_bookable", true)
    .eq("is_active", true)
    .like("email", "%@osteojp.test")
    .not("full_name", "ilike", "%Descartavel%")
    .order("full_name");
  if (error) throw new Error(`therapist lookup failed: ${error.message}`);
  const ids = (data ?? []).map((u) => u.id as string);
  if (ids.length === 0) throw new Error("No seeded therapist. Run: node apps/web/e2e/seed/seed-e2e.mjs");
  return ids;
}

function row(id: string, patientId: string, practitionerId: string, from: string, to: string) {
  return {
    id,
    tenant_id: TENANT_A,
    patient_id: patientId,
    practitioner_id: practitionerId,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    starts_at: lisbonDateTimeToUtc(DAY, from).toISOString(),
    ends_at: lisbonDateTimeToUtc(DAY, to).toISOString(),
    status: "scheduled",
    confirmation_state: "pending",
  };
}

/** The desktop grid's column for a date (only the grid emits `data-day`). */
const column = (page: Page): Locator => page.locator(`[data-day="${DAY}"]`);
/** The slot button of the column whose accessible name ends in this time. */
const slotAt = (page: Page, time: string): Locator =>
  column(page).getByRole("button", { name: new RegExp(` ${time}( - .*)?$`) });
const card = (page: Page, id: string): Locator => page.locator(`[data-appointment-id="${id}"]`);

/** Edges are sums of fractional px on one mapper; a pixel of rounding is allowed. */
const PX = 1;

type CardProbe = {
  id: string;
  top: number;
  bottom: number;
  /** A box around the card that clips or scrolls and does not contain it. */
  clippedBy: string | null;
  /** A box between the column and the card that CAN scroll. */
  scrollsIn: string | null;
  hitIsCard: boolean;
};

type GroupProbe = {
  startMin: string | null;
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
  /** Every descendant with a scrolling overflow whose content is taller than it. */
  scrolling: string[];
};

/**
 * Read the drawn page. Each card is scrolled to the middle of the viewport
 * first, so "the element at its centre" is a claim about the grid and not about
 * the sticky toolbar that happens to be over a card near the top.
 */
async function probe(page: Page, ids: string[]): Promise<{ cards: CardProbe[]; groups: GroupProbe[] }> {
  const out = await page.evaluate(
    ({ ids, day }) => {
      const col = document.querySelector(`[data-day="${day}"]`);
      if (!(col instanceof HTMLElement)) return null;
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}`;
      const scrolls = (v: string) => v === "auto" || v === "scroll";
      const clips = (v: string) => v !== "visible";

      const cards = ids.map((id) => {
        const btn = document.querySelector(`[data-appointment-id="${id}"]`);
        if (!(btn instanceof HTMLElement)) return null;
        btn.scrollIntoView({ block: "center" });
        const b = btn.getBoundingClientRect();
        let clippedBy: string | null = null;
        let scrollsIn: string | null = null;
        for (let el = btn.parentElement; el && el !== col.parentElement; el = el.parentElement) {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (clips(cs.overflowY) && (b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5)) clippedBy ??= name(el);
          if (scrolls(cs.overflowY) || scrolls(cs.overflowX)) scrollsIn ??= name(el);
        }
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return {
          id,
          top: b.top + window.scrollY,
          bottom: b.bottom + window.scrollY,
          clippedBy,
          scrollsIn,
          hitIsCard: hit instanceof Node && btn.contains(hit),
        };
      });
      if (cards.some((c) => c === null)) return null;

      const groups = [...col.querySelectorAll('[data-testid="agenda-start-group"]')].map((g) => ({
        startMin: g.getAttribute("data-start-min"),
        overflowY: getComputedStyle(g).overflowY,
        scrollHeight: g.scrollHeight,
        clientHeight: g.clientHeight,
        scrolling: [g, ...g.querySelectorAll("*")]
          .filter((el) => scrolls(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)
          .map(name),
      }));
      return { cards: cards as NonNullable<(typeof cards)[number]>[], groups };
    },
    { ids, day: DAY },
  );
  if (!out) throw new Error("the day column or one of the cards is not rendered");
  return out;
}

/** A box's top and bottom in PAGE coordinates, so a scroll between two reads cannot move it. */
async function edges(target: Locator, what: string): Promise<{ top: number; bottom: number }> {
  await expect(target, what).toHaveCount(1);
  const e = await target.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top + window.scrollY, bottom: b.bottom + window.scrollY, height: b.height };
  });
  if (e.height <= 0) throw new Error(`${what} has no rendered height`);
  return e;
}

async function open(page: Page, view: "day" | "week"): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto(`/agenda?view=${view}&date=${DAY}`);
  await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
  await expect(column(page)).toHaveCount(1);
  for (const id of SIX) await expect(card(page, id)).toBeVisible({ timeout: 30_000 });
}

/** The 1440 by 900 viewport, with the stacked hour in it. */
async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await slotAt(page, "10:00").evaluate((el) => {
    window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 260));
  });
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(`${name}.png`, { path, contentType: "image/png" });
}

/** What every arm asserts about the cards it names and the column they are in. */
async function expectAllShownWithNoInnerScroll(page: Page, ids: string[], testInfo: TestInfo, tag: string) {
  const m = await probe(page, ids);
  await testInfo.attach(`${tag}.json`, { body: JSON.stringify(m, null, 2), contentType: "application/json" });

  for (const c of m.cards) {
    expect.soft(c.clippedBy, `card ${c.id} is cut by a box around it`).toBeNull();
    expect.soft(c.scrollsIn, `card ${c.id} sits inside a box that can scroll`).toBeNull();
    expect.soft(c.hitIsCard, `the point at the centre of card ${c.id} is the card`).toBe(true);
  }
  expect(m.groups.length, "the column draws its start groups").toBeGreaterThan(0);
  for (const g of m.groups) {
    expect.soft(g.overflowY, `the ${g.startMin} group does not scroll`).toBe("visible");
    expect.soft(g.scrollHeight, `the ${g.startMin} group holds its own content`).toBeLessThanOrEqual(g.clientHeight);
    expect.soft(g.scrolling, `nothing inside the ${g.startMin} group scrolls`).toEqual([]);
  }
  return m;
}

test.describe("AGENDA-STACK-01: a slot with several appointments grows, and nothing scrolls inside it", () => {
  // One fixture for the file; the last two arms add one row to it.
  test.describe.configure({ mode: "serial" });

  let db: Db;
  let roster: string[];

  test.beforeAll(async () => {
    db = serviceClient();
    roster = await therapists(db);
    await removeAll(db);
    // Upsert, so a patient row a crashed run could not remove is reused.
    const patients = await db.from("patients").upsert(
      PATIENTS.map((p) => ({
        id: p.id,
        tenant_id: TENANT_A,
        full_name: p.name,
        primary_location_id: LOCATION.id,
      })),
    );
    if (patients.error) throw new Error(`patient insert failed: ${patients.error.message}`);
    // SIX AT 10:00, each with another therapist as far as the roster goes.
    const six = await db
      .from("appointments")
      .insert(SIX.map((id, i) => row(id, PATIENTS[i]!.id, roster[i % roster.length]!, "10:00", "11:00")));
    if (six.error) throw new Error(`appointment insert failed: ${six.error.message}`);
  });

  test.afterAll(async () => {
    if (db) await removeAll(db);
  });

  for (const view of ["day", "week"] as const) {
    test(`${view} view: six appointments at 10:00 are all shown, nothing scrolls inside the slot, the last one ends above 11:00, and a click on 11:00 books 11:00`, async ({
      page,
    }, testInfo) => {
      await open(page, view);
      await shot(page, testInfo, `six-${view}`);

      const m = await expectAllShownWithNoInnerScroll(page, SIX, testInfo, `six-${view}`);

      // ONE GROUP HOLDS THE SIX, at 10:00. Asserted by id and not by a count
      // of six: a lane's database keeps other runs' rows, and one of them can
      // sit at 10:00 on this day (measured, on the first run after the agenda
      // specs). A neighbour in the group changes nothing asserted below.
      const group = column(page).locator('[data-testid="agenda-start-group"][data-start-min="600"]');
      await expect(group).toHaveCount(1);
      for (const id of SIX) await expect(group.locator(`[data-appointment-id="${id}"]`)).toHaveCount(1);

      // NO OVERLAP WITH THE NEXT HOUR, and the six do not overlap each other.
      const next = await edges(slotAt(page, "11:00"), "the 11:00 slot");
      const drawn = [...m.cards].sort((a, b) => a.top - b.top);
      expect(drawn.at(-1)!.bottom, "the last card ends at or above the top of the 11:00 row").toBeLessThanOrEqual(
        next.top + PX,
      );
      for (let i = 1; i < drawn.length; i++) {
        expect(drawn[i]!.top, `card ${i + 1} starts at or below the card above it`).toBeGreaterThanOrEqual(
          drawn[i - 1]!.bottom - PX,
        );
      }
      // The first card is in the 10:00 row, not above it.
      const hour = await edges(slotAt(page, "10:00"), "the 10:00 slot");
      expect(drawn[0]!.top, "the first card starts in the 10:00 row").toBeGreaterThanOrEqual(hour.top - PX);

      // THE TIME LABELS FOLLOW THE ROWS. The gutter is drawn once, from the same
      // mapper; its 11:00 row starts where the column's 11:00 slot starts.
      const label = page.getByTestId("agenda-time-gutter").getByText("11:00", { exact: true });
      const labelRow = await edges(label.locator(".."), "the gutter's 11:00 row");
      expect(Math.abs(labelRow.top - next.top), "the 11:00 label sits on the 11:00 row").toBeLessThanOrEqual(PX);

      // A QUIET HOUR IS AS TALL AS IT ALWAYS WAS: two 48px half-hour slots.
      // Only where 15:00 really is quiet in every column on screen; if another
      // run left a row there, the arm says so instead of measuring its hour.
      const busyAt15 = await page
        .locator('[data-testid="agenda-start-group"]')
        .evaluateAll((els) => els.filter((el) => Math.floor(Number(el.getAttribute("data-start-min")) / 60) === 15).length);
      if (busyAt15 === 0) {
        const quiet = await edges(slotAt(page, "15:00"), "the 15:00 slot");
        const afterQuiet = await edges(slotAt(page, "16:00"), "the 16:00 slot");
        expect(Math.abs(afterQuiet.top - quiet.top - 96), "the empty 15:00 hour is 96px").toBeLessThanOrEqual(PX);
      } else {
        testInfo.annotations.push({ type: "not-measured", description: "15:00 holds another run's rows; the quiet-hour height was not asserted" });
      }

      // A CLICK ON THE NEXT HOUR BOOKS THE NEXT HOUR.
      await slotAt(page, "11:00").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 8_000 });
      await expect(dialog).toContainText(/Nova marca/i);
      await expectTime(dialog, "11:00");
    });
  }

  for (const view of ["day", "week"] as const) {
    test(`${view} view: with a seventh appointment at 10:30, the six end above it and it ends above 11:00`, async ({
      page,
    }, testInfo) => {
      const seventh = await db
        .from("appointments")
        .upsert(row(SEVENTH, PATIENTS[6]!.id, roster[6 % roster.length]!, "10:30", "11:00"));
      if (seventh.error) throw new Error(`seventh appointment insert failed: ${seventh.error.message}`);

      await open(page, view);
      await expect(card(page, SEVENTH)).toBeVisible();
      await shot(page, testInfo, `seven-${view}`);

      const m = await expectAllShownWithNoInnerScroll(page, [...SIX, SEVENTH], testInfo, `seven-${view}`);
      const half = m.cards.find((c) => c.id === SEVENTH)!;
      const six = m.cards.filter((c) => c.id !== SEVENTH).sort((a, b) => a.top - b.top);
      expect(six.at(-1)!.bottom, "the last 10:00 card ends at or above the 10:30 card").toBeLessThanOrEqual(
        half.top + PX,
      );

      // The 10:30 card is on the 10:30 row, and ends above 11:00.
      const halfSlot = await edges(slotAt(page, "10:30"), "the 10:30 slot");
      expect(Math.abs(half.top - halfSlot.top), "the 10:30 card starts on the 10:30 row").toBeLessThanOrEqual(PX);
      const next = await edges(slotAt(page, "11:00"), "the 11:00 slot");
      expect(half.bottom, "the 10:30 card ends at or above the top of the 11:00 row").toBeLessThanOrEqual(
        next.top + PX,
      );

      await slotAt(page, "11:00").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 8_000 });
      await expectTime(dialog, "11:00");
    });
  }
});
