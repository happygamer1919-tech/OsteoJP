/**
 * patient-documents.spec.ts — Documentos tab upload (W5-10). Runs as admin
 * (has patients:write, so the upload control is present).
 *
 * The Documentos tab was EmptyState-only; it now lets staff upload
 * administrative documents to a patient and open them via short-lived signed
 * URLs, reusing the existing `attachments` table via its nullable patient_id
 * column (migration-free). All work is on a FRESH SYNTHETIC patient created in
 * the test (never a real patient).
 *
 * As in camera-to-ficha.spec.ts, the CI/local seed does NOT provision the
 * `clinical-attachments` Storage bucket, so the actual upload landing (direct
 * signed PUT -> confirm -> signed GET) is covered by the unit tests
 * (lib/patients/document-validation.test.ts + the shared signed-URL helpers);
 * this e2e asserts the tab UI: the empty state, the upload affordance for a
 * writer role, and that the file input advertises the accepted document types.
 */
import { test, expect } from "@playwright/test";
import { createPatient } from "./helpers";

const uniq = () => Math.random().toString(36).slice(2, 8);

test("Documentos tab shows the empty state and the upload control for a writer", async ({
  page,
}) => {
  const id = await createPatient(page, { fullName: `Documentos ${uniq()}` });

  await page.goto(`/patients/${id}?tab=documentos`);

  // A fresh patient has no documents yet: the pt-PT empty message shows.
  await expect(page.getByText("Ainda não existem documentos para este paciente.")).toBeVisible({
    timeout: 8_000,
  });

  // The upload affordance is present for a patients:write role (admin here).
  await expect(page.getByText("Carregar documento")).toBeVisible();

  // The hidden file input constrains the accepted types (PDF/image/Word) —
  // the UX side of the type gate; the server re-validates on confirm.
  const input = page.locator('input[type="file"]');
  await expect(input).toHaveCount(1);
  const accept = await input.getAttribute("accept");
  expect(accept).toContain("application/pdf");
  expect(accept).toContain("image/");
});
