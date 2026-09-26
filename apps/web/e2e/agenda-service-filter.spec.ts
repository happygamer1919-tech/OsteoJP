/**
 * agenda-service-filter.spec.ts - AGENDA-FILTER-SERVICE: the agenda filtered by
 * service, with multi-select chips, combined with the therapist filter, and
 * remembered per device.
 *
 * THE OWNER'S CHECK, arm by arm:
 *   1. Filtering to NESA hides the osteopatia bookings, in Dia and in Semana,
 *      and the choice survives a reload (localStorage, this device).
 *   2. The service filter combined with the therapist filter: a booking shows
 *      only if it passes both. Time-off blocks stay on screen whatever the
 *      service filter says.
 *   3. On a phone (390x844, and 360 for the narrowest): Semana (the compact week
 *      grid) and Dia (the phone list) are both filtered, and the toolbar still
 *      fits - `document.documentElement.scrollWidth <= clientWidth` and the
 *      toolbar's own `scrollWidth <= clientWidth`, with the chips closed and open.
 *
 * THREE TREES, ONE PER SURFACE, AND EVERY LOCATOR NAMES ITS TREE. The desktop
 * grid, the phone list and the phone week grid are all in the DOM at every
 * width (the swap is CSS), and a CSS attribute locator matches a hidden node.
 * So each assertion uses the handle only its own tree emits:
 * `data-appointment-id` (grid), `data-list-appointment-id` (list) and
 * `data-compact-appointment-id` (phone week). The two copies of the Serviços
 * toggle have different test ids, and only one is displayed at any width.
 *
 * THE FIXTURE. Four bookings and one time-off block on this file's own day,
 * written with the service-role key under this file's own ids and removed
 * afterwards, as agenda-mobile-week.spec.ts does. The key is REQUIRED: a missing
 * key throws rather than skipping, because a skipped arm inside a green shard
 * would read as proof of something it never ran.
 *
 * Runs as admin (the default project storage state). Each test has a fresh
 * browser context, so each starts with nothing stored.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import { LOCATION, RUN_DAY_BASE, SERVICE, SERVICE_NESA, TENANT_A, futureWeekdayDate } from "./fixtures";

/** This file's day. One offset per spec file (e2e-spec-days-do-not-collide).
 *  Never a Sunday, so the week views draw it. */
const DAY = futureWeekdayDate(RUN_DAY_BASE + 152);

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const NARROW_PHONE = { width: 360, height: 780 };

const PATIENT = { id: "00000000-0000-4000-8000-0000000b10a1", name: "Filtro Servico Sintetico" };
/** E2E Therapist, Osteopatia. */
const OSTEO_APPT = "00000000-0000-4000-8000-0000000b10b1";
/** E2E Therapist, NESA. */
const NESA_APPT = "00000000-0000-4000-8000-0000000b10b2";
/** Another therapist, NESA: passes the service filter, not the therapist one. */
const OTHER_NESA_APPT = "00000000-0000-4000-8000-0000000b10b3";
/** E2E Therapist, NO service: hidden as soon as any chip is selected. */
const NONE_APPT = "00000000-0000-4000-8000-0000000b10b4";
/** E2E Therapist's time off on DAY, drawn when the agenda is scoped to them. */
const BLOCK_ID = "00000000-0000-4000-8000-0000000b10c1";

const ALL = [OSTEO_APPT, NESA_APPT, OTHER_NESA_APPT, NONE_APPT];

/** Service-role client against the local stack. Never production. */
function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and the Supabase URL) must be set: agenda-service-filter.spec.ts " +
        "writes its bookings with the service role. It refuses to skip, because a skipped arm " +
        "would read as a pass.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function removeFixture(db: SupabaseClient): Promise<void> {
  await db.from("appointments").delete().in("id", ALL);
  await db.from("appointments").delete().eq("tenant_id", TENANT_A).eq("patient_id", PATIENT.id);
  await db.from("time_off").delete().eq("id", BLOCK_ID);
  await db.from("patients").delete().eq("id", PATIENT.id);
}

/**
 * Wait until React has hydrated the toolbar. The stored selection is applied by
 * the client after hydration, and a press before hydration does nothing.
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

/** The desktop grid's row for a booking (only the grid emits this attribute). */
const gridRow = (page: Page, id: string): Locator => page.locator(`[data-appointment-id="${id}"]`);
/** The phone list's row (Dia under `md`, and Semana 640-767). */
const listRow = (page: Page, id: string): Locator => page.locator(`[data-list-appointment-id="${id}"]`);
/** The phone week grid's block (Semana under `sm`). */
const compactRow = (page: Page, id: string): Locator => page.locator(`[data-compact-appointment-id="${id}"]`);

/** Exactly these bookings of the fixture are on screen, and the others are gone. */
async function expectShown(row: (id: string) => Locator, shown: string[], where: string): Promise<void> {
  for (const id of ALL) {
    if (shown.includes(id)) {
      await expect(row(id), `${where}: ${id} is shown`).toHaveCount(1);
      await expect(row(id), `${where}: ${id} is visible`).toBeVisible();
    } else {
      await expect(row(id), `${where}: ${id} is filtered out`).toHaveCount(0);
    }
  }
}

/** Open the chips (if closed) and press one by its visible name. */
async function pressChip(page: Page, toggle: Locator, name: string): Promise<void> {
  const panel = page.getByTestId("agenda-service-filter-panel");
  if ((await panel.count()) === 0) await toggle.click();
  await expect(panel).toBeVisible();
  const chip = panel.getByRole("button", { name, exact: true });
  await chip.click();
}

/** The owner's fit check, measured by the browser. */
async function expectToolbarFits(page: Page, where: string): Promise<void> {
  const doc = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(doc.sw, `${where}: the page scrolls sideways (${doc.sw} > ${doc.cw})`).toBeLessThanOrEqual(doc.cw);
  const bar = await page.getByTestId("agenda-toolbar").evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  expect(bar.sw, `${where}: the toolbar overflows its own box (${bar.sw} > ${bar.cw})`).toBeLessThanOrEqual(bar.cw);
}

test.describe("the agenda filtered by service (AGENDA-FILTER-SERVICE)", () => {
  let db: SupabaseClient;
  let therapistId = "";

  test.beforeAll(async () => {
    db = serviceClient();
    await removeFixture(db);
    const therapist = must(
      await db.from("users").select("id").eq("tenant_id", TENANT_A).eq("email", "e2e-therapist@osteojp.test").single(),
      "seeded therapist",
    ) as { id: string };
    const other = must(
      await db.from("users").select("id").eq("tenant_id", TENANT_A).eq("email", "e2e-therapist2@osteojp.test").single(),
      "seeded second therapist",
    ) as { id: string };
    therapistId = therapist.id;
    must(
      await db.from("patients").insert({
        id: PATIENT.id,
        tenant_id: TENANT_A,
        full_name: PATIENT.name,
        created_by: therapist.id,
        primary_location_id: LOCATION.id,
      }),
      "patient",
    );
    const row = (id: string, practitionerId: string, at: string, serviceId: string | null) => {
      const startsAt = lisbonDateTimeToUtc(DAY, at);
      return {
        id,
        tenant_id: TENANT_A,
        patient_id: PATIENT.id,
        practitioner_id: practitionerId,
        location_id: LOCATION.id,
        service_id: serviceId,
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
        status: "scheduled",
        created_by: therapist.id,
      };
    };
    must(
      await db.from("appointments").insert([
        row(OSTEO_APPT, therapist.id, "09:00", SERVICE.id),
        row(NESA_APPT, therapist.id, "11:00", SERVICE_NESA.id),
        row(OTHER_NESA_APPT, other.id, "13:00", SERVICE_NESA.id),
        row(NONE_APPT, therapist.id, "15:00", null),
      ]),
      "the four bookings",
    );
    must(
      await db.from("time_off").insert({
        id: BLOCK_ID,
        tenant_id: TENANT_A,
        user_id: therapist.id,
        starts_at: lisbonDateTimeToUtc(DAY, "17:00").toISOString(),
        ends_at: lisbonDateTimeToUtc(DAY, "18:00").toISOString(),
        reason: "other",
        note: "Filtro de servico E2E",
      }),
      "the time-off block",
    );
  });

  test.afterAll(async () => {
    if (db) await removeFixture(db);
  });

  test("filtering to NESA hides the osteopatia bookings, in Dia and in Semana, and is remembered on this device", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await hydrated(page);
    const grid = (id: string) => gridRow(page, id);

    // CONTROL: before any chip, every booking of the fixture is on the grid.
    await expectShown(grid, ALL, "Dia, no filter");

    // The desktop copy of the toggle is the one displayed; the phone copy is not.
    const toggle = page.getByTestId("agenda-service-filter-toggle");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("agenda-service-filter-toggle-phone")).toBeHidden();
    await expect(toggle).toHaveAccessibleName(/Serviços/);
    await expect(toggle.getByTestId("agenda-service-filter-toggle-count")).toHaveCount(0);

    await pressChip(page, toggle, SERVICE_NESA.name);
    const panel = page.getByTestId("agenda-service-filter-panel");
    await expect(panel.getByRole("button", { name: SERVICE_NESA.name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("button", { name: "Todos os serviços", exact: true })).toHaveAttribute("aria-pressed", "false");

    // THE OWNER'S FIRST CHECK: the osteopatia booking is gone, NESA stays, and
    // the booking with no service goes too.
    await expectShown(grid, [NESA_APPT, OTHER_NESA_APPT], "Dia, NESA");
    await expect(toggle.getByTestId("agenda-service-filter-toggle-count")).toHaveText("1");
    await expect(toggle).toHaveAccessibleName(/Serviços.*1/);

    // Semana: the same selection, on the week grid.
    await page.getByRole("radio", { name: "Semana", exact: true }).click();
    await expect(page).toHaveURL(/[?&]view=week\b/);
    await expect(page.getByTestId("agenda-weekday-header")).toBeVisible();
    await expectShown(grid, [NESA_APPT, OTHER_NESA_APPT], "Semana, NESA");

    // A second chip widens the selection: Osteopatia comes back, no-service does not.
    await pressChip(page, toggle, SERVICE.name);
    await expectShown(grid, [OSTEO_APPT, NESA_APPT, OTHER_NESA_APPT], "Semana, NESA + Osteopatia");
    await expect(toggle.getByTestId("agenda-service-filter-toggle-count")).toHaveText("2");
    await pressChip(page, toggle, SERVICE.name);

    // REMEMBERED PER DEVICE: a reload reads it back from localStorage.
    await page.reload();
    await hydrated(page);
    await expectShown(grid, [NESA_APPT, OTHER_NESA_APPT], "Semana after reload");
    await expect(toggle.getByTestId("agenda-service-filter-toggle-count")).toHaveText("1");
    const stored = await page.evaluate(() => window.localStorage.getItem("osteojp.agenda.services"));
    expect(JSON.parse(stored ?? "null")).toEqual([SERVICE_NESA.id]);

    // EMPTY SELECTION = ALL: "Todos os serviços" clears it, and every booking returns.
    await pressChip(page, toggle, "Todos os serviços");
    await expectShown(grid, ALL, "Semana, cleared");
    await expect(toggle.getByTestId("agenda-service-filter-toggle-count")).toHaveCount(0);
  });

  test("the service filter combines with the therapist filter; time-off blocks stay", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(`/agenda?view=day&date=${DAY}&therapist=${therapistId}`);
    await hydrated(page);
    const grid = (id: string) => gridRow(page, id);
    const band = page.getByTestId("agenda-blocked-band");

    // CONTROL: the therapist filter alone drops the other therapist's booking,
    // and draws this therapist's time off.
    await expectShown(grid, [OSTEO_APPT, NESA_APPT, NONE_APPT], "therapist only");
    await expect(band.first()).toBeVisible();

    // BOTH: E2E Therapist AND NESA leaves exactly one booking.
    const toggle = page.getByTestId("agenda-service-filter-toggle");
    await pressChip(page, toggle, SERVICE_NESA.name);
    await expectShown(grid, [NESA_APPT], "therapist + NESA");
    // The block is not a booking and is never filtered.
    await expect(band.first()).toBeVisible();

    // And each filter is doing its own work: dropping the therapist filter
    // (through the toolbar, keeping the service selection) brings the other
    // therapist's NESA booking back, while osteopatia stays hidden.
    await page.getByRole("combobox", { name: "Terapeutas", exact: true }).selectOption({ label: "Todos os terapeutas" });
    await expect(page).not.toHaveURL(/[?&]therapist=/);
    await expectShown(grid, [NESA_APPT, OTHER_NESA_APPT], "service only, after clearing the therapist");
  });

  test.describe("on a phone", () => {
    // `.tap()` REQUIRES hasTouch; a touch-capable context still clicks.
    test.use({ hasTouch: true });

    test("Semana and Dia are filtered on a phone, and the toolbar still fits at 390 (and 360)", async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(`/agenda?view=week&date=${DAY}`);
      await hydrated(page);
      const compact = (id: string) => compactRow(page, id);

      // CONTROL: the phone week grid draws the fixture before any chip.
      await expectShown(compact, ALL, "phone Semana, no filter");

      // The phone copy is the one displayed, on the Dia/Semana row: the
      // toggle took no row of its own.
      const toggle = page.getByTestId("agenda-service-filter-toggle-phone");
      await expect(toggle).toBeVisible();
      await expect(page.getByTestId("agenda-service-filter-toggle")).toBeHidden();
      const t = await toggle.boundingBox();
      const semana = await page.getByRole("radio", { name: "Semana", exact: true }).boundingBox();
      expect(t && semana, "both controls have boxes").toBeTruthy();
      expect(
        Math.abs(t!.y + t!.height / 2 - (semana!.y + semana!.height / 2)),
        "the Serviços toggle shares the Dia/Semana row",
      ).toBeLessThan(12);
      await expectToolbarFits(page, "390 Semana, chips closed");

      await toggle.tap();
      await expect(page.getByTestId("agenda-service-filter-panel")).toBeVisible();
      await page
        .getByTestId("agenda-service-filter-panel")
        .getByRole("button", { name: SERVICE_NESA.name, exact: true })
        .tap();
      await expectToolbarFits(page, "390 Semana, chips open, NESA selected");
      await expectShown(compact, [NESA_APPT, OTHER_NESA_APPT], "phone Semana, NESA");
      await expect(toggle.getByTestId("agenda-service-filter-toggle-phone-count")).toHaveText("1");

      // Close the chips; the toolbar still fits with the badge showing.
      await toggle.tap();
      await expect(page.getByTestId("agenda-service-filter-panel")).toHaveCount(0);
      await expectToolbarFits(page, "390 Semana, chips closed, badge");

      // Dia on a phone is the list: the same selection applies there.
      await page.getByRole("radio", { name: "Dia", exact: true }).tap();
      await expect(page).toHaveURL(/[?&]view=day\b/);
      await hydrated(page);
      await expectShown((id) => listRow(page, id), [NESA_APPT, OTHER_NESA_APPT], "phone Dia, NESA");
      await expectToolbarFits(page, "390 Dia, badge");

      // 360, the narrowest phone the toolbar is measured at: closed and open.
      await page.setViewportSize(NARROW_PHONE);
      await expectToolbarFits(page, "360 Dia, chips closed");
      await toggle.tap();
      await expect(page.getByTestId("agenda-service-filter-panel")).toBeVisible();
      await expectToolbarFits(page, "360 Dia, chips open");
    });
  });
});
