/**
 * dashboard.spec.ts — Dashboard load (staff platform)
 *
 * Verifies that /dashboard renders the correct structure and role-gated
 * elements for all three staff roles. Assertions target structural labels
 * (not KPI counts or tile links), so the suite is data-agnostic.
 *
 * Role-gated expectations derived from packages/auth/permissions.ts:
 *
 * | Capability              | admin | therapist | reception |
 * | appointments:read/write |  ✓    |    ✓      |    ✓      |
 * | patients:write          |  ✓    |    ✓      |    ✓      |
 * | clinical_records:read   |  ✓    |    ✓      |    ✗      |
 * | clinical_records:author |  ✗    |    ✓      |    ✗      |
 * | settings:read           |  ✓    |    ✗      |    ✗      |
 *
 * KPI cards visible per role:
 *   "Pacientes ativos"    — always
 *   "Marcações hoje"      — roles with appointments:read (all three)
 *   "Novas fichas"        — roles with clinical_records:read (admin + therapist)
 *   "Receita (mês)"       — always
 *
 */
import { test, expect } from "@playwright/test";
import { STORAGE } from "./fixtures";

// ---------------------------------------------------------------------------
// Admin (default storageState — playwright.config.ts)
// ---------------------------------------------------------------------------
test.describe("admin dashboard", () => {
  test("loads /dashboard without redirect", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)/i }),
    ).toBeVisible();
  });

  test("admin sees all four KPI card labels", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Pacientes ativos")).toBeVisible();
    await expect(page.getByText("Marcações hoje")).toBeVisible();
    await expect(page.getByText("Novas fichas")).toBeVisible();
    await expect(page.getByText("Receita (mês)")).toBeVisible();
  });

  test("admin sees the Resumo semanal + Próximas marcações panels", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Resumo semanal" })).toBeVisible();
    // W4-18: the new Próximas marcações card (admin has appointments:read).
    await expect(page.getByRole("heading", { name: "Próximas marcações" })).toBeVisible();
  });

  test("admin has no Iniciar consulta tile (admin lacks clinical_records:author) (W4-20)", async ({ page }) => {
    await page.goto("/dashboard");
    const quickActions = page.locator("section").filter({ hasText: "Acessos rápidos" });
    await expect(quickActions.getByRole("link", { name: "Iniciar consulta" })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Therapist
// ---------------------------------------------------------------------------
test.describe("therapist dashboard", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist sees Ficha Clínica tile and Novas fichas KPI", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Ficha Clínica" })).toBeVisible();
    await expect(page.getByText("Novas fichas")).toBeVisible();
  });

  test("therapist has no Administração tile", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
  });

  test("therapist sees the Iniciar consulta tile → /consultation (W4-20)", async ({ page }) => {
    await page.goto("/dashboard");
    // clinical_records:author → therapist + owner; the sixth quick-action tile
    // links to the start-consultation recording screen (/consultation), which
    // otherwise has no nav entry. Scoped to the "Acessos rápidos" section for
    // robustness (the Revisão Consulta left-nav link is unaffected by this swap).
    const quickActions = page.locator("section").filter({ hasText: "Acessos rápidos" });
    const tile = quickActions.getByRole("link", { name: "Iniciar consulta" });
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute("href", "/consultation");
  });
});

// ---------------------------------------------------------------------------
// Reception
// ---------------------------------------------------------------------------
test.describe("reception dashboard", () => {
  test.use({ storageState: STORAGE.reception });

  test("reception loads /dashboard without redirect", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
    await expect(page.getByText("Pacientes ativos")).toBeVisible();
    await expect(page.getByText("Marcações hoje")).toBeVisible();
  });

  test("reception omits Novas fichas KPI, Ficha Clínica tile, and Administração tile", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Novas fichas")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ficha Clínica" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
  });
});
