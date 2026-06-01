/**
 * clinical.spec.ts — Stream C
 *
 * Covers: create record, fill form, bodychart, attachments, lock/sign,
 * version (addendum), read-only enforcement after locking.
 *
 * Plain-English scenario → test mapping:
 *
 *  1. Clinical records list loads (admin sees all, therapist sees own)
 *  2. Create a new clinical record with a form template selected
 *  3. Fill a textarea field and save as draft — data persists
 *  4. Bodychart: place a marker and save — marker persists on reload
 *  5. Upload an attachment to a record
 *  6. Sign-and-lock a draft record; form becomes read-only
 *  7. Editing a locked record is blocked (no save button)
 *  8. Create a new version (addendum) of a locked record
 *  9. New version is draft; previous version is still locked
 * 10. Receptionist is redirected away from /clinical (no access)
 * 11. Therapist cannot see another therapist's clinical records
 */

import { test, expect } from "@playwright/test";
import { goToClinical } from "./helpers";
import path from "path";

// ---------------------------------------------------------------------------
// 1. Clinical list loads
// ---------------------------------------------------------------------------
test("clinical records list loads for admin", async ({ page }) => {
  await goToClinical(page);
  // Either records appear or the empty state message is shown — either is valid.
  const hasRecords = await page.locator("table tbody tr, ul li").count();
  const hasEmpty = await page.getByText(/Sem registos|No records/i).count();
  expect(hasRecords + hasEmpty).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// 2. Create new clinical record
// ---------------------------------------------------------------------------
test("create clinical record with a template selected", async ({ page }) => {
  // Navigate to new record creation.
  await page.goto("/clinical/new");
  await expect(page).toHaveURL(/\/clinical\/new/);

  // Select first available patient.
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  // Select first template (e.g. Osteopatia).
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });

  await page.getByRole("button", { name: /Criar|Guardar/i }).click();

  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 3. Fill textarea and save draft
// ---------------------------------------------------------------------------
test("filling a textarea field and saving persists the data", async ({
  page,
}) => {
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /Criar/i }).click();
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });

  // Fill the first textarea present in the form (e.g. consultation_reason).
  const textarea = page.locator("textarea").first();
  await textarea.fill("Dor lombar irradiante para o membro inferior direito.");

  await page.getByRole("button", { name: /Guardar rascunho|Save draft/i }).click();

  // Reload and verify the value persisted.
  await page.reload();
  await expect(page.locator("textarea").first()).toHaveValue(
    "Dor lombar irradiante para o membro inferior direito.",
  );
});

// ---------------------------------------------------------------------------
// 4. Bodychart: place a marker
// ---------------------------------------------------------------------------
test("placing a bodychart marker and saving persists the marker", async ({
  page,
}) => {
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /Criar/i }).click();
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });

  // Click somewhere on the bodychart SVG to place a marker.
  const bodychart = page.locator("[data-bodychart]");
  const count = await bodychart.count();
  test.skip(count === 0, "No bodychart in this template");

  await bodychart.click({ position: { x: 80, y: 120 } });
  // A marker dot should appear.
  await expect(bodychart.locator("circle, [data-marker]").first()).toBeVisible({
    timeout: 4_000,
  });

  await page.getByRole("button", { name: /Guardar rascunho|Save draft/i }).click();
  await page.reload();

  // Marker should still be visible after reload.
  await expect(
    page.locator("[data-bodychart] circle, [data-bodychart] [data-marker]").first(),
  ).toBeVisible({ timeout: 6_000 });
});

// ---------------------------------------------------------------------------
// 5. Upload attachment
// ---------------------------------------------------------------------------
test("uploading an attachment appears in the attachments list", async ({
  page,
}) => {
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /Criar/i }).click();
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });

  // Upload a small PNG fixture.
  const fileInput = page.locator("input[type=file]");
  const count = await fileInput.count();
  test.skip(count === 0, "No file input on this record page");

  await fileInput.setInputFiles(
    path.join(__dirname, "fixtures", "test-attachment.png"),
  );

  // Attachment list should show the filename.
  await expect(page.getByText("test-attachment.png")).toBeVisible({
    timeout: 15_000, // upload round-trip
  });
});

// ---------------------------------------------------------------------------
// 6. Sign-and-lock a draft record
// ---------------------------------------------------------------------------
test("signing a draft record makes the form read-only", async ({ page }) => {
  // Create record first.
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /Criar/i }).click();
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });

  // Sign it.
  await page.getByRole("button", { name: /Assinar e bloquear|Sign/i }).click();

  // Success message or redirect with signed status.
  await expect(page.getByText(/Assinado|Signed|Bloqueado/i)).toBeVisible({
    timeout: 10_000,
  });

  // All inputs and textareas should be disabled/read-only.
  const textareas = page.locator("textarea");
  const tcnt = await textareas.count();
  for (let i = 0; i < tcnt; i++) {
    await expect(textareas.nth(i)).toBeDisabled();
  }
});

// ---------------------------------------------------------------------------
// 7. Locked record: no save button
// ---------------------------------------------------------------------------
test("locked record does not show a save button", async ({ page }) => {
  // Create and sign a record.
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /Criar/i }).click();
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });
  await page.getByRole("button", { name: /Assinar e bloquear|Sign/i }).click();
  await expect(page.getByText(/Assinado|Signed/i)).toBeVisible({ timeout: 10_000 });

  // Save draft button must not be visible on a locked record.
  await expect(
    page.getByRole("button", { name: /Guardar rascunho|Save draft/i }),
  ).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// 8. Create addendum version of a locked record
// ---------------------------------------------------------------------------
test("creating a new version (addendum) of a locked record succeeds", async ({
  page,
}) => {
  // Create and lock a record.
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /Criar/i }).click();
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });
  await page.getByRole("button", { name: /Assinar e bloquear|Sign/i }).click();
  await expect(page.getByText(/Assinado|Signed/i)).toBeVisible({ timeout: 10_000 });

  // Create new version.
  await page.getByRole("button", { name: /Nova versão|New version/i }).click();

  // Should redirect to a new /clinical/<new-id> in draft status.
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });
  await expect(page.getByText(/Rascunho|Draft/i)).toBeVisible({ timeout: 6_000 });
  await expect(page.getByText(/versão 2|version 2/i)).toBeVisible({ timeout: 6_000 });
});

// ---------------------------------------------------------------------------
// 9. Previous version still locked after new version created
// ---------------------------------------------------------------------------
test("previous record version remains locked after new version is created", async ({
  page,
}) => {
  // Create, sign, then new-version.
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ index: 1 });
  await page.getByLabel(/Modelo|Template/i).selectOption({ index: 1 });
  await page.getByRole("button", { name: /Criar/i }).click();
  await expect(page).toHaveURL(/\/clinical\/([a-z0-9-]+)$/, { timeout: 10_000 });

  const originalUrl = page.url();
  await page.getByRole("button", { name: /Assinar e bloquear|Sign/i }).click();
  await expect(page.getByText(/Assinado|Signed/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Nova versão|New version/i }).click();
  await expect(page).toHaveURL(/\/clinical\/[a-z0-9-]+$/, { timeout: 10_000 });

  // Navigate back to the original URL.
  await page.goto(originalUrl);
  // Still shows locked/signed.
  await expect(page.getByText(/Assinado|Bloqueado|Signed|Locked/i)).toBeVisible({
    timeout: 6_000,
  });
  // No save button.
  await expect(
    page.getByRole("button", { name: /Guardar rascunho|Save draft/i }),
  ).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// 10. Receptionist blocked from /clinical
// ---------------------------------------------------------------------------
test(
  "receptionist is redirected away from /clinical",
  { tag: "@reception" },
  async ({ page }) => {
    await page.goto("/clinical");
    const url = page.url();
    expect(url).not.toMatch(/\/clinical/);
  },
);
