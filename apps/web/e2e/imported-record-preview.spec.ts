/**
 * imported-record-preview.spec.ts — B1.
 *
 * ==========================================================================
 * WHAT WAS REPRODUCED BEFORE THIS WAS FIXED, ON THIS SCREEN
 * ==========================================================================
 * An imported Fisiozero registo clínico opened to NOTHING. The row was on the
 * patient profile, badged "Bloqueada"; pressing it reached /clinical/<id>,
 * which drew the patient strip, the immutability banner, "Anexos: Sem anexos."
 * — and a single em-dash where the clinical content should be. None of the six
 * stored values appeared anywhere on the page. It was not a 404 and not an
 * error boundary: an empty record.
 *
 * WHY: the viewer is schema-driven. `RecordDetailPage` computes
 *   const schema = record.template ? parseTemplateSchema(record.template.schema) : null;
 * and `getRecordDetail` returns `template: null` whenever `form_template_id` is
 * NULL. `clinicalRecordValues` (packages/db/src/migration/upsert.ts) never sets
 * that column, so it is NULL on EVERY imported record, and the fallback branch
 * rendered `<p>—</p>`.
 *
 * THE CONTENT WAS NEVER MISSING. It is in `clinical_records.data`, under the
 * vendor's own column names.
 *
 * These tests now hold the fixed behaviour: the values are readable, and the
 * record is still read-only.
 */
import { test, expect } from "@playwright/test";
import { IMPORTED_RECORD, STORAGE } from "./fixtures";

test.describe("B1 — an imported registo clínico (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("the record row is listed on the profile, badged Bloqueada", async ({ page }) => {
    await page.goto(`/patients/${IMPORTED_RECORD.patientId}?tab=registos`);
    const row = page.locator(`[data-record-id="${IMPORTED_RECORD.id}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Bloqueada");
  });

  test("opening it shows every stored value, under its source field name", async ({ page }) => {
    await page.goto(`/clinical/${IMPORTED_RECORD.id}`);
    const preview = page.getByTestId("imported-record-preview");
    await expect(preview).toBeVisible();

    const body = await page.getByRole("main").first().innerText();
    // Every prose value is on the screen. `escala_eva` is the single digit 6,
    // which also occurs inside this page's "Criado em" date, so a substring
    // test on it would pass for a reason unrelated to the record — it is
    // asserted through its LABEL and its own row instead.
    for (const [key, value] of Object.entries(IMPORTED_RECORD.values)) {
      if (typeof value !== "string") continue;
      expect(body.includes(value), `stored value for "${key}" is not rendered`).toBe(true);
    }
    // The keys are shown VERBATIM, so a reader can map a line back to the
    // delivery column it came from.
    for (const key of Object.keys(IMPORTED_RECORD.values)) {
      await expect(preview.getByText(key, { exact: true })).toBeVisible();
    }
    // escala_eva, by its row rather than by substring.
    const eva = preview.locator("div", { has: page.getByText("escala_eva", { exact: true }) });
    await expect(eva.first()).toContainText(String(IMPORTED_RECORD.values.escala_eva));
  });

  test("it stays read-only: the locked banner is there and nothing can be edited", async ({
    page,
  }) => {
    await page.goto(`/clinical/${IMPORTED_RECORD.id}`);
    await expect(page.getByTestId("imported-record-preview")).toBeVisible();
    // The immutability notice still leads the record.
    await expect(page.getByText(/finalizada e imut/i)).toBeVisible();
    // NO edit path was added: the preview renders no field and no submit.
    const main = page.getByRole("main").first();
    await expect(main.locator("input, textarea, select")).toHaveCount(0);
    await expect(main.getByRole("button", { name: /Guardar/i })).toHaveCount(0);
  });
});
