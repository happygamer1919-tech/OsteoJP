/**
 * estatisticas.spec.ts - W6-05. The Estatisticas KPI dashboard is OWNER-ONLY.
 * The owner sees the nav item + the KPI cards + a chart; a non-owner cannot see
 * the nav item and is redirected from the route even by direct URL (route-level
 * gate, not nav hiding alone). The owner logs in fresh (seeded owner user).
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
  test("owner sees the Estatisticas nav item and the KPI dashboard (cards + chart)", async ({
    page,
  }) => {
    await loginAsOwner(page);

    // Nav item is visible for the owner.
    await expect(page.getByRole("link", { name: "Estatísticas" }).first()).toBeVisible();

    await page.goto("/estatisticas");
    const content = page.locator("main");
    await expect(content.getByRole("heading", { name: "Estatísticas", exact: true })).toBeVisible();

    // KPI cards render (revenue + volume + utilization). Scoped to main so the
    // sidebar nav (which also has a "Marcações" item) can't cause a clash.
    await expect(content.getByText("Receita total")).toBeVisible();
    await expect(content.getByText("Total de marcações")).toBeVisible();
    await expect(content.getByText("Tempo ocupado")).toBeVisible();

    // The polished chart area renders.
    await expect(content.getByRole("heading", { name: "Receita por mês" })).toBeVisible();
  });
});

test.describe("Estatisticas - owner-gate", () => {
  test.use({ storageState: STORAGE.admin });

  test("a non-owner (admin) has no Estatisticas nav item and is redirected from the route", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Estatísticas" })).toHaveCount(0);

    await page.goto("/estatisticas");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
  });
});
