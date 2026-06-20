/**
 * invoicing.spec.ts — /invoicing list page + patient Faturação tab
 *
 * Feature: PR #332 — invoicing list UI with InvoiceXpress integration gate.
 *
 * Assertions:
 *   1. /invoicing renders the "Faturação" heading for admin and reception.
 *   2. "Nova fatura" button is absent — INVOICEXPRESS creds are never set in
 *      the e2e environment, so credentialsConfigured() always returns false.
 *   3. Empty state shows when no invoices exist in the date range (seed has none).
 *   4. Reception also has invoices:read — verified to see the page.
 *   5. Therapist also has invoices:read (read-only) — can access the page.
 *   6. Patient profile page shows a "Faturação" tab for admin (invoices:read).
 *   7. Faturação tab body renders the empty state for the test patient.
 *
 * Role matrix for invoices:read: owner ✓, admin ✓, therapist ✓, reception ✓.
 *
 * All specs run in chromium only (listed in testIgnore for firefox + webkit).
 */

import { test, expect } from "@playwright/test";
import { PATIENTS, STORAGE } from "./fixtures";

// ---------------------------------------------------------------------------
// /invoicing — admin
// ---------------------------------------------------------------------------

test.describe("/invoicing — admin", () => {
  // Default storageState is admin.

  test("renders heading and empty state; Nova fatura button is absent", async ({ page }) => {
    await page.goto("/invoicing");
    await expect(page).toHaveURL(/\/invoicing(\?|$)/, { timeout: 10_000 });

    // Heading
    await expect(
      page.getByRole("heading", { level: 1, name: /Fatura[cç][aã]o/i }),
    ).toBeVisible();

    // Empty state — no invoices seeded in the e2e fixture.
    await expect(
      page.getByText(/Sem faturas no período selecionado/i),
    ).toBeVisible();

    // "Nova fatura" button must be hidden because INVOICEXPRESS creds are not
    // set in the e2e environment (credentialsConfigured() returns false).
    await expect(
      page.getByRole("button", { name: /Nova fatura/i }),
    ).toHaveCount(0);
  });

  test("filter bar: date range triggers and status select are present", async ({ page }) => {
    await page.goto("/invoicing");

    // The DatePicker component renders the triggerLabel as aria-label on its
    // trigger button (not as visible text). Use getByRole to target it.
    await expect(
      page.getByRole("button", { name: /Data de início/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Data de fim/i }),
    ).toBeVisible();

    // Status filter: a <select> element with aria-label "Estado".
    await expect(
      page.getByRole("combobox", { name: /Estado/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// /invoicing — reception (also has invoices:read)
// ---------------------------------------------------------------------------

test.describe("/invoicing — reception", () => {
  test.use({ storageState: STORAGE.reception });

  test("renders for reception role", async ({ page }) => {
    await page.goto("/invoicing");
    await expect(page).toHaveURL(/\/invoicing(\?|$)/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /Fatura[cç][aã]o/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// /invoicing — therapist (read-only: invoices:read but no invoices:issue)
// ---------------------------------------------------------------------------

test.describe("/invoicing — therapist (read-only)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist can access /invoicing (has invoices:read)", async ({ page }) => {
    await page.goto("/invoicing");
    await expect(page).toHaveURL(/\/invoicing(\?|$)/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /Fatura[cç][aã]o/i }),
    ).toBeVisible();
    // Therapist has invoices:read but not invoices:issue — no issue button.
    await expect(
      page.getByRole("button", { name: /Nova fatura/i }),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Patient profile — Faturação tab (visible to all roles with invoices:read)
// ---------------------------------------------------------------------------

test.describe("patient profile — Faturação tab", () => {
  // Default storageState is admin.

  test("admin sees Faturação tab on patient profile", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}`);
    await expect(page).toHaveURL(/\/patients\//, { timeout: 10_000 });

    await expect(
      page.getByRole("tab", { name: /Fatura[cç][aã]o/i }),
    ).toBeVisible();
  });

  test("Faturação tab shows empty state for the test patient", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=faturacao`);

    // Empty state title: "Sem faturas"
    await expect(page.getByText(/Sem faturas/i)).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("patient profile — Faturação tab visible for therapist", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist sees Faturação tab (has invoices:read)", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}`);
    await expect(page).toHaveURL(/\/patients\//, { timeout: 10_000 });

    await expect(
      page.getByRole("tab", { name: /Fatura[cç][aã]o/i }),
    ).toBeVisible();
  });
});
