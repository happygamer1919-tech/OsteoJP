/**
 * agenda-mobile-week.spec.ts - the agenda week on a phone.
 *
 * TWO CARDS LIVE HERE.
 *   AGMOB-01 (2026-09-21): the week became REACHABLE on a phone. A client-side
 *     matchMedia override had forced Dia below `lg` and hidden the toggle.
 *   AGENDA-MOBILE-WEEK: below 640px Semana is the week GRID, compressed (the
 *     owner's ruling), with side-by-side lanes, a sticky day header that opens
 *     Dia, and the Dia/Semana choice remembered per device. The same card closes
 *     the toolbar overflow AGMOB-01 found and carded (AGENDA-toolbar-overflows-
 *     at-390): at 390px `document.documentElement.scrollWidth` read 479.
 *
 * WHAT EACH ARM MEASURES, AND WHY AS GEOMETRY. `toBeVisible()` is true of a
 * control painted underneath another one, and an overflow check alone passes on
 * two controls sliding over each other. So side by side is asserted as two
 * boxes that overlap vertically and are disjoint horizontally, the toolbar as
 * pairwise disjoint boxes inside the viewport, and "fits" as the browser's own
 * `scrollWidth <= clientWidth` - the card's acceptance, word for word.
 *
 * THE TWIN FIXTURE. A twin pair is one PERSON row and one MACHINE row with the
 * same patient and the same start. The machine is a login-less shared-resource
 * user built here with the service-role key, as nesa-shared-resource.spec.ts
 * builds its own, under its OWN ids so the two files never touch each other's
 * rows, and removed afterwards. The key is REQUIRED, not optional: a missing key
 * throws rather than skipping, because a skipped twin arm inside a green shard
 * would read as proof of something it never ran.
 *
 * WHAT THIS SPEC CANNOT SAY. No CI job on this repository runs WebKit or
 * Firefox (`--project=chromium` alone in .github/workflows/e2e.yml). Chromium
 * at 390x844 emulates a viewport, not the iPhone the clinic holds. Acceptance on
 * the engine is WF-03: the therapist's own phone.
 *
 * NOT IN `HARD_REQUIRED` (.github/scripts/assert-e2e-executed.mjs): that list
 * is for tests load-bearing on a gate, not for important ones.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import {
  LOCATION,
  PATIENTS,
  RUN_DAY_BASE,
  SERVICE,
  TENANT_A,
  THERAPIST_NAME,
  futureWeekdayDate,
} from "./fixtures";

const PHONE = { width: 390, height: 844 };
const NARROW_PHONE = { width: 360, height: 780 };
/**
 * Letters of the first name every half-lane block paints, at 390 and at 360,
 * both with Dom shown (the narrowest lanes each width draws), or the whole of
 * a shorter name. The name has its own line across the face: 21.4px at 390,
 * 19.3px at 360. At 9px "Gem" is 20.2px, so at 360 this file's "Gemeo" shows
 * two letters (measured) where "Ana" shows three.
 */
const NAME_LETTERS = { phone: 3, narrow: 2 } as const;
const DESKTOP = { width: 1440, height: 900 };

/** This file's day. One offset per spec file (e2e-spec-days-do-not-collide).
 *  Never a Sunday: the desktop control below reads the Mon-Sat grid. */
const DAY = futureWeekdayDate(RUN_DAY_BASE + 140);

/** The twin pair's own ids, distinct from nesa-shared-resource.spec.ts's. */
const TWIN_MACHINE_ID = "00000000-0000-4000-8000-00000000b6a0";
const TWIN_MACHINE_NAME = "NESA Gemeo (E2E)";
const TWIN_PATIENT = { id: "00000000-0000-4000-8000-00000000b6a1", name: "Gemeo Sintetico" };
const TWIN_PERSON_APPT = "00000000-0000-4000-8000-00000000b6b1";
const TWIN_MACHINE_APPT = "00000000-0000-4000-8000-00000000b6b2";
/** A booking on that week's SUNDAY, so the phone grid draws seven columns:
 *  the narrowest lanes it ever draws at a given width. */
const SUNDAY_APPT = "00000000-0000-4000-8000-00000000b6b3";
/** 15:00 Lisbon, clear of the 10:00 slot the first test books through the UI. */
const TWIN_AT = "15:00";
/**
 * A THIRD row at the twin's minute: a person row of another patient on the
 * same therapist, as in a "Todos os terapeutas" view. Its patient's name sorts
 * before the twin's, so without the twin rule (Q-B6-1) the two person rows
 * took the two lanes and the twin's machine row went behind the chip. With it,
 * the twin keeps both lanes and this row is the one behind "+1". The twin's
 * machine is installed at no clinic, so the page does not list it as a machine:
 * the pair is recognised by the patient and the start (measured on a local
 * stack: a rule keyed on the machine flag hid the machine row here).
 */
const TWIN_THIRD = { id: "00000000-0000-4000-8000-00000000b6b7", patient: PATIENTS.ana } as const;
/**
 * Q-B6-1's crowded moment: three 30-minute rows at once on DAY, all on the e2e
 * therapist (only CONFIRMED rows may not overlap, 0061), patients from the
 * seed. The card's default is two blocks and a "+1" chip. Thirty minutes is the
 * shortest block, the tightest face a half lane draws.
 */
const CROWD_AT = "17:00";
const CROWD = [
  { id: "00000000-0000-4000-8000-00000000b6b4", patient: PATIENTS.ana },
  { id: "00000000-0000-4000-8000-00000000b6b5", patient: PATIENTS.joao },
  { id: "00000000-0000-4000-8000-00000000b6b6", patient: PATIENTS.maria },
] as const;
/**
 * A crowd whose rows do NOT start together (round 6): 12:30-13:15 and
 * 12:45-13:30 hold both lanes at 13:00, so the 13:00 row is hidden, and the
 * 13:15 row takes the left lane when 12:30 ends, 15 minutes after the hidden
 * row. A chip drawn at 13:00 plus 22px lay across 13:15's time and name lines;
 * it must sit on 13:15's glyph line instead. Bookings on :15 and :45 do this.
 */
const STAGGER = [
  { id: "00000000-0000-4000-8000-00000000b6b8", at: "12:30", minutes: 45, patient: PATIENTS.joao },
  { id: "00000000-0000-4000-8000-00000000b6b9", at: "12:45", minutes: 45, patient: PATIENTS.maria },
  { id: "00000000-0000-4000-8000-00000000b6ba", at: "13:00", minutes: 30, patient: PATIENTS.ana },
  { id: "00000000-0000-4000-8000-00000000b6bb", at: "13:15", minutes: 30, patient: PATIENTS.joao },
] as const;
const STAGGER_HIDDEN = STAGGER[2];
const STAGGER_LEFT = STAGGER[3];
/**
 * A twin pair under a row that started EARLIER (round 7 review): the 18:15 row
 * still runs at 18:30, when a second twin pair starts (another patient, the
 * same therapist and machine). Round 7's first-fit kept the 18:15 row in the
 * left lane, gave the pair's person row the right lane and hid its machine
 * row. The pair takes both lanes, and the 18:15 row is the one behind "+1".
 */
const UNDER_EARLIER = {
  early: { id: "00000000-0000-4000-8000-00000000b6bc", at: "18:15", minutes: 45, patient: PATIENTS.joao },
  at: "18:30",
  person: "00000000-0000-4000-8000-00000000b6bd",
  machine: "00000000-0000-4000-8000-00000000b6be",
  patient: PATIENTS.maria,
} as const;

/** Monday of DAY's week and the six Mon-Sat days, computed here and never read
 *  back off the page: a test asking the page which days it shows cannot notice
 *  it showing the wrong ones. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function monToSat(monday: string): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${monday}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
const MONDAY = mondayOf(DAY);
const SUNDAY = (() => {
  const d = new Date(`${MONDAY}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
})();
/** The browser clock the now-line controls fix: DAY, 10:10 Lisbon, inside the
 *  08:00-21:00 window, on a week this file shows. Early in the day on purpose:
 *  the now-line test scrolls the line up UNDER the pinned day header, which
 *  needs more page below the line than a phone screen holds. */
const FIXED_NOW = lisbonDateTimeToUtc(DAY, "10:10");
/** The desktop control's clock: late in the window, so that a scroll computed
 *  from a HIDDEN tree's zero-sized boxes would still come out positive. At
 *  10:10 that arithmetic clamps to 0 and the control could not fail (measured:
 *  removing the displayed-tree guard left it green). */
const FIXED_EVENING = lisbonDateTimeToUtc(DAY, "20:10");

type Box = { x: number; y: number; width: number; height: number };

function disjoint(a: Box, b: Box): boolean {
  return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
}

/**
 * Wait until React has hydrated the toolbar. A server-rendered page answers to
 * locators before any effect has run, so an assertion that a client-side
 * redirect did NOT happen means nothing until the effects could have run.
 */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="agenda-toolbar"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
    },
    null,
    { timeout: 30_000 },
  );
}

async function box(locator: Locator, what: string): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, `${what} has a box`).not.toBeNull();
  return b!;
}

/** The card's acceptance, measured by the browser: nothing scrolls sideways. */
async function pageOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number; widest: string }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    let widest = { sel: "(none)", right: 0 };
    for (const n of Array.from(document.body.querySelectorAll("*"))) {
      const r = (n as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.right > widest.right) {
        widest = { sel: `${n.tagName}.${String((n as HTMLElement).className).slice(0, 60)}`, right: Math.round(r.right) };
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest: `${widest.sel} @ ${widest.right}px` };
  });
}

type Face = {
  id: string;
  lanes: string;
  width: number;
  height: number;
  timeScroll: number;
  timeClient: number;
  timeFontPx: number;
  /** How many leading characters of the name lie wholly inside its box. */
  nameVisible: number;
  /** The name's length, so a short name is not asked for more than it has. */
  nameLength: number;
};

/** Every visible block in the phone grid, measured part by part. */
async function faceReport(page: Page): Promise<Face[]> {
  return page.evaluate(() => {
    const out: Face[] = [];
    const targets = document.querySelectorAll<HTMLElement>("[data-compact-appointment-id]");
    for (const el of Array.from(targets)) {
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      const time = el.querySelector<HTMLElement>("[data-testid='agenda-compact-time']");
      const name = el.querySelector<HTMLElement>("[data-testid='agenda-compact-patient']");
      let nameVisible = -1;
      if (name?.firstChild) {
        const right = name.getBoundingClientRect().right;
        const text = name.textContent ?? "";
        nameVisible = 0;
        for (let i = 1; i <= text.length; i++) {
          const r = document.createRange();
          r.setStart(name.firstChild, 0);
          r.setEnd(name.firstChild, i);
          if (r.getBoundingClientRect().right <= right + 0.01) nameVisible = i;
          else break;
        }
      }
      out.push({
        id: el.dataset.compactAppointmentId ?? "more",
        lanes: el.dataset.compactLanes ?? "chip",
        width: box.width,
        height: box.height,
        timeScroll: time ? time.scrollWidth : 0,
        timeClient: time ? time.clientWidth : 0,
        timeFontPx: time ? Number.parseFloat(getComputedStyle(time).fontSize) : 9,
        nameVisible,
        nameLength: name?.textContent?.length ?? 0,
      });
    }
    return out;
  });
}

type Chip = {
  count: string;
  box: Box;
  /** The "+N" is painted whole: its scrollWidth fits its clientWidth. */
  textFits: boolean;
  /** Every time, name and glyph box of every block in the chip's column that
   *  the chip's box intersects, as "id:part". Must be empty. */
  covers: string[];
};

/** Every visible "+N" chip, and what, if anything, of a block's face it covers. */
async function chipReport(page: Page): Promise<Chip[]> {
  return page.evaluate(() => {
    // Boxes that only touch do not count: layout rounds to 1/64 px.
    const hits = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.1 && b.left < a.right - 0.1 && a.top < b.bottom - 0.1 && b.top < a.bottom - 0.1;
    const out: Chip[] = [];
    for (const chip of Array.from(document.querySelectorAll<HTMLElement>("[data-testid='agenda-compact-more']"))) {
      const c = chip.getBoundingClientRect();
      if (c.width === 0) continue;
      const covers: string[] = [];
      const column = chip.closest("[data-compact-day]");
      for (const block of Array.from(column?.querySelectorAll<HTMLElement>("[data-compact-appointment-id]") ?? [])) {
        for (const [part, sel] of [
          ["time", "[data-testid='agenda-compact-time']"],
          ["name", "[data-testid='agenda-compact-patient']"],
          // The glyph's SVG: its wrapper is a flex item stretched to the face's width.
          ["glyph", "[data-estado] svg"],
        ] as const) {
          const el = block.querySelector<HTMLElement>(sel);
          if (el && hits(c, el.getBoundingClientRect())) covers.push(`${block.dataset.compactAppointmentId}:${part}`);
        }
      }
      out.push({
        count: chip.textContent ?? "",
        box: { x: c.x, y: c.y, width: c.width, height: c.height },
        textFits: chip.scrollWidth <= chip.clientWidth + 0.5,
        covers,
      });
    }
    return out;
  });
}

/** Service-role client against the local stack. Never production. */
function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and the Supabase URL) must be set: agenda-mobile-week.spec.ts " +
        "builds its twin pair with the service role. It refuses to skip, because a skipped twin " +
        "arm would read as a pass.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function removeTwin(db: SupabaseClient): Promise<void> {
  await db
    .from("appointments")
    .delete()
    .in("id", [
      TWIN_PERSON_APPT,
      TWIN_MACHINE_APPT,
      TWIN_THIRD.id,
      SUNDAY_APPT,
      ...CROWD.map((c) => c.id),
      ...STAGGER.map((c) => c.id),
      UNDER_EARLIER.early.id,
      UNDER_EARLIER.person,
      UNDER_EARLIER.machine,
    ]);
  await db.from("appointments").delete().eq("tenant_id", TENANT_A).eq("practitioner_id", TWIN_MACHINE_ID);
  await db.from("appointments").delete().eq("tenant_id", TENANT_A).eq("patient_id", TWIN_PATIENT.id);
  await db.from("patients").delete().eq("id", TWIN_PATIENT.id);
  const gone = await db.from("users").delete().eq("id", TWIN_MACHINE_ID);
  // A row something still references cannot be deleted; retire it instead so it
  // can neither be booked nor reappear in a list.
  if (gone.error) {
    await db.from("users").update({ is_active: false, is_bookable: false }).eq("id", TWIN_MACHINE_ID);
  }
}

test.describe("the agenda week on a phone (AGMOB-01, AGENDA-MOBILE-WEEK)", () => {
  // `.tap()` REQUIRES hasTouch; a touch-capable context still clicks, so the
  // desktop controls are unaffected.
  test.use({ hasTouch: true });

  let db: SupabaseClient;

  test.beforeAll(async () => {
    db = serviceClient();
    await removeTwin(db);
    const role = must(
      await db.from("roles").select("id").eq("tenant_id", TENANT_A).eq("slug", "therapist").single(),
      "therapist role",
    ) as { id: string };
    const therapist = must(
      await db.from("users").select("id").eq("tenant_id", TENANT_A).eq("email", "e2e-therapist@osteojp.test").single(),
      "seeded therapist",
    ) as { id: string };
    must(
      await db.from("users").upsert({
        id: TWIN_MACHINE_ID,
        tenant_id: TENANT_A,
        role_id: role.id,
        email: "e2e-b6-twin-nesa@osteojp.test",
        full_name: TWIN_MACHINE_NAME,
        is_bookable: false,
        is_active: true,
        is_shared_resource: true,
      }),
      "twin machine row",
    );
    must(
      await db.from("patients").insert({
        id: TWIN_PATIENT.id,
        tenant_id: TENANT_A,
        full_name: TWIN_PATIENT.name,
        created_by: therapist.id,
        primary_location_id: LOCATION.id,
      }),
      "twin patient",
    );
    const row = (id: string, practitionerId: string, date: string, at: string, minutes = 45, patientId: string = TWIN_PATIENT.id) => {
      const startsAt = lisbonDateTimeToUtc(date, at);
      return {
        id,
        tenant_id: TENANT_A,
        patient_id: patientId,
        practitioner_id: practitionerId,
        location_id: LOCATION.id,
        service_id: SERVICE.id,
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
        status: "scheduled",
        created_by: therapist.id,
      };
    };
    must(
      await db.from("appointments").insert([
        row(TWIN_PERSON_APPT, therapist.id, DAY, TWIN_AT),
        row(TWIN_MACHINE_APPT, TWIN_MACHINE_ID, DAY, TWIN_AT),
        row(TWIN_THIRD.id, therapist.id, DAY, TWIN_AT, 45, TWIN_THIRD.patient.id),
        row(SUNDAY_APPT, therapist.id, SUNDAY, "10:00"),
        ...CROWD.map((c) => row(c.id, therapist.id, DAY, CROWD_AT, 30, c.patient.id)),
        ...STAGGER.map((c) => row(c.id, therapist.id, DAY, c.at, c.minutes, c.patient.id)),
        row(
          UNDER_EARLIER.early.id,
          therapist.id,
          DAY,
          UNDER_EARLIER.early.at,
          UNDER_EARLIER.early.minutes,
          UNDER_EARLIER.early.patient.id,
        ),
        row(UNDER_EARLIER.person, therapist.id, DAY, UNDER_EARLIER.at, 45, UNDER_EARLIER.patient.id),
        row(UNDER_EARLIER.machine, TWIN_MACHINE_ID, DAY, UNDER_EARLIER.at, 45, UNDER_EARLIER.patient.id),
      ]),
      "the twin pairs, the rows around them, the two crowds and the Sunday booking",
    );
  });

  test.afterAll(async () => {
    if (db) await removeTwin(db);
  });

  test("Semana is reachable at 390px and is the week GRID: the right days, a twin pair side by side, a block opens its own sheet", async ({
    page,
  }) => {
    // ---- a UI booking in this week too, at desktop width where the slot
    // buttons are, so the grid carries a row this run made through the form.
    await page.setViewportSize(DESKTOP);
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
    await page.getByRole("button", { name: /10:00$/ }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 8_000 });
    const patient = drawer.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.joao.name);
    await drawer.getByRole("option", { name: PATIENTS.joao.name }).click();
    await drawer.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
    await drawer.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
    await drawer.getByRole("button", { name: "Guardar" }).click();
    await expect(drawer).toBeHidden({ timeout: 12_000 });

    // ---- the phone, arriving the way the dashboard tile arrives: ?view=day.
    await page.setViewportSize(PHONE);
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
    // A tap on the server-rendered toggle before React hydrates it does
    // nothing, and the URL assertion below would then read a slow machine as a
    // broken toggle (seen on a loaded local stack).
    await hydrated(page);

    // ARM 1 - the toggle is reachable and not painted under the date picker.
    const semana = page.getByRole("radiogroup", { name: "Agenda" }).getByRole("radio", { name: "Semana" });
    await expect(semana).toBeVisible();
    // The picker is a TEXTBOX (`textbox "Escolher data"`); asking for a button
    // never resolves and burns the whole timeout.
    expect(
      disjoint(await box(semana, "Semana"), await box(page.getByRole("textbox", { name: /Escolher data/i }), "the date picker")),
      "Semana does not sit on top of the date picker",
    ).toBe(true);
    await semana.tap();
    await expect(page).toHaveURL(/view=week/);

    // ARM 2 - the GRID, not the list: Mon-Sat columns in order, then Dom,
    // because this file booked that Sunday. Seven columns are the narrowest
    // lanes the grid draws at 390, which is what ARM 5 measures.
    const compact = page.getByTestId("agenda-compact-week");
    await expect(compact).toBeVisible();
    await expect(page.getByTestId("agenda-week-list")).toBeHidden();
    const days = await page
      .locator("[data-compact-day]")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.compactDay));
    expect(days, "Mon-Sat in order, then that week's Sunday").toEqual([...monToSat(MONDAY), SUNDAY]);

    // ARM 3 - NOTHING SCROLLS SIDEWAYS. The card's acceptance, at page scope,
    // with the week drawn. The widest element is in the message so a failure
    // arrives diagnosed.
    const o = await pageOverflow(page);
    expect(o.clientWidth, "the page has a width").toBeGreaterThan(0);
    expect(o.scrollWidth, `page scrollWidth ${o.scrollWidth} vs ${o.clientWidth}; widest: ${o.widest}`).toBeLessThanOrEqual(
      o.clientWidth,
    );

    // ARM 4 - THE TWIN PAIR RENDERS SIDE BY SIDE, with a third row starting
    // at the same minute (the "Todos" case): two boxes that overlap
    // vertically and are disjoint horizontally, both inside the day's column,
    // and the third row behind a "+1" chip at that minute.
    const person = page.locator(`[data-compact-appointment-id="${TWIN_PERSON_APPT}"]`);
    const machine = page.locator(`[data-compact-appointment-id="${TWIN_MACHINE_APPT}"]`);
    await expect(person).toBeVisible();
    await expect(machine).toBeVisible();
    const p = await box(person, "the person row");
    const m = await box(machine, "the machine row");
    const col = await box(page.locator(`[data-compact-day="${DAY}"]`), "the day column");
    expect(p.y < m.y + m.height && m.y < p.y + p.height, "the twins overlap vertically").toBe(true);
    expect(Math.abs(p.y - m.y), "the twins start on the same line").toBeLessThanOrEqual(1);
    expect(p.x + p.width <= m.x || m.x + m.width <= p.x, "the twins are disjoint horizontally").toBe(true);
    for (const [b, what] of [
      [p, "person"],
      [m, "machine"],
    ] as const) {
      expect(b.x, `${what} starts inside its column`).toBeGreaterThanOrEqual(col.x - 0.5);
      expect(b.x + b.width, `${what} ends inside its column`).toBeLessThanOrEqual(col.x + col.width + 0.5);
      expect(b.width, `${what} is about half the column`).toBeLessThan(col.width * 0.6);
    }
    // Person left, machine right.
    expect(p.x).toBeLessThan(m.x);
    // The third row is not drawn; the chip at the twin's minute stands for it.
    await expect(page.locator(`[data-compact-appointment-id="${TWIN_THIRD.id}"]`)).toBeHidden();
    const twinChip = page.locator(`[data-compact-day="${DAY}"] [data-testid="agenda-compact-more"][data-compact-more-at="${TWIN_AT}"]`);
    await expect(twinChip).toHaveCount(1);
    await expect(twinChip).toHaveText("+1");

    // ARM 4b - A TWIN PAIR UNDER A ROW THAT STARTED EARLIER (round 7 review).
    // The 18:15 row still runs at 18:30, when the second pair starts. The
    // pair is side by side all the same, person left, on one line, and the
    // 18:15 row is not drawn: a "+1" chip picked by its start stands for it.
    const person2 = page.locator(`[data-compact-appointment-id="${UNDER_EARLIER.person}"]`);
    const machine2 = page.locator(`[data-compact-appointment-id="${UNDER_EARLIER.machine}"]`);
    await expect(person2).toBeVisible();
    await expect(machine2).toBeVisible();
    const p2 = await box(person2, "the second pair's person row");
    const m2 = await box(machine2, "the second pair's machine row");
    expect(Math.abs(p2.y - m2.y), "the second pair starts on one line").toBeLessThanOrEqual(1);
    expect(p2.x + p2.width <= m2.x, "the second pair is side by side, person left").toBe(true);
    for (const [b, what] of [
      [p2, "person"],
      [m2, "machine"],
    ] as const) {
      expect(b.x, `second pair ${what} starts inside its column`).toBeGreaterThanOrEqual(col.x - 0.5);
      expect(b.x + b.width, `second pair ${what} ends inside its column`).toBeLessThanOrEqual(col.x + col.width + 0.5);
    }
    await expect(page.locator(`[data-compact-appointment-id="${UNDER_EARLIER.early.id}"]`)).toBeHidden();
    const earlyChip = page.locator(
      `[data-compact-day="${DAY}"] [data-testid="agenda-compact-more"][data-compact-more-at="${UNDER_EARLIER.early.at}"]`,
    );
    await expect(earlyChip).toHaveCount(1);
    await expect(earlyChip).toHaveText("+1");

    // ARM 5 - WHAT THE FACE SHOWS, measured on the parts, not on the block.
    // `toContainText` reads textContent, which holds "15:00" even when CSS
    // cuts it to "1...", and the block itself never overflows because its
    // children clip themselves. So: the TIME element's own scrollWidth fits its
    // clientWidth (the whole "15:00" is painted), the first letters of the name
    // lie inside the name element's box, and every block is a 24px target
    // (the "+N" chip is not; ARM 5b measures it). At 390 with Dom shown, the
    // narrowest lanes this width draws.
    await expect(person).toContainText(TWIN_AT);
    await expect(person.getByTestId("agenda-compact-patient")).toHaveText(TWIN_PATIENT.name.split(" ")[0]!);
    const faces = await faceReport(page);
    expect(faces.length, "blocks to measure").toBeGreaterThanOrEqual(4);
    const halves = faces.filter((f) => f.lanes === "2").map((f) => f.id);
    for (const id of [TWIN_PERSON_APPT, TWIN_MACHINE_APPT]) {
      expect(halves, "the twin pair is measured in half lanes").toContain(id);
    }
    for (const f of faces) {
      expect(f.timeScroll, `${f.id}: the whole start time is painted (${f.timeScroll} <= ${f.timeClient})`).toBeLessThanOrEqual(
        f.timeClient + 0.5,
      );
      expect(f.timeFontPx, `${f.id}: the start time is not shrunk past legibility`).toBeGreaterThanOrEqual(7);
      expect(f.width, `${f.id}: at least 24px wide`).toBeGreaterThanOrEqual(24);
      expect(f.height, `${f.id}: at least 24px tall`).toBeGreaterThanOrEqual(24);
    }
    // THE NAME, IN EVERY HALF-LANE BLOCK, the 30-minute ones included: at
    // least three letters (or the whole of a shorter name) at 390 with Dom.
    for (const f of faces.filter((x) => x.lanes === "2")) {
      expect(f.nameVisible, `${f.id}: the first letters of the name are painted (${f.nameVisible})`).toBeGreaterThanOrEqual(
        Math.min(3, f.nameLength),
      );
    }

    // ARM 5b - Q-B6-1, THE CARD'S DEFAULT: three rows at once read TWO blocks
    // side by side and a "+1" chip, and the chip covers no time, name or
    // glyph of any block in its column.
    const crowd = await page
      .locator(CROWD.map((c) => `[data-compact-appointment-id="${c.id}"]`).join(", "))
      .evaluateAll((els) =>
        els
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => ({ id: (e as HTMLElement).dataset.compactAppointmentId!, lane: (e as HTMLElement).dataset.compactLane! })),
      );
    expect(crowd.map((c) => c.lane).sort(), "three at once: two blocks, one in each lane").toEqual(["0", "1"]);
    const [c0, c1] = await Promise.all(
      crowd.map((c) => box(page.locator(`[data-compact-appointment-id="${c.id}"]`), `crowded ${c.id}`)),
    );
    expect(Math.abs(c0!.y - c1!.y), "the two crowded blocks start on the same line").toBeLessThanOrEqual(1);
    expect(disjoint(c0!, c1!), "the two crowded blocks are side by side, not on top of each other").toBe(true);
    // The day holds other chips (the twin's minute, ARM 4b's, ARM 5c's), so
    // this one is picked by its minute.
    const dayChips = page.locator(
      `[data-compact-day="${DAY}"] [data-testid="agenda-compact-more"][data-compact-more-at="${CROWD_AT}"]`,
    );
    await expect(dayChips).toHaveCount(1);
    await expect(dayChips).toHaveText("+1");
    for (const vp of [PHONE, NARROW_PHONE]) {
      await page.setViewportSize(vp);
      const chips = await chipReport(page);
      expect(chips.length, `${vp.width}: chips to measure`).toBeGreaterThanOrEqual(1);
      for (const c of chips) {
        expect(c.textFits, `${vp.width}: "${c.count}" is painted whole (${c.box.width.toFixed(1)}px)`).toBe(true);
        expect(c.covers, `${vp.width}: "${c.count}" covers no face part`).toEqual([]);
      }
      // The chip is ON the crowded moment: inside the two blocks' rows,
      // between their left and right edges.
      const [b0, b1] = await Promise.all(
        crowd.map((c) => box(page.locator(`[data-compact-appointment-id="${c.id}"]`), `${vp.width} crowded ${c.id}`)),
      );
      const chip = await box(dayChips, `${vp.width}: the chip`);
      const left = Math.min(b0!.x, b1!.x);
      const right = Math.max(b0!.x + b0!.width, b1!.x + b1!.width);
      expect(chip.y, `${vp.width}: the chip is below the blocks' tops`).toBeGreaterThan(b0!.y);
      expect(chip.y + chip.height, `${vp.width}: the chip ends inside the blocks`).toBeLessThanOrEqual(b0!.y + b0!.height + 0.5);
      expect(chip.x, `${vp.width}: the chip starts inside the pair`).toBeGreaterThan(left);
      expect(chip.x + chip.width, `${vp.width}: the chip ends inside the pair`).toBeLessThan(right);

      // The time, and the name in every half-lane block, at this width too.
      // A half lane at 360 is narrower than 24px with Dom shown (the
      // arithmetic in DECISIONS, Q-B6-1), so the tap size is not asserted.
      for (const f of await faceReport(page)) {
        expect(f.timeScroll, `${vp.width} ${f.id}: the whole start time is painted`).toBeLessThanOrEqual(f.timeClient + 0.5);
        if (f.lanes === "2") {
          expect(f.nameVisible, `${vp.width} ${f.id}: letters of the name painted (${f.nameVisible})`).toBeGreaterThanOrEqual(
            Math.min(NAME_LETTERS[vp.width === PHONE.width ? "phone" : "narrow"], f.nameLength),
          );
        }
      }
    }
    // ARM 5c - A CHIP NEVER LIES ACROSS A LEFT BLOCK THAT STARTS SOON AFTER
    // ITS HIDDEN ROWS (round 6). The 13:00 row is hidden, the 13:15 row is
    // drawn in the left lane, and the chip for 13:00 sits on 13:15's glyph
    // line: inside that block's box, below its time and name, after its glyph.
    // chipReport above already asserts that NO chip covers a time, name or
    // glyph; this arm proves that report saw this chip.
    await expect(page.locator(`[data-compact-appointment-id="${STAGGER_HIDDEN.id}"]`)).toBeHidden();
    const staggerLeft = page.locator(`[data-compact-appointment-id="${STAGGER_LEFT.id}"]`);
    await expect(staggerLeft).toHaveAttribute("data-compact-lane", "0");
    const staggerChip = page.locator(
      `[data-compact-day="${DAY}"] [data-testid="agenda-compact-more"][data-compact-more-at="${STAGGER_HIDDEN.at}"]`,
    );
    await expect(staggerChip).toHaveCount(1);
    await expect(staggerChip).toHaveText("+1");
    for (const vp of [PHONE, NARROW_PHONE]) {
      await page.setViewportSize(vp);
      const chips = await chipReport(page);
      const chip = await box(staggerChip, `${vp.width}: the ${STAGGER_HIDDEN.at} chip`);
      const mine = chips.filter((c) => Math.abs(c.box.x - chip.x) < 0.5 && Math.abs(c.box.y - chip.y) < 0.5);
      expect(mine, `${vp.width}: the report measured the ${STAGGER_HIDDEN.at} chip`).toHaveLength(1);
      expect(mine[0]!.covers, `${vp.width}: the ${STAGGER_HIDDEN.at} chip covers no face part`).toEqual([]);
      const left = await box(staggerLeft, `${vp.width}: the ${STAGGER_LEFT.at} block`);
      const name = await box(staggerLeft.getByTestId("agenda-compact-patient"), `${vp.width}: its name`);
      expect(chip.y, `${vp.width}: the chip is below the ${STAGGER_LEFT.at} block's name`).toBeGreaterThanOrEqual(
        name.y + name.height - 0.5,
      );
      expect(chip.y + chip.height, `${vp.width}: the chip ends inside that block`).toBeLessThanOrEqual(left.y + left.height + 0.5);
      expect(chip.x, `${vp.width}: the chip starts inside that block, after its glyph`).toBeGreaterThan(left.x);
    }

    await page.setViewportSize(PHONE);
    // The chip opens Dia for its day.
    await dayChips.tap();
    await expect(page).toHaveURL(new RegExp(`view=day&date=${DAY}`));
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await expect(page.getByTestId("agenda-compact-week")).toBeVisible();
    await hydrated(page);

    // ARM 6 - a block opens the RIGHT appointment's existing edit sheet. By id:
    // the drawer prints it, and a neighbour's row cannot produce it.
    await person.tap();
    const opened = page.getByRole("dialog");
    await expect(opened).toBeVisible({ timeout: 8_000 });
    await expect(opened.getByTestId("drawer-appointment-id")).toHaveText(TWIN_PERSON_APPT);
    await page.keyboard.press("Escape");
    await expect(opened).toBeHidden({ timeout: 8_000 });

    // ARM 7 - the sticky day header is a button into Dia for that day.
    await page.locator(`[data-compact-header-day="${DAY}"]`).tap();
    await expect(page).toHaveURL(new RegExp(`view=day&date=${DAY}`));
    await expect(page.getByTestId("agenda-week-list")).toBeVisible();

    await page.screenshot({ path: "test-results/agenda-390-semana.png" });
  });

  test("the toolbar fits at 390 and at 360: Nova marcação inside the viewport, no control over another, no sideways scroll", async ({
    page,
  }) => {
    for (const vp of [PHONE, NARROW_PHONE]) {
      await page.setViewportSize(vp);
      for (const view of ["week", "day"] as const) {
        await page.goto(`/agenda?view=${view}&date=${DAY}`);
        await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
        const toolbar = page.getByTestId("agenda-toolbar");

        const nova = toolbar.getByRole("button", { name: /Nova marca/ });
        await expect(nova).toBeVisible();
        const n = await box(nova, "Nova marcação");
        expect(n.x, `${vp.width} ${view}: Nova marcação starts on screen`).toBeGreaterThanOrEqual(0);
        expect(n.x + n.width, `${vp.width} ${view}: Nova marcação ends on screen`).toBeLessThanOrEqual(vp.width);
        // THE LABEL FITS, not merely the box.
        expect(
          await nova.evaluate((e) => e.scrollWidth <= e.clientWidth),
          `${vp.width} ${view}: the Nova marcação label is not clipped`,
        ).toBe(true);

        // ATUALIZAR SAYS WHAT IT DOES. Its visible text is the freshness time,
        // a reading; the refresh icon is the only visible verb, and a title
        // tooltip does not exist on touch. So the icon is painted, inside the
        // button, at both widths (Q-B6-10 hides only the decorative icons).
        const refresh = toolbar.getByTestId("agenda-refresh");
        const icon = refresh.getByTestId("agenda-refresh-icon");
        await expect(icon, `${vp.width} ${view}: the refresh icon is shown`).toBeVisible();
        const rb = await box(refresh, "Atualizar");
        const ib = await box(icon, "the refresh icon");
        expect(ib.width, `${vp.width} ${view}: the refresh icon has a size`).toBeGreaterThanOrEqual(12);
        expect(
          ib.x >= rb.x && ib.x + ib.width <= rb.x + rb.width,
          `${vp.width} ${view}: the refresh icon sits inside its button`,
        ).toBe(true);
        expect(
          await refresh.evaluate((e) => e.scrollWidth <= e.clientWidth),
          `${vp.width} ${view}: the Atualizar content is not clipped`,
        ).toBe(true);

        // Every visible control, pairwise disjoint and inside the viewport. An
        // overflow check alone passes on two controls sliding over each other.
        // And inside the toolbar's CONTENT box, not merely the screen: a group
        // that spills into the 24px side padding scrolls nothing and clips
        // nothing, so the two checks above cannot see it. With the refresh icon
        // kept at 360 and no trims, the action group was about 324px in a 312px
        // box and ran 12px into the right gutter (measured).
        const content = await toolbar.evaluate((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return { left: r.left + Number.parseFloat(cs.paddingLeft), right: r.right - Number.parseFloat(cs.paddingRight) };
        });
        expect(content.right - content.left, `${vp.width} ${view}: the toolbar has a content box`).toBeGreaterThan(200);
        const controls = toolbar.locator("button:visible, select:visible, input:visible, [role=radio]:visible");
        const boxes: { name: string; b: Box }[] = [];
        for (const c of await controls.all()) {
          const b = await c.boundingBox();
          if (!b || b.width === 0) continue;
          const name = (await c.getAttribute("aria-label")) ?? (await c.innerText()).trim().slice(0, 24);
          boxes.push({ name, b });
          expect(b.x + b.width, `${vp.width} ${view}: "${name}" ends on screen`).toBeLessThanOrEqual(vp.width + 0.5);
          expect(b.x, `${vp.width} ${view}: "${name}" starts on screen`).toBeGreaterThanOrEqual(-0.5);
          expect(b.x + b.width, `${vp.width} ${view}: "${name}" ends inside the toolbar's content box`).toBeLessThanOrEqual(
            content.right + 0.5,
          );
          expect(b.x, `${vp.width} ${view}: "${name}" starts inside the toolbar's content box`).toBeGreaterThanOrEqual(
            content.left - 0.5,
          );
        }
        expect(boxes.length, "the toolbar has controls to compare").toBeGreaterThan(4);
        // A radio sits INSIDE its radiogroup's own buttons; compare leaves only.
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!.b;
            const b = boxes[j]!.b;
            const nested =
              (a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height) ||
              (b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height);
            if (nested) continue;
            expect(
              disjoint(a, b),
              `${vp.width} ${view}: "${boxes[i]!.name}" and "${boxes[j]!.name}" do not overlap`,
            ).toBe(true);
          }
        }

        const o = await pageOverflow(page);
        expect(
          o.scrollWidth,
          `${vp.width} ${view}: page scrollWidth ${o.scrollWidth} vs ${o.clientWidth}; widest: ${o.widest}`,
        ).toBeLessThanOrEqual(o.clientWidth);
      }
    }
  });

  // ==================================================================
  // AGMOB-01'S LIST ARMS, WHERE THE LIST STILL SHOWS. Below 640 Semana is now
  // the grid, so these moved off 390 Semana rather than away: the list is what
  // Semana shows from 640 to 767 (Q-B6-2) and what Dia shows under 768 (Dia is
  // unchanged). The same four claims the base spec made at 390: nothing in the
  // list scrolls sideways, the names fit, a row opens ITS appointment, and the
  // rows are 44px targets.
  // ==================================================================
  test("the phone LIST, at 700 Semana and 390 Dia: on screen, nothing sideways, names fit, a row opens its own appointment, 44px rows", async ({
    page,
  }) => {
    for (const [vp, view, sections] of [
      [{ width: 700, height: 900 }, "week", 6],
      [PHONE, "day", 1],
    ] as const) {
      const where = `${vp.width} ${view}`;
      await page.setViewportSize(vp);
      await page.goto(`/agenda?view=${view}&date=${DAY}`);
      await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
      await hydrated(page);

      const list = page.getByTestId("agenda-week-list");
      await expect(list, `${where}: the list is the read surface`).toBeVisible();
      await expect(page.locator("[data-list-day]:visible"), `${where}: day sections`).toHaveCount(sections);
      const days = page.locator("[data-list-day]:visible");

      // ARM L1 - the list is on screen, NOTHING INSIDE IT overflows its own
      // box (what a bounding box alone would miss), and the page does not
      // scroll sideways either.
      const lb = await box(list, `${where}: the list`);
      const vw = await page.evaluate(() => document.documentElement.clientWidth);
      expect(lb.x, `${where}: the list starts on screen`).toBeGreaterThanOrEqual(0);
      expect(lb.x + lb.width, `${where}: the list ends on screen`).toBeLessThanOrEqual(vw + 1);
      const inside = await list.evaluate((el) => {
        const bad: string[] = [];
        for (const n of [el, ...Array.from(el.querySelectorAll("*"))]) {
          const e = n as HTMLElement;
          if (e.scrollWidth > e.clientWidth + 1) bad.push(`${e.tagName}.${String(e.className)}`.slice(0, 80));
        }
        return bad;
      });
      expect(inside, `${where}: nothing inside the list scrolls sideways`).toEqual([]);
      const o = await pageOverflow(page);
      expect(o.scrollWidth, `${where}: page scrollWidth ${o.scrollWidth} vs ${o.clientWidth}; widest: ${o.widest}`).toBeLessThanOrEqual(
        o.clientWidth,
      );

      // ARM L2 - THE NAME FITS, not merely the box.
      const names = days.locator("[data-testid='week-list-patient']");
      expect(await names.count(), `${where}: names to measure`).toBeGreaterThan(0);
      expect(
        await names.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)),
        `${where}: every list name fits its box`,
      ).toEqual([]);

      // ARM L3 - tap targets, MEASURED: every row at least 44px tall.
      const heights = await days
        .locator("[data-list-appointment-id]")
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height]));
      expect(heights.length, `${where}: rows to measure`).toBeGreaterThan(0);
      for (const [w, h] of heights) {
        expect(w, `${where}: a row has a width`).toBeGreaterThan(0);
        expect(h, `${where}: a row is a 44px target`).toBeGreaterThanOrEqual(44);
      }

      // ARM L4 - a row opens the RIGHT appointment, by id: the drawer prints
      // it, and a neighbouring row cannot produce it.
      const row = page.locator(`[data-list-day="${DAY}"] [data-list-appointment-id="${TWIN_PERSON_APPT}"]`);
      await expect(row, `${where}: the twin's person row is listed`).toBeVisible();
      await row.tap();
      const opened = page.getByRole("dialog");
      await expect(opened).toBeVisible({ timeout: 8_000 });
      await expect(opened.getByTestId("drawer-appointment-id")).toHaveText(TWIN_PERSON_APPT);
      await page.keyboard.press("Escape");
      await expect(opened).toBeHidden({ timeout: 8_000 });
    }
  });

  test("the Dia/Semana choice is remembered on this device, and a day-header tap does not change it", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);

    // Choose Dia with the toggle; a BARE /agenda then opens Dia.
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await hydrated(page);
    await page.getByRole("radiogroup", { name: "Agenda" }).getByRole("radio", { name: "Dia" }).tap();
    await expect(page).toHaveURL(/view=day/);
    await page.goto("/agenda");
    await hydrated(page);
    await expect(page).toHaveURL(/view=day/, { timeout: 15_000 });

    // Choose Semana; a bare /agenda stays on the week (the server's default),
    // and the phone shows the grid.
    await page.getByRole("radiogroup", { name: "Agenda" }).getByRole("radio", { name: "Semana" }).tap();
    await expect(page).toHaveURL(/view=week/);
    await page.goto("/agenda");
    await hydrated(page);
    // The positive arm above redirected within seconds of hydration; give the
    // effect the same chance here before asserting it did NOT fire.
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId("agenda-compact-week")).toBeVisible();
    await expect(page).not.toHaveURL(/view=day/);

    // A header tap drills into one day and does NOT store Dia: the next bare
    // /agenda is still the week.
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await hydrated(page);
    await page.locator(`[data-compact-header-day="${DAY}"]`).tap();
    await expect(page).toHaveURL(/view=day/);
    await page.goto("/agenda");
    await hydrated(page);
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId("agenda-compact-week")).toBeVisible();
    await expect(page).not.toHaveURL(/view=day/);

    // An explicit ?view= always wins over the stored choice. The stored choice
    // is Semana now, so a redirect that ignored ?view= would replace this URL
    // with view=week. That redirect is a client effect: the server-rendered
    // page already reads view=day and has no compact tree, so the URL and DOM
    // assertions mean nothing until the effect has had its chance to run. The
    // request log is the earlier witness: router.replace asks the server for
    // the view=week page the moment it runs, long before a slow server lets
    // the URL change.
    const toWeek: string[] = [];
    const onRequest = (r: { url(): string }) => {
      if (/[?&]view=week\b/.test(r.url())) toWeek.push(r.url());
    };
    page.on("request", onRequest);
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await hydrated(page);
    await page.waitForTimeout(2_000);
    page.off("request", onRequest);
    expect(toWeek, "no request for the stored view=week after an explicit view=day").toEqual([]);
    await expect(page).toHaveURL(/view=day/);
    await expect(page).not.toHaveURL(/view=week/);
    await expect(page.getByTestId("agenda-compact-week")).toHaveCount(0);
  });

  // ==================================================================
  // THE CONTROLS. They make the phone arms non-vacuous, and they are the
  // desktop-regression guards: the compact tree is in the DOM at 1440 and
  // must add NOTHING to what the desktop specs count.
  // ==================================================================
  test("the now line: with the clock inside the week, the phone scrolls to it once and the pinned header paints over it", async ({
    page,
  }) => {
    // The browser clock only (Date); the server keeps its own. Fixed on DAY at
    // 10:10 so this never depends on when the run happens.
    await page.clock.setFixedTime(FIXED_NOW);
    await page.setViewportSize(PHONE);
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await hydrated(page);
    const line = page.locator(`[data-compact-day="${DAY}"] [data-testid="agenda-compact-now"]`);
    await expect(line).toBeVisible();
    // The one-time scroll ran: the page is no longer at the top.
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeGreaterThan(0);

    // Put the line UNDER the pinned day header, then ask the browser what is
    // painted there. A header at the line's z-index or lower loses to the line,
    // which comes later in the DOM.
    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>("[data-testid='agenda-compact-week']")!;
      const header = document.querySelector<HTMLElement>("[data-testid='agenda-compact-header']")!;
      const now = document.querySelector<HTMLElement>("[data-testid='agenda-compact-now']")!;
      // Where the header pins: the same custom property the component reads.
      const pinnedTop = Number.parseFloat(getComputedStyle(root).getPropertyValue("--agenda-header-top")) || 0;
      const headerH = header.getBoundingClientRect().height;
      const lineAbs = now.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: lineAbs - pinnedTop - headerH / 2, behavior: "instant" });
    });
    const hit = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("[data-testid='agenda-compact-header']")!;
      const now = document.querySelector<HTMLElement>("[data-testid='agenda-compact-now']")!;
      // The line is `pointer-events: none`, and hit testing skips such an
      // element, so elementFromPoint could never return it and this check
      // would pass whatever paints on top (measured: it stayed green with the
      // header at the line's z-index). Make it hittable for the probe only.
      now.style.pointerEvents = "auto";
      const h = header.getBoundingClientRect();
      const n = now.getBoundingClientRect();
      const x = n.left + n.width / 2;
      const y = n.top + n.height / 2;
      const under = y >= h.top && y <= h.bottom;
      const el = document.elementFromPoint(x, y);
      return { under, inHeader: !!el?.closest("[data-testid='agenda-compact-header']"), isLine: el === now };
    });
    expect(hit.under, "the line is scrolled under the pinned header").toBe(true);
    expect(hit.isLine, "the now line is not painted over the header").toBe(false);
    expect(hit.inHeader, "the header is what is painted there").toBe(true);
  });

  test("CONTROL - at 1440 the desktop grid is the read surface, the twin pair STACKS, and the phone trees answer to nothing", async ({
    page,
  }) => {
    // A fixed browser clock inside this week's hours. FIRST, at 390, the
    // control: this clock DOES make the phone grid scroll the page. THEN, at
    // 1440, the phone grid is `display: none` and only its displayed-tree
    // guard keeps the page still.
    await page.clock.setFixedTime(FIXED_EVENING);
    await page.setViewportSize(PHONE);
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await hydrated(page);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeGreaterThan(0);

    await page.setViewportSize(DESKTOP);
    await page.goto(`/agenda?view=week&date=${DAY}`);
    await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();

    await expect(page.locator("[data-day]")).toHaveCount(6);
    await expect(page.locator("[data-day]").first()).toBeVisible();
    // Both phone trees are in the DOM and hidden.
    await expect(page.locator("[data-list-day]").first()).toBeHidden();
    await expect(page.getByTestId("agenda-compact-week")).toBeHidden();
    const compactRows = page.locator("[data-compact-appointment-id]");
    expect(await compactRows.count(), "the compact tree holds rows to double").toBeGreaterThan(0);

    // The grid's attribute is answered ONLY by the grid, page-wide.
    const gridRows = page.locator("[data-day] [data-appointment-id]");
    expect(await page.locator("[data-appointment-id]").count()).toBe(await gridRows.count());
    await expect(page.locator(`[data-appointment-id="${TWIN_PERSON_APPT}"]`)).toHaveCount(1);
    // Role locators: a hidden tree is out of the accessibility tree.
    const nameRe = new RegExp(TWIN_PATIENT.name);
    const inGrid = await page.locator("[data-day]").getByRole("button", { name: nameRe }).count();
    expect(inGrid, "the twins are named cards in the grid").toBe(2);
    expect(await page.getByRole("button", { name: nameRe }).count()).toBe(inGrid);
    // No auto-scroll moved the page. The phone grid holds today (the fixed
    // clock) inside its hours, so without the displayed-tree guard it WOULD
    // scroll here; the 390 step above is the proof that it can. The wait
    // gives the mount effect and the first tick time to run.
    await hydrated(page);
    await page.waitForTimeout(2_000);
    expect(await page.evaluate(() => window.scrollY), "the desktop page stays at the top").toBe(0);

    // W11-00 v3 STILL HOLDS AT 1440: the same twin pair is STACKED - equal x,
    // increasing y - never side by side. This is the amendment's boundary.
    const p = await box(page.locator(`[data-appointment-id="${TWIN_PERSON_APPT}"]`), "desktop person card");
    const m = await box(page.locator(`[data-appointment-id="${TWIN_MACHINE_APPT}"]`), "desktop machine card");
    expect(Math.abs(p.x - m.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.y - m.y)).toBeGreaterThan(1);
  });

  test("CONTROL - the thresholds are DECISIONS, pinned both ways: 639 grid, 640 and 767 list, 768 desktop grid", async ({
    page,
  }) => {
    for (const [width, compactCols, listDays, gridDays] of [
      [639, 7, 0, 0], // seven: this file books that week's Sunday
      [640, 0, 6, 0],
      [767, 0, 6, 0],
      [768, 0, 0, 6],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/agenda?view=week&date=${DAY}`);
      await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
      const visibleCompact = await page.locator("[data-compact-day]:visible").count();
      expect(visibleCompact, `at ${width}px the phone grid`).toBe(compactCols);
      await expect(page.locator("[data-list-day]:visible"), `at ${width}px the day list`).toHaveCount(listDays);
      await expect(page.locator("[data-day]:visible"), `at ${width}px the desktop grid`).toHaveCount(gridDays);
    }
    // Dia is unchanged on a phone: the list, and the compact grid is not mounted.
    await page.setViewportSize(PHONE);
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await expect(page.locator("[data-list-day]:visible")).toHaveCount(1);
    await expect(page.getByTestId("agenda-compact-week")).toHaveCount(0);
  });
});
