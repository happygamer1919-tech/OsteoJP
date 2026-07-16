/**
 * estatisticas.spec.ts - W6-05 + W8-03. Estatísticas is OWNER-ONLY at every
 * route. W8-03 splits the landing into a two-card CHOOSER: "Estatísticas" (the
 * unchanged dashboard, now at /estatisticas/painel) and "Indicadores (KPI)" (the
 * new recharts section at /estatisticas/indicadores). The owner sees the nav item
 * + both cards + each surface; a non-owner has no nav item and is redirected from
 * ALL three routes (route-level gate, not nav hiding alone).
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

test.describe("Estatisticas - owner-gate", () => {
  test.use({ storageState: STORAGE.admin });

  test("a non-owner (admin) has no nav item and is redirected from every Estatísticas route", async ({
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
