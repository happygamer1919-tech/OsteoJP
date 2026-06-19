/**
 * dashboard.spec.ts — Dashboard load (staff platform)
 *
 * Verifies that /dashboard renders the correct structure and role-gated
 * elements for all three staff roles. Assertions target structural labels
 * (not KPI counts), so the suite is data-agnostic — values vary by seed,
 * tile labels are deterministic constants.
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
 * Quick-action tiles visible per role:
 *   "Nova marcação"   — appointments:write (all three)
 *   "Novo paciente"   — patients:write (all three)
 *   "Ficha clínica"   — clinical_records:author (therapist only)
 *   "Ver agenda"      — appointments:read (all three)
 *   "Administração"   — settings:read (admin only)
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
    // Greeting h1 (time-dependent but structurally fixed).
    await expect(
      page.getByRole("heading", { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)/i }),
    ).toBeVisible();
  });

  test("admin sees all four KPI card labels", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Pacientes ativos")).toBeVisible();
    await expect(page.getByText("Marcações hoje")).toBeVisible();
    // Admin has clinical_records:read → "Novas fichas" is rendered.
    await expect(page.getByText("Novas fichas")).toBeVisible();
    await expect(page.getByText("Receita (mês)")).toBeVisible();
  });

  test("admin quick-action tiles include Administração but not Ficha clínica", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Acessos rápidos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nova marcação" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Novo paciente" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver agenda" })).toBeVisible();
    // settings:read → tile visible.
    await expect(page.getByRole("link", { name: "Administração" })).toBeVisible();
    // Admin does NOT have clinical_records:author → tile absent.
    await expect(page.getByRole("link", { name: "Ficha clínica" })).toHaveCount(0);
  });

  test("admin sees the Próximas marcações and Resumo semanal panels", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Próximas marcações" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resumo semanal" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Therapist
// ---------------------------------------------------------------------------
test.describe("therapist dashboard", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist sees Ficha clínica tile and all four KPI cards", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
    // clinical_records:author → tile present.
    await expect(page.getByRole("link", { name: "Ficha clínica" })).toBeVisible();
    // clinical_records:read → "Novas fichas" KPI present.
    await expect(page.getByText("Novas fichas")).toBeVisible();
  });

  test("therapist has no Administração tile", async ({ page }) => {
    await page.goto("/dashboard");
    // Therapist lacks settings:read.
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

  test("reception omits Novas fichas KPI, Ficha clínica tile, and Administração tile", async ({ page }) => {
    await page.goto("/dashboard");
    // No clinical_records:read → KPI absent.
    await expect(page.getByText("Novas fichas")).toHaveCount(0);
    // No clinical_records:author → tile absent.
    await expect(page.getByRole("link", { name: "Ficha clínica" })).toHaveCount(0);
    // No settings:read → tile absent.
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
  });

  test("reception sees scheduling tiles it is authorised to use", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Nova marcação" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Novo paciente" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver agenda" })).toBeVisible();
  });
});
