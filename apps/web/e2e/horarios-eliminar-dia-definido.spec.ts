/**
 * horarios-eliminar-dia-definido.spec.ts - SR-62 PU-3.
 *
 * GATE PU-3: deleting a Dia definido returns the row to Base where a Base
 * exists, to "Não trabalha" where it does not, and the portal's slot grid agrees
 * with the row on the very next load.
 *
 * ==========================================================================
 * WHAT A UNIT TEST CANNOT DO, AND THEREFORE WHAT THIS IS FOR
 * ==========================================================================
 * lib/scheduling/day-defined-removal.test.ts proves the carve inverse against
 * the real planners and resolves every day through `buildDay`. It cannot prove
 * that the button reaches the writer, that the writer's rows reach Postgres, or
 * that the PORTAL - which reads the same rows through its own raw SQL in
 * apps/api/lib/appointments/store.ts (`listOpenSlots`), not through `buildDay` -
 * gives the same answer. Two readers of one table agreeing is the whole gate.
 *
 * THE PORTAL IS ASKED THE WAY THE PORTAL ASKS. apps/portal/lib/api/client.ts
 * `getOpenSlots` calls GET /api/v1/booking/slots with the patient's own session
 * token as a Bearer (the portal forwards its `__Host-ojp_session` cookie). This
 * spec reads that cookie from the portal patient's storage state and makes the
 * same call, `practitionerId` included, so the answer is about this spec's
 * therapist and nobody else's hours.
 *
 * ==========================================================================
 * WHY ITS DAYS ARE NOT `RUN_DAY_BASE + n`
 * ==========================================================================
 * Both surfaces this gate is about are windows anchored on TODAY: the inspector
 * shows at most 30 days (page.tsx `spanDays`) and the slot API 14
 * (`OPEN_SLOTS_HORIZON_DAYS`). RUN_DAY_BASE is 60..359 days out, where neither
 * surface can see a thing, so a day derived from it would make both assertions
 * vacuous. The days are 8..13 days out instead.
 *
 * ISOLATION IS BY THERAPIST, NOT BY DAY. The day guard exists because two specs
 * booking ONE therapist on one day collide. This spec creates its OWN therapist,
 * gives it its own rows, books nothing, and removes all of it afterwards, so no
 * other spec can meet it on any day. The same reason inspector-inline-edit.spec
 * has a therapist of its own; that one is not borrowed here because it asserts
 * its first day reads "Não trabalha", and this spec writes a Base.
 *
 * FIXTURES built here: a login-less, bookable therapist at Linda-a-Velha, and ONE
 * Base row (10:00-12:00) on the weekday of the first test day. Nothing else.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOCATION, PORTAL_BASE_URL, PORTAL_STORAGE, SERVICE, TENANT_A, futureDate } from "./fixtures";
import { fillTime } from "./helpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
// The same resolution playwright.config.ts gives apps/api.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? "3002"}`;

const THERAPIST_ID = "00000000-0000-4000-8000-00000000e5c3";
const THERAPIST_NAME = "E2E Terapeuta Eliminar Dia";
const THERAPIST_EMAIL = "e2e-therapist-eliminar-dia@osteojp.test";
/** apps/portal/lib/auth/cookie-names.ts PORTAL_SESSION_COOKIE. */
const PORTAL_SESSION_COOKIE = "__Host-ojp_session";

/**
 * Two consecutive days, the first Monday-Thursday, 8..13 days out: inside the
 * inspector's month and the slot API's fortnight, and never a weekend, where a
 * clinic's own hours could empty the grid for a reason unrelated to this gate.
 */
function testDays(): { withBase: string; withoutBase: string } {
  for (let n = 8; n <= 12; n++) {
    const d = futureDate(n);
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd >= 1 && wd <= 4) return { withBase: d, withoutBase: futureDate(n + 1) };
  }
  // Five consecutive days always contain a Monday-Thursday.
  throw new Error("no Monday-Thursday in five consecutive days");
}
const { withBase: DAY_BASE, withoutBase: DAY_NO_BASE } = testDays();
const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

test.describe.configure({ mode: "serial" });

let db: SupabaseClient;
let skipReason: string | null = null;

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function cleanUp(): Promise<void> {
  await db.from("availability_templates").delete().eq("tenant_id", TENANT_A).eq("user_id", THERAPIST_ID);
  await db.from("staff_locations").delete().eq("tenant_id", TENANT_A).eq("user_id", THERAPIST_ID);
  const gone = await db.from("users").delete().eq("id", THERAPIST_ID);
  // Referenced by something (an audit row naming it, say): retire instead, so it
  // can neither be booked nor appear in a roster.
  if (gone.error) await db.from("users").update({ is_active: false, is_bookable: false }).eq("id", THERAPIST_ID);
}

test.beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    skipReason = "no service-role key in this environment, so this spec's therapist cannot be built";
    return;
  }
  db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const role = must(
    await db.from("roles").select("id").eq("tenant_id", TENANT_A).eq("slug", "therapist").single(),
    "therapist role",
  ) as { id: string };

  await cleanUp();
  must(
    await db.from("users").upsert({
      id: THERAPIST_ID,
      tenant_id: TENANT_A,
      role_id: role.id,
      email: THERAPIST_EMAIL,
      full_name: THERAPIST_NAME,
      is_bookable: true,
      is_active: true,
    }),
    "therapist row",
  );
  must(
    await db
      .from("staff_locations")
      .upsert(
        { tenant_id: TENANT_A, user_id: THERAPIST_ID, location_id: LOCATION.id },
        { onConflict: "tenant_id,user_id,location_id" },
      ),
    "therapist at Linda-a-Velha",
  );
  // THE BASE: an ordinary weekly row, no validity, on the first day's weekday
  // only. The second day's weekday deliberately has none.
  must(
    await db.from("availability_templates").insert({
      tenant_id: TENANT_A,
      user_id: THERAPIST_ID,
      location_id: LOCATION.id,
      weekday: weekdayOf(DAY_BASE),
      start_time: "10:00",
      end_time: "12:00",
      is_active: true,
    }),
    "Base row",
  );
});

test.afterAll(async () => {
  if (db) await cleanUp();
});

const rowsOn = (page: Page, date: string) => page.locator(`[data-testid="inspector-row-${date}"]`);

async function openInspector(page: Page): Promise<void> {
  // The period is the MONTH so every day this spec names is on screen.
  await page.goto(`/horarios?t=${THERAPIST_ID}&p=month`);
  await expect(page.getByTestId("inspector-showing")).toContainText(THERAPIST_NAME, { timeout: 15_000 });
}

/** A Dia definido at Linda-a-Velha, 15:00-17:00, through the inspector's own editor. */
async function defineDay(page: Page, date: string): Promise<void> {
  await page.getByTestId(`inspector-edit-${date}`).click();
  const editor = page.getByTestId("inspector-editor");
  await expect(editor).toBeVisible();
  await editor.getByTestId("inspector-edit-location").selectOption({ label: LOCATION.name });
  await fillTime(editor.locator("label").filter({ hasText: "Início" }), "15:00");
  await fillTime(editor.locator("label").filter({ hasText: "Fim" }), "17:00");
  await editor.getByTestId("inspector-edit-save").click();
  // One window, the dated one: the save carved the Base out of this date.
  await expect(rowsOn(page, date)).toHaveCount(1, { timeout: 15_000 });
  await expect(rowsOn(page, date).first()).toContainText("Dia definido");
  await expect(rowsOn(page, date).first()).toContainText("15:00");
}

/** Press Eliminar on the day's Dia definido row, accepting the confirm. */
async function eliminar(page: Page, date: string): Promise<void> {
  const button = rowsOn(page, date).locator('[data-testid^="inspector-daydefined-remove-"]');
  await expect(button).toHaveCount(1);
  page.once("dialog", (dialog) => {
    // The confirm is the pattern the Exceção row uses; say which one it is.
    expect(dialog.message()).toContain("Eliminar este dia definido");
    void dialog.accept();
  });
  await button.click();
}

const lisbonDate = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(new Date(iso));
const lisbonTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/**
 * The slot starts the PORTAL would offer on `date` for this spec's therapist, as
 * Lisbon "HH:mm". A fresh request each call - the route is force-dynamic and the
 * portal fetches no-store - which is what "the very next load" means.
 */
async function portalStartsOn(browser: Browser, date: string): Promise<string[]> {
  const ctx = await browser.newContext({ storageState: PORTAL_STORAGE.patient, baseURL: PORTAL_BASE_URL });
  try {
    const session = (await ctx.cookies()).find((c) => c.name === PORTAL_SESSION_COOKIE);
    // A MISSING SESSION FAILS, it never reads as "no slots". An empty list is
    // one of this spec's expected answers, so a broken fixture that produced one
    // would pass the second test for the wrong reason.
    if (!session) {
      throw new Error(
        `the portal patient storage state (${PORTAL_STORAGE.patient}) carries no ${PORTAL_SESSION_COOKIE} ` +
          "cookie, so the portal's own slot request cannot be reproduced",
      );
    }
    const params = new URLSearchParams({
      serviceId: SERVICE.id,
      locationId: LOCATION.id,
      practitionerId: THERAPIST_ID,
    });
    const res = await ctx.request.get(`${API_URL}/api/v1/booking/slots?${params}`, {
      headers: { Authorization: `Bearer ${session.value}` },
    });
    expect(res.status(), `GET /api/v1/booking/slots answered ${res.status()}`).toBe(200);
    const { slots } = (await res.json()) as { slots: string[] };
    return slots.filter((s) => lisbonDate(s) === date).map(lisbonTime);
  } finally {
    await ctx.close();
  }
}

test("PU-3: Eliminar on a Dia definido over a Base returns the day to Base, and the portal agrees", async ({
  page,
  browser,
}) => {
  test.skip(skipReason !== null, skipReason ?? "");
  await openInspector(page);

  // BEFORE: the seeded Base, stated so a failure below cannot be read as "the
  // Base was never there".
  await expect(rowsOn(page, DAY_BASE).first()).toContainText("Base");
  await expect(rowsOn(page, DAY_BASE).first()).toContainText("10:00");

  await defineDay(page, DAY_BASE);
  const definedSlots = await portalStartsOn(browser, DAY_BASE);
  expect(definedSlots, "the portal should offer the Dia definido hours").toContain("15:00");
  expect(definedSlots, "the portal still offers the carved Base hours").not.toContain("10:00");

  await eliminar(page, DAY_BASE);
  await expect(rowsOn(page, DAY_BASE).first()).toContainText("Base", { timeout: 15_000 });

  // A RELOAD, so the row is read from the database again, not from a refresh.
  await page.reload();
  await expect(rowsOn(page, DAY_BASE)).toHaveCount(1);
  const row = rowsOn(page, DAY_BASE).first();
  await expect(row).toContainText("Base");
  await expect(row).toContainText("10:00");
  await expect(row).toContainText("12:00");
  await expect(row).not.toContainText("Dia definido");
  await expect(row).not.toContainText("15:00");
  // The same weekday a week later was never carved and is still Base.
  await expect(rowsOn(page, plusDays(DAY_BASE, 7)).first()).toContainText("Base");

  // THE PORTAL, ON THE VERY NEXT LOAD, SAYS WHAT THE ROW SAYS.
  const afterSlots = await portalStartsOn(browser, DAY_BASE);
  expect(afterSlots, "the portal does not offer the restored Base hours").toContain("10:00");
  expect(afterSlots, "the portal still offers the removed Dia definido hours").not.toContain("15:00");
});

test("PU-3: Eliminar on a Dia definido with no Base leaves Não trabalha, and the portal offers nothing", async ({
  page,
  browser,
}) => {
  test.skip(skipReason !== null, skipReason ?? "");
  await openInspector(page);

  await expect(rowsOn(page, DAY_NO_BASE).first()).toContainText("Não trabalha");
  await defineDay(page, DAY_NO_BASE);
  expect(await portalStartsOn(browser, DAY_NO_BASE)).toContain("15:00");

  await eliminar(page, DAY_NO_BASE);
  await expect(rowsOn(page, DAY_NO_BASE).first()).toContainText("Não trabalha", { timeout: 15_000 });

  await page.reload();
  await expect(rowsOn(page, DAY_NO_BASE)).toHaveCount(1);
  await expect(rowsOn(page, DAY_NO_BASE).first()).toContainText("Não trabalha");
  await expect(rowsOn(page, DAY_NO_BASE).first()).not.toContainText("Dia definido");
  // And the neighbouring Base day from the first test is untouched by this one.
  await expect(rowsOn(page, DAY_BASE).first()).toContainText("Base");

  expect(await portalStartsOn(browser, DAY_NO_BASE)).toEqual([]);
});
