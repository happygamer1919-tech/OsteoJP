/**
 * dashboard-revenue-per-clinic.spec.ts - T5b, REVENUE PER CLINIC.
 *
 * The owner: "Revenue per clinic via viewer_location_ids, owner sees all with
 * a toggle". The Inicio revenue tile (Receita (mes)) used to sum every clinic
 * of the tenant for whoever could see it. Now:
 *   - the OWNER sees every clinic by default, and a toggle on the tile
 *     ("Localizacao da receita") shows one clinic or all again;
 *   - an ADMIN or a RECEPTIONIST sees the clinics they are assigned to and no
 *     other, with no toggle, whatever the URL says.
 * The scope is decided on the server inside getMonthlyRevenue; the unit and DB
 * suites (lib/invoices/queries.test.ts, revenue.db.test.ts) prove it per role.
 * This spec proves it on the screen.
 *
 * THE FIXTURE, written here and removed again, every figure a literal:
 *   Linda-a-Velha   123,45 EUR issued + 10,00 EUR paid       = 133,45 EUR
 *   Consultorio B    67,89 EUR paid                           =  67,89 EUR
 *   no marcacao       5,00 EUR paid  (no clinic: only in "all")
 *   Linda-a-Velha   999,99 EUR DRAFT (never counted)
 *   Every clinic                                              = 206,34 EUR
 * An invoice's clinic is the clinic of its marcacao, so each clinic invoice
 * hangs off a marcacao of its own, parked in 2018 where no agenda or dashboard
 * spec looks. The invoices are dated the 1st of the CURRENT Lisbon month at
 * 12:00 UTC, inside the month the tile sums on any day of it.
 *
 * WHY THE FIXTURE IS REMOVED. invoicing.spec.ts asserts /invoicing is EMPTY
 * for this month ("no invoices seeded"). The suite runs on one worker, so the
 * rows live only while this file runs; beforeAll also clears any a killed run
 * left behind, by their fixed ids.
 *
 * THE PREMISE IS ASSERTED, NOT ASSUMED. The literal figures hold only if this
 * tenant has no OTHER issued or paid invoice this month. beforeAll counts them
 * and stops with that sentence if there are any, rather than reporting a wrong
 * figure as a scoping defect.
 *
 * WHO: the owner is "E2E Owner" (no staff_locations: the owner is never
 * location-scoped). The admin is "E2E Admin Receita LV", a DEDICATED account
 * the seed assigns to Linda-a-Velha only (ensureRevenueAdminScope), because
 * the shared "E2E Admin" is deliberately unassigned. Both log in fresh with
 * E2E_PASSWORD.
 */
import { test, expect, type Page } from "@playwright/test";

import { E2E_PASSWORD, LOCATION, LOCATION_B, PATIENTS, TENANT_A, USERS } from "./fixtures";
import { serviceClient, therapistUserId } from "./helpers/confirm-code";

const REVENUE_LABEL = "Receita (mês)";
const TOGGLE_NAME = "Localização da receita";
const ALL_LABEL = "Todas as clínicas";

/** Fixed ids, so a killed run's rows are found and removed by the next one. */
const APPT_LV = "00000000-0000-0000-0000-0000000f5b01";
const APPT_B = "00000000-0000-0000-0000-0000000f5b02";
const INV_LV_ISSUED = "00000000-0000-0000-0000-0000000f5b11";
const INV_LV_PAID = "00000000-0000-0000-0000-0000000f5b12";
const INV_B_PAID = "00000000-0000-0000-0000-0000000f5b13";
const INV_NO_APPT = "00000000-0000-0000-0000-0000000f5b14";
const INV_LV_DRAFT = "00000000-0000-0000-0000-0000000f5b15";
const INVOICE_IDS = [INV_LV_ISSUED, INV_LV_PAID, INV_B_PAID, INV_NO_APPT, INV_LV_DRAFT];
const APPT_IDS = [APPT_LV, APPT_B];

/** The figures, as pt-PT prints them. `\s` also matches the no-break space Intl puts before the sign. */
const FIGURE = {
  all: /(^|[^\d])206,34\s€/,
  lv: /(^|[^\d])133,45\s€/,
  b: /(^|[^\d])67,89\s€/,
};

/** YYYY-MM of the current month in Lisbon, the month the tile sums. */
function lisbonYearMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

async function removeFixture(db: ReturnType<typeof serviceClient>): Promise<void> {
  const inv = await db.from("invoices").delete().in("id", INVOICE_IDS);
  if (inv.error) throw new Error(`removing the T5b invoices failed: ${inv.error.message}`);
  const appt = await db.from("appointments").delete().in("id", APPT_IDS);
  if (appt.error) throw new Error(`removing the T5b marcacoes failed: ${appt.error.message}`);
}

test.beforeAll(async () => {
  const db = serviceClient();
  await removeFixture(db);

  const ym = lisbonYearMonth();
  const [y, m] = ym.split("-").map(Number) as [number, number];
  // A window one day wider than the Lisbon month on each side: a stricter premise, never a looser one.
  const windowStart = new Date(Date.UTC(y, m - 1, 1) - 86_400_000).toISOString();
  const windowEnd = new Date(Date.UTC(y, m, 1) + 86_400_000).toISOString();
  const others = await db
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT_A)
    .in("status", ["issued", "paid"])
    .gte("issued_at", windowStart)
    .lt("issued_at", windowEnd);
  if (others.error) throw new Error(`premise read failed: ${others.error.message}`);
  if ((others.count ?? 0) !== 0) {
    throw new Error(
      `PREMISE: tenant A already holds ${others.count} issued or paid invoice(s) this month that this ` +
        "spec did not write, so its literal figures cannot hold. Find what wrote them (invoicing.spec.ts " +
        "assumes none either) before reading any figure below as a scoping result.",
    );
  }

  const therapist = await therapistUserId(db);
  const appts = await db.from("appointments").insert(
    [
      { id: APPT_LV, location_id: LOCATION.id, starts_at: "2018-06-04T09:00:00.000Z", ends_at: "2018-06-04T09:45:00.000Z" },
      { id: APPT_B, location_id: LOCATION_B.id, starts_at: "2018-06-04T10:00:00.000Z", ends_at: "2018-06-04T10:45:00.000Z" },
    ].map((a) => ({
      ...a,
      tenant_id: TENANT_A,
      patient_id: PATIENTS.joao.id,
      practitioner_id: therapist,
      status: "completed",
    })),
  );
  if (appts.error) throw new Error(`writing the T5b marcacoes failed: ${appts.error.message}`);

  const issuedAt = `${ym}-01T12:00:00.000Z`;
  const invoice = (id: string, appointmentId: string | null, amountCents: number, status: string) => ({
    id,
    tenant_id: TENANT_A,
    patient_id: PATIENTS.joao.id,
    appointment_id: appointmentId,
    amount_cents: amountCents,
    status,
    issued_at: issuedAt,
  });
  const invs = await db.from("invoices").insert([
    invoice(INV_LV_ISSUED, APPT_LV, 12_345, "issued"),
    invoice(INV_LV_PAID, APPT_LV, 1_000, "paid"),
    invoice(INV_B_PAID, APPT_B, 6_789, "paid"),
    invoice(INV_NO_APPT, null, 500, "paid"),
    invoice(INV_LV_DRAFT, APPT_LV, 99_999, "draft"),
  ]);
  if (invs.error) throw new Error(`writing the T5b invoices failed: ${invs.error.message}`);
});

test.afterAll(async () => {
  await removeFixture(serviceClient());
});

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Iniciar sessão/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

function revenueTile(page: Page) {
  return page.getByTestId("dashboard-kpis").locator(":scope > *").filter({ hasText: REVENUE_LABEL });
}

/**
 * The toggle sits INSIDE the fixed-height (180px) tile and nothing spills: the
 * select is the tile's own descendant, its box is within the tile's, the tile's
 * content does not overflow it, and the page does not scroll sideways. Read in
 * ONE evaluate, after scrolling the tile into view, so both boxes come from
 * the same layout (at 390 the tile is below the fold).
 */
async function expectToggleFits(page: Page, where: string): Promise<void> {
  const tile = revenueTile(page);
  await tile.scrollIntoViewIfNeeded();
  await expect(tile.getByRole("combobox", { name: TOGGLE_NAME }), `${where}: the toggle is inside the tile`).toBeVisible();
  const m = await tile.evaluate((el) => {
    const t = el.getBoundingClientRect();
    const c = el.querySelector("select")!.getBoundingClientRect();
    const doc = document.documentElement;
    return {
      tile: { left: t.left, top: t.top, right: t.right, bottom: t.bottom, height: t.height },
      toggle: { left: c.left, top: c.top, right: c.right, bottom: c.bottom },
      contentHeight: el.scrollHeight,
      boxHeight: el.clientHeight,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(m.tile.height, `${where}: the tile keeps its 180px`).toBeCloseTo(180, 0);
  expect(m.toggle.left, `${where}: toggle left inside the tile`).toBeGreaterThanOrEqual(m.tile.left - 0.5);
  expect(m.toggle.top, `${where}: toggle top inside the tile`).toBeGreaterThanOrEqual(m.tile.top - 0.5);
  expect(m.toggle.right, `${where}: toggle right inside the tile`).toBeLessThanOrEqual(m.tile.right + 0.5);
  expect(m.toggle.bottom, `${where}: toggle bottom inside the tile`).toBeLessThanOrEqual(m.tile.bottom + 0.5);
  expect(m.contentHeight, `${where}: tile content height vs its box`).toBeLessThanOrEqual(m.boxHeight);
  expect(m.scrollWidth, `${where}: page scrollWidth vs clientWidth`).toBeLessThanOrEqual(m.clientWidth);
  await expectChoicesReadInFull(page, where);
}

/**
 * A SELECT THAT FITS ITS TILE CAN STILL CUT ITS OWN TEXT. The closed control
 * shows the chosen entry inside its text box: the select's clientWidth less its
 * left and right padding (the right padding is the chevron's room). At 1280 the
 * tile is at its narrowest (xl, four columns beside the 304px sidebar), and the
 * first label, then "Todas as localizações" (145px), was cut to "Todas as
 * localizaç" there (text box 124px) while every box check above passed. It is
 * now "Todas as clínicas" (113px).
 *
 * So the entries are measured in the select's own computed font, after the
 * web font has loaded, and must fit that text box: the default entry, which
 * is what the owner sees on arrival, and "Linda-a-Velha".
 * NOT "Consultório B (E2E)": that fixture name carries a test suffix and is
 * 129px, wider than "Castelo Branco" (101px), so at 1280 it is cut by about
 * 5px, which is the fixture's suffix and not the control. Nor another spec's
 * clinic, left behind by a killed run on a shared lane database.
 */
async function expectChoicesReadInFull(page: Page, where: string): Promise<void> {
  const labels = [ALL_LABEL, LOCATION.name];
  const m = await revenueTile(page)
    .locator("select")
    .evaluate(async (sel, wanted) => {
      await document.fonts.ready;
      const select = sel as HTMLSelectElement;
      const cs = getComputedStyle(select);
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "pre";
      for (const p of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "letterSpacing"] as const) {
        probe.style[p] = cs[p];
      }
      document.body.appendChild(probe);
      const offered = Array.from(select.options, (o) => o.text);
      const widths = wanted.map((text) => {
        probe.textContent = text;
        return { text, offered: offered.includes(text), width: probe.getBoundingClientRect().width };
      });
      probe.remove();
      return {
        textBox: select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        widths,
      };
    }, labels);
  for (const w of m.widths) {
    expect(w.offered, `${where}: "${w.text}" is one of the toggle's entries`).toBe(true);
    expect(
      w.width,
      `${where}: "${w.text}" is ${w.width.toFixed(1)}px, the select's text box ${m.textBox.toFixed(1)}px`,
    ).toBeLessThanOrEqual(m.textBox);
  }
}

test.describe("owner: every clinic by default, one clinic with the toggle (T5b)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the figure follows the toggle: all, Linda-a-Velha, Consultorio B, all again", async ({ page }) => {
    await loginAs(page, USERS.owner);
    await page.goto("/dashboard");
    const tile = revenueTile(page);
    const toggle = page.getByRole("combobox", { name: TOGGLE_NAME });

    // Default: every clinic, and the invoice with no marcacao is in it.
    await expect(tile).toHaveCount(1);
    await expect(tile).toContainText(FIGURE.all);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveValue("");
    await expect(toggle.locator("option:checked")).toHaveText(ALL_LABEL);

    await toggle.selectOption({ label: LOCATION.name });
    await expect(page).toHaveURL(new RegExp(`[?&]location=${LOCATION.id}(&|$)`));
    await expect(tile).toContainText(FIGURE.lv);
    await expect(tile).not.toContainText(FIGURE.all);
    await expect(toggle).toHaveValue(LOCATION.id);

    await toggle.selectOption({ label: LOCATION_B.name });
    await expect(page).toHaveURL(new RegExp(`[?&]location=${LOCATION_B.id}(&|$)`));
    await expect(tile).toContainText(FIGURE.b);
    await expect(tile).not.toContainText(FIGURE.lv);
    await expect(toggle).toHaveValue(LOCATION_B.id);

    await toggle.selectOption({ label: ALL_LABEL });
    await expect(page).not.toHaveURL(/[?&]location=/);
    await expect(tile).toContainText(FIGURE.all);
    await expect(toggle).toHaveValue("");
  });

  test("the choice lives in the URL: a reload of ?location= shows that clinic, and the day links keep it", async ({
    page,
  }) => {
    await loginAs(page, USERS.owner);
    await page.goto(`/dashboard?location=${LOCATION_B.id}`);
    await expect(revenueTile(page)).toContainText(FIGURE.b);
    await expect(page.getByRole("combobox", { name: TOGGLE_NAME })).toHaveValue(LOCATION_B.id);

    await page.getByRole("link", { name: "Dia seguinte" }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]location=${LOCATION_B.id}(&|$)`));
    await expect(revenueTile(page)).toContainText(FIGURE.b);
  });

  // The two client-side paths the links above do not take: the toggle's own
  // navigation from a page that HAS a ?date=, and the typed date field (the
  // DateJump), which navigates in the browser rather than following a link.
  // The dates are navigation only: the tile sums the current month whatever
  // day the page shows, so the figure is the clinic's throughout.
  test("choosing a clinic keeps an explicit ?date=, and typing a day keeps the clinic", async ({ page }) => {
    await loginAs(page, USERS.owner);
    await page.goto("/dashboard?date=2026-03-17");
    const toggle = page.getByRole("combobox", { name: TOGGLE_NAME });
    await expect(toggle).toHaveValue("");

    await toggle.selectOption({ label: LOCATION.name });
    await expect(page).toHaveURL(new RegExp(`[?&]location=${LOCATION.id}(&|$)`));
    await expect(page, "choosing a clinic kept the day").toHaveURL(/[?&]date=2026-03-17(&|$)/);
    await expect(revenueTile(page)).toContainText(FIGURE.lv);

    await page
      .getByTestId("dashboard-date-nav")
      .getByRole("textbox", { name: "Escolher data", exact: true })
      .fill("19/03/2026");
    await expect(page).toHaveURL(/[?&]date=2026-03-19(&|$)/);
    await expect(page, "typing a day kept the clinic").toHaveURL(new RegExp(`[?&]location=${LOCATION.id}(&|$)`));
    await expect(revenueTile(page)).toContainText(FIGURE.lv);
    await expect(toggle).toHaveValue(LOCATION.id);
  });

  // ONE SIGN-IN FOR EVERY WIDTH. The staff sign-in allows six attempts per
  // credential a minute (RULES.staffLoginCredential, packages/rate-limit) and
  // refuses the seventh with the wrong-password sentence. With one test and one
  // sign-in per width this file signed the owner in seven times in under a
  // minute once 1280 was added, and the seventh, at 1440, was refused. So the
  // widths share one session and each is loaded fresh at its own size.
  test("the toggle fits inside the tile, reads in full, and nothing scrolls sideways, at 390, 1024, 1280 and 1440", async ({
    page,
  }) => {
    await loginAs(page, USERS.owner);
    for (const vp of [
      { name: "390", size: { width: 390, height: 844 } },
      { name: "1024", size: { width: 1024, height: 768 } },
      // The narrowest tile: xl's four columns begin here, beside the 304px sidebar.
      { name: "1280", size: { width: 1280, height: 800 } },
      { name: "1440", size: { width: 1440, height: 900 } },
    ]) {
      await test.step(`at ${vp.name}`, async () => {
        await page.setViewportSize(vp.size);
        await page.goto("/dashboard");
        await expect(revenueTile(page)).toContainText(FIGURE.all);
        await expectToggleFits(page, `owner ${vp.name}`);
      });
    }
  });
});

test.describe("admin assigned to Linda-a-Velha: that clinic's figure only, no toggle (T5b)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees 133,45 EUR (Linda-a-Velha), never the other clinic, the unlinked invoice or the total", async ({
    page,
  }) => {
    await loginAs(page, USERS.adminRevenueLv);
    await page.goto("/dashboard");
    const tile = revenueTile(page);
    await expect(tile).toHaveCount(1);
    await expect(tile).toContainText(FIGURE.lv);
    await expect(tile).not.toContainText(FIGURE.all);
    await expect(page.getByRole("combobox", { name: TOGGLE_NAME })).toHaveCount(0);
    await expect(page.getByTestId("dashboard-revenue-location")).toHaveCount(0);
  });

  test("a hand-typed ?location= for the other clinic changes nothing", async ({ page }) => {
    await loginAs(page, USERS.adminRevenueLv);
    await page.goto(`/dashboard?location=${LOCATION_B.id}`);
    const tile = revenueTile(page);
    await expect(tile).toContainText(FIGURE.lv);
    await expect(tile).not.toContainText(FIGURE.b);
    await expect(page.getByRole("combobox", { name: TOGGLE_NAME })).toHaveCount(0);
  });
});
