/**
 * invoicing.spec.ts: the /invoicing list page and the patient Faturação tab.
 *
 * Feature: PR #332, the invoicing list UI with the InvoiceXpress integration gate.
 *
 * Assertions:
 *   1. /invoicing renders the "Faturação" heading for admin and reception.
 *   2. "Nova fatura" button is absent. This is NOT the evidence for T5 F2, which
 *      removed the button: InvoiceXpress credentials are never set in e2e, so the
 *      button was absent here before F2 as well. F2's guard is the unit test
 *      app/invoicing/invoicing-view.test.tsx.
 *   3. Empty state shows when no invoices exist in the date range (seed has none).
 *   4. Reception holds invoices:issue, which is what the route gates on, and sees
 *      the page.
 *   5. Therapist holds invoices:read but NOT invoices:issue, so the route renders
 *      the forbidden message instead of the page (W10-04, owner ruling
 *      2026-07-21).
 *   6. Patient profile page shows a "Faturação" tab for admin and for the
 *      therapist (both hold invoices:read).
 *   7. Faturação tab body renders the empty state for the test patient.
 *
 * Role matrix, from packages/auth/permissions.ts:
 *   /invoicing page (invoices:issue):  owner ✓, admin ✓, reception ✓, therapist ✗.
 *   Patient Faturação tab (invoices:read): owner ✓, admin ✓, reception ✓, therapist ✓.
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

    // No "Nova fatura" button. This was already true before T5 F2 removed the
    // button, because the e2e stack never sets InvoiceXpress credentials, so it
    // is not the evidence for F2: app/invoicing/invoicing-view.test.tsx is.
    await expect(
      page.getByRole("button", { name: /Nova fatura/i }),
    ).toHaveCount(0);
  });

  test("filter bar: date range triggers and status select are present", async ({ page }) => {
    await page.goto("/invoicing");

    // SCHED-07 / SR-38 — THE PICKER IS A TEXT FIELD NOW, not a button. Its
    // triggerLabel is the input's aria-label; the button beside it opens the
    // calendar and is named "Abrir calendário". A `getByRole("button")` here
    // matched nothing and this test was the second one to catch the change.
    await expect(
      page.getByRole("textbox", { name: /Data de início/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /Data de fim/i }),
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
// /invoicing — therapist (W10-04 isolation: NO access; owner ruling 2026-07-21)
// ---------------------------------------------------------------------------

test.describe("/invoicing — therapist (no access)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist is DENIED /invoicing (Faturação is owner/admin/reception only)", async ({
    page,
  }) => {
    await page.goto("/invoicing");
    // The route renders the forbidden guard for a therapist (invoices:read but
    // NOT invoices:issue): no Faturação heading. The heading half is the real
    // check, because admin and reception see it above. The button half proves
    // nothing about the therapist: no role sees that button in e2e, before T5
    // F2 or after it (board card
    // TEST-negative-security-assertions-without-a-positive-control, item 4).
    await expect(
      page.getByRole("heading", { level: 1, name: /Fatura[cç][aã]o/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Nova fatura/i })).toHaveCount(0);
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
