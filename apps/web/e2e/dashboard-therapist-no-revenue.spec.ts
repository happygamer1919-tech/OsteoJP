/**
 * dashboard-therapist-no-revenue.spec.ts - DASH-THERAPIST-REVENUE.
 *
 * FOUND BY THE GUIDE WRITERS: a therapist's Inicio (/dashboard) showed the
 * whole clinic's Receita (mes). getMonthlyRevenue had no gate and the invoices
 * RLS is tenant-wide, so the database answered a therapist with every clinic's
 * total. The owner: "fix right away".
 *
 * THE GATE IS `invoices:issue`, NOT `invoices:read`. Every role holds
 * invoices:read (the therapist keeps it for a patient's Faturacao tab), so a
 * gate on it passes the therapist. invoices:issue is what the owner's
 * 2026-07-21 ruling already uses to keep the therapist out of Faturacao.
 *
 * THE OWNER'S CHECK, arm by arm, each at 390x844, at 1024x768 (md and lg,
 * where a third tile would sit alone on a half line) and at 1440x900 (xl):
 *   1. Therapist: no Receita tile, no euro sign on the page, and the
 *      tiles and chart they keep (Pacientes ativos, Marcacoes hoje, Novas
 *      fichas, Resumo semanal) are on screen.
 *   2. Admin: the Receita tile is on screen and carries a euro amount.
 *   3. Therapist and admin: the KPI row has no empty gap. Every line of tiles
 *      runs from the row's left edge to its right edge (a three-tile row in a
 *      four-column grid, or a lone tile on a half line, fails), and the page
 *      does not scroll sideways (`scrollWidth <= clientWidth`).
 *   4. Reception: exactly the row it had before this card. The Receita tile
 *      with its euro amount, three tiles in the same four-column grid at xl
 *      and two columns at md and lg, and no tile spanning a column. That row
 *      still ends in an empty quarter at xl and a lone tile on a half line at
 *      md and lg, as it always did: the acceptance keeps reception's page as it
 *      was, and changing its layout is not this card's call. So arm 3's
 *      no-gap check is deliberately NOT applied to reception.
 *
 * DATA-AGNOSTIC. No invoice is written: an issued invoice cannot be removed
 * afterwards, and none is needed. With no invoices this month the admin tile
 * reads a zero euro amount, still an amount; and before
 * the fix the therapist got that same tile and sign, so arm 1 fails on the old
 * code whatever the ledger holds.
 *
 * Therapist runs on STORAGE.therapist, reception on STORAGE.reception, admin
 * on the project default.
 */
import { test, expect, type Page } from "@playwright/test";
import { STORAGE } from "./fixtures";

/**
 * Each width with, per role, the columns the KPI row has there and how many
 * tiles each line of it holds. 1024 is md and lg (two columns), 1440 is xl.
 * The therapist's third tile spans both columns at md and lg (so it is not
 * alone on a half line) and one column again at xl.
 */
const VIEWPORTS = [
  {
    name: "390",
    size: { width: 390, height: 844 },
    therapist: { columns: 1, lines: [1, 1, 1], spans: ["auto", "auto", "auto"] },
    admin: { columns: 1, lines: [1, 1, 1, 1] },
    reception: { columns: 1, lines: [1, 1, 1] },
  },
  {
    name: "1024",
    size: { width: 1024, height: 768 },
    therapist: { columns: 2, lines: [2, 1], spans: ["auto", "auto", "span 2"] },
    admin: { columns: 2, lines: [2, 2] },
    reception: { columns: 2, lines: [2, 1] },
  },
  {
    name: "desktop",
    size: { width: 1440, height: 900 },
    therapist: { columns: 3, lines: [3], spans: ["auto", "auto", "span 1"] },
    admin: { columns: 4, lines: [4] },
    reception: { columns: 4, lines: [3] },
  },
] as const;

const REVENUE_LABEL = "Receita (mês)";
/** A pt-PT euro amount as Intl formats it: "0,00 €", "1245,00 €", "12 345,00 €". */
const EURO_AMOUNT = /\d,\d{2}\s€/;

type RowLayout = {
  tiles: number;
  /** Column tracks the browser gave the row's grid. */
  columns: number;
  /** Each tile's computed grid-column-start: "auto", or "span 2" for a spanning tile. */
  spans: string[];
  lines: Array<{ left: number; right: number; count: number }>;
  row: { left: number; right: number };
  scrollWidth: number;
  clientWidth: number;
};

/** The KPI row's lines of tiles, as the browser laid them out. */
async function kpiLayout(page: Page): Promise<RowLayout> {
  return page.getByTestId("dashboard-kpis").evaluate((row) => {
    const r = row.getBoundingClientRect();
    const byTop = new Map<number, { left: number; right: number; count: number }>();
    for (const child of Array.from(row.children)) {
      const b = child.getBoundingClientRect();
      const top = Math.round(b.top);
      const line = byTop.get(top);
      if (line) {
        line.left = Math.min(line.left, b.left);
        line.right = Math.max(line.right, b.right);
        line.count += 1;
      } else {
        byTop.set(top, { left: b.left, right: b.right, count: 1 });
      }
    }
    const doc = document.documentElement;
    return {
      tiles: row.children.length,
      columns: getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length,
      spans: Array.from(row.children).map((c) => getComputedStyle(c).gridColumnStart),
      lines: [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
      row: { left: r.left, right: r.right },
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
}

/** Arm 3: every line of tiles spans the row, and nothing scrolls sideways. */
function expectNoGap(layout: RowLayout, where: string): void {
  expect(layout.tiles, `${where}: tiles in the KPI row`).toBeGreaterThan(0);
  for (const [i, line] of layout.lines.entries()) {
    expect(Math.abs(line.left - layout.row.left), `${where}: line ${i + 1} starts at the row's left edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.row.right - line.right), `${where}: line ${i + 1} ends at the row's right edge`).toBeLessThanOrEqual(1);
  }
  expect(layout.scrollWidth, `${where}: page scrollWidth vs clientWidth`).toBeLessThanOrEqual(layout.clientWidth);
}

test.describe("therapist Inicio has no clinic revenue (DASH-THERAPIST-REVENUE)", () => {
  test.use({ storageState: STORAGE.therapist });

  for (const vp of VIEWPORTS) {
    test(`at ${vp.name}: no Receita tile, no euro amount, the rest of the page intact, no gap`, async ({ page }) => {
      await page.setViewportSize(vp.size);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
      const kpis = page.getByTestId("dashboard-kpis");
      await expect(kpis).toBeVisible();

      // Arm 1: the tile and every sign of a figure are gone. `main` is the
      // page's own landmark (the shell renders none), read by textContent so a
      // hidden node counts too; the whole body is read as rendered text, which
      // leaves out the inline RSC scripts Next puts there.
      await expect(page.getByText(REVENUE_LABEL)).toHaveCount(0);
      await expect(page.getByText(/Receita/)).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("€");
      await expect(page.locator("main")).not.toContainText(EURO_AMOUNT);
      await expect(page.locator("body")).not.toContainText("€", { useInnerText: true });

      // What the therapist keeps.
      await expect(kpis.getByText("Pacientes ativos")).toBeVisible();
      await expect(kpis.getByText("Marcações hoje")).toBeVisible();
      await expect(kpis.getByText("Novas fichas")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Resumo semanal" })).toBeVisible();
      await expect(page.getByRole("img", { name: "Resumo semanal de marcações" })).toBeVisible();

      // Arm 3.
      const layout = await kpiLayout(page);
      expect(layout.tiles).toBe(3);
      expect(layout.columns, "therapist grid columns").toBe(vp.therapist.columns);
      expect(layout.lines.map((l) => l.count)).toEqual(vp.therapist.lines);
      expect(layout.spans, "therapist tile spans").toEqual(vp.therapist.spans);
      expectNoGap(layout, `therapist ${vp.name}`);
    });
  }
});

test.describe("admin Inicio keeps the revenue tile (DASH-THERAPIST-REVENUE)", () => {
  for (const vp of VIEWPORTS) {
    test(`at ${vp.name}: the Receita tile carries a euro amount, no gap`, async ({ page }) => {
      await page.setViewportSize(vp.size);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
      const kpis = page.getByTestId("dashboard-kpis");
      await expect(kpis).toBeVisible();

      // Arm 2.
      const tile = kpis.locator(":scope > *").filter({ hasText: REVENUE_LABEL });
      await expect(tile).toHaveCount(1);
      await expect(tile).toBeVisible();
      await expect(tile).toContainText(EURO_AMOUNT);

      // Arm 3.
      const layout = await kpiLayout(page);
      expect(layout.tiles).toBe(4);
      expect(layout.columns, "admin grid columns").toBe(vp.admin.columns);
      expect(layout.lines.map((l) => l.count)).toEqual(vp.admin.lines);
      expect(layout.spans, "no admin tile spans a column").toEqual(["auto", "auto", "auto", "auto"]);
      expectNoGap(layout, `admin ${vp.name}`);
    });
  }
});

test.describe("reception Inicio is the row it was (DASH-THERAPIST-REVENUE)", () => {
  test.use({ storageState: STORAGE.reception });

  for (const vp of VIEWPORTS) {
    test(`at ${vp.name}: the Receita tile carries a euro amount, the grid and tiles as before`, async ({ page }) => {
      await page.setViewportSize(vp.size);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
      const kpis = page.getByTestId("dashboard-kpis");
      await expect(kpis).toBeVisible();

      // Arm 4: the figure reception has always had.
      const tile = kpis.locator(":scope > *").filter({ hasText: REVENUE_LABEL });
      await expect(tile).toHaveCount(1);
      await expect(tile).toBeVisible();
      await expect(tile).toContainText(EURO_AMOUNT);
      await expect(kpis.getByText("Novas fichas")).toHaveCount(0);

      // Arm 4: the grid it had, four columns at xl and two at md and lg, and no
      // tile spanning a column. Its gaps are today's and are not checked away.
      const layout = await kpiLayout(page);
      expect(layout.tiles).toBe(3);
      expect(layout.columns, "reception grid columns").toBe(vp.reception.columns);
      expect(layout.lines.map((l) => l.count)).toEqual(vp.reception.lines);
      expect(layout.spans, "no reception tile spans a column").toEqual(["auto", "auto", "auto"]);
      expect(layout.scrollWidth, `reception ${vp.name}: page scrollWidth vs clientWidth`).toBeLessThanOrEqual(
        layout.clientWidth,
      );
    });
  }
});
