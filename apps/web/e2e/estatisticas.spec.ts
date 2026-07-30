/**
 * estatisticas.spec.ts - W6-05 + W8-03 + PL-09 Phase 3. Estatísticas is gated on
 * the `statistics:read` permission at every route (route redirect + per-query
 * guard, not nav-hiding alone). Since PL-09 Phase 3 that permission belongs to
 * BOTH owner and admin (admin's data is location-scoped in the queries); therapist
 * and reception still have neither the nav item nor route access. W8-03 splits the
 * landing into a two-card CHOOSER: "Estatísticas" (the unchanged dashboard, now at
 * /estatisticas/painel) and "Indicadores (KPI)" (the recharts section at
 * /estatisticas/indicadores).
 */
import { test, expect, type Page } from "@playwright/test";
import { USERS, E2E_PASSWORD, STORAGE } from "./fixtures";

async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(USERS.owner);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Iniciar sessão/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("Estatisticas - owner", () => {
  test("owner sees the chooser, the unchanged dashboard, and the KPI section (W8-03)", async ({
    page,
  }) => {
    await loginAsOwner(page);

    // Nav item is visible for the owner and lands on the two-card chooser.
    await expect(page.getByRole("link", { name: "Estatísticas" }).first()).toBeVisible();
    await page.goto("/estatisticas");
    const chooser = page.locator("main");
    await expect(chooser.getByRole("heading", { name: "Estatísticas", exact: true })).toBeVisible();
    await expect(chooser.getByRole("link", { name: /Indicadores \(KPI\)/ })).toBeVisible();

    // "Estatísticas" card opens the UNCHANGED dashboard (cards + hand-rolled chart).
    await chooser.getByRole("link", { name: /Estatísticas/ }).click();
    await page.waitForURL(/\/estatisticas\/painel/);
    const dash = page.locator("main");
    await expect(dash.getByText("Receita total")).toBeVisible();
    await expect(dash.getByText("Total de marcações")).toBeVisible();
    await expect(dash.getByRole("heading", { name: "Receita por mês" })).toBeVisible();

    // "Indicadores (KPI)" opens the new recharts section: period picker + report
    // menu + a rendered report.
    await page.goto("/estatisticas/indicadores");
    const kpi = page.locator("main");
    await expect(kpi.getByRole("heading", { name: "Indicadores (KPI)", exact: true })).toBeVisible();
    await expect(kpi.getByText("Escolher período")).toBeVisible();
    await expect(kpi.getByRole("button", { name: "Últimos 12 meses" })).toBeVisible();
    // Report menu buttons + the default report section heading.
    await expect(kpi.getByRole("button", { name: "Tipos de marcação" })).toBeVisible();
    await expect(kpi.getByRole("heading", { name: "Tipos de marcação" })).toBeVisible();
    // Switch to another report client-side.
    await kpi.getByRole("button", { name: "Distribuição etária" }).click();
    await expect(kpi.getByRole("heading", { name: "Distribuição etária" })).toBeVisible();
  });
});

test.describe("Estatisticas - admin (PL-09 Phase 3, location-scoped access)", () => {
  test.use({ storageState: STORAGE.admin });

  test("an admin sees the nav item and reaches every Estatísticas route", async ({ page }) => {
    // Nav item is present for the admin (statistics:read) and lands on the chooser.
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Estatísticas" }).first()).toBeVisible();

    // Chooser + both surfaces are reachable (no redirect to /dashboard).
    await page.goto("/estatisticas");
    await expect(
      page.locator("main").getByRole("heading", { name: "Estatísticas", exact: true }),
    ).toBeVisible();

    await page.goto("/estatisticas/painel");
    await expect(page.getByText("Receita total")).toBeVisible();

    await page.goto("/estatisticas/indicadores");
    await expect(
      page.locator("main").getByRole("heading", { name: "Indicadores (KPI)", exact: true }),
    ).toBeVisible();
  });
});

// Therapist + reception have neither statistics:read nor the nav item: no entry
// point and a route-level redirect from ALL three routes (gate, not nav-hiding).
for (const role of ["therapist", "reception"] as const) {
  test.describe(`Estatisticas - gate (${role})`, () => {
    test.use({ storageState: STORAGE[role] });

    test(`a ${role} has no nav item and is redirected from every Estatísticas route`, async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await expect(page.getByRole("link", { name: "Estatísticas" })).toHaveCount(0);

      for (const path of ["/estatisticas", "/estatisticas/painel", "/estatisticas/indicadores"]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
      }
    });
  });
}
