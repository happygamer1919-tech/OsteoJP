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
 *   4. Therapist is forbidden — no invoices:read capability.
 *   5. Patient profile page shows a "Faturação" tab for admin (invoices:read).
 *   6. "Faturação" tab is absent for therapist (no invoices:read).
 *   7. Faturação tab body renders the empty state for the test patient.
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

  test("filter bar renders date pickers and status select", async ({ page }) => {
    await page.goto("/invoicing");

    // Date pickers are labelled in PT-PT.
    await expect(page.getByText(/Data de início/i).first()).toBeVisible();
    await expect(page.getByText(/Data de fim/i).first()).toBeVisible();

    // Status select exists.
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
// /invoicing — therapist (no invoices:read → forbidden)
// ---------------------------------------------------------------------------

test.describe("/invoicing — therapist (forbidden)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("returns forbidden for therapist", async ({ page }) => {
    await page.goto("/invoicing");
    // The page renders an error paragraph rather than redirecting.
    await expect(page.getByText(/proibido|forbidden|não tem permiss/i)).toBeVisible({
      timeout: 8_000,
    });
    // Heading and empty state must be absent.
    await expect(
      page.getByRole("heading", { level: 1, name: /Fatura[cç][aã]o/i }),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Patient profile — Faturação tab
// ---------------------------------------------------------------------------

test.describe("patient profile — Faturação tab", () => {
  // Default storageState is admin (invoices:read granted).

  test("admin sees Faturação tab on patient profile", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}`);
    await expect(page).toHaveURL(/\/patients\//, { timeout: 10_000 });

    await expect(
      page.getByRole("tab", { name: /Fatura[cç][aã]o/i }),
    ).toBeVisible();
  });

  test("Faturação tab shows empty state for the test patient", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=faturacao`);

    // The empty state title: "Sem faturas"
    await expect(page.getByText(/Sem faturas/i)).toBeVisible({ timeout: 8_000 });
    // No invoice cards rendered.
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});

test.describe("patient profile — Faturação tab absent for therapist", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist does not see Faturação tab", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}`);
    await expect(page).toHaveURL(/\/patients\//, { timeout: 10_000 });

    await expect(
      page.getByRole("tab", { name: /Fatura[cç][aã]o/i }),
    ).toHaveCount(0);
  });
});
