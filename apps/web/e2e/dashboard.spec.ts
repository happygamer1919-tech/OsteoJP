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

  test("admin sees the Resumo semanal panel", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Resumo semanal" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Therapist
// ---------------------------------------------------------------------------
test.describe("therapist dashboard", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist sees Registo clínico tile and Novas fichas KPI", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Registo clínico" })).toBeVisible();
    await expect(page.getByText("Novas fichas")).toBeVisible();
  });

  test("therapist has no Administração tile", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
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

  test("reception omits Novas fichas KPI, Registo clínico tile, and Administração tile", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Novas fichas")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Registo clínico" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
  });
});
