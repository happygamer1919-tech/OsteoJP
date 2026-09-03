/**
 * therapist-self-lock.spec.ts (PL-10, owner DoD 2026-07-30).
 *
 * A THERAPIST logged into the create form self-books: the appointment's
 * practitioner is FORCED to the logged-in therapist and the Terapeuta selector
 * is NOT shown (replaced by a static label of their own name). Their PRIMARY
 * service is preselected ON OPEN — not only after a manual change (a self-locked
 * therapist has no Terapeuta control to change). The FULL active service list
 * stays switchable: preselection is never restriction.
 *
 * Login: this variant runs as the E2E THERAPIST (STORAGE.therapist), unlike
 * booking-service-preselection.spec.ts which runs as admin (default storage).
 * The per-role storage states are produced once by auth.setup.ts (it logs in
 * e2e-therapist@osteojp.test with E2E_PASSWORD and saves the session). No seed
 * overhaul is needed — seed-e2e.mjs already provisions that therapist and maps
 * them to Osteopatia (primary) + NESA, leaving "Drenagem Linfática" (SERVICE_
 * UNMAPPED) active-but-unmapped. If a fresh therapist-login were ever needed
 * without stored state, log in inline with USERS.therapist + E2E_PASSWORD (see
 * auth.spec.ts for the raw login flow).
 *
 * Red-then-green discriminators (pre-PL-10 the therapist saw the FULL Terapeuta
 * dropdown with an EMPTY practitioner and NO preselect on open):
 *   - the Terapeuta combobox is absent (self-lock),
 *   - the therapist's own name shows as a static label,
 *   - Serviço is preselected to the PRIMARY on open with no manual change.
 */
import { test, expect } from "@playwright/test";
import { dateField, fillDate, fillTime, openNewAppointment } from "./helpers";
import {
  PATIENTS,
  LOCATION,
  SERVICE,
  SERVICE_UNMAPPED,
  STORAGE,
  THERAPIST_NAME,
  futureDate,
  RUN_DAY_BASE,
} from "./fixtures";

const SAVE = "Guardar";

test.describe("therapist self-lock on the create form (PL-10)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist self-books: no Terapeuta selector, own name shown, primary preselected on open, full service list still switchable", async ({
    page,
  }) => {
    const date = futureDate(RUN_DAY_BASE + 44);
    const dialog = await openNewAppointment(page, date);

    // Self-lock: the Terapeuta selector is NOT rendered for a therapist — it is
    // replaced by a static, read-only label of their OWN name. Pre-PL-10 this
    // was a full <select> (combobox); its absence is the self-lock discriminator.
    await expect(dialog.getByRole("combobox", { name: /Terapeuta/i })).toHaveCount(0);
    await expect(dialog.getByText(THERAPIST_NAME)).toBeVisible();

    // DoD #2 — the therapist's PRIMARY service (Osteopatia, oldest mapping) is
    // preselected ON OPEN, with no manual Terapeuta change (there is no control
    // to change). Pre-PL-10 the preselect only fired after a manual change, so
    // this field would have been empty.
    const service = dialog.getByLabel(/Serviço/i);
    await expect(service).toHaveValue(SERVICE.id);

    // DoD #3 — the FULL active service list stays offered, INCLUDING a service
    // the therapist is NOT mapped to. Preselection is never restriction.
    await expect(service.locator("option", { hasText: SERVICE_UNMAPPED.name })).toHaveCount(1);
    await expect(service.locator("option", { hasText: SERVICE.name })).toHaveCount(1);
    await expect(service.locator("option", { hasText: "NESA" })).toHaveCount(1);

    // The therapist switches to the unmapped active service — allowed.
    await service.selectOption({ label: SERVICE_UNMAPPED.name });
    await expect(service.locator("option:checked")).toHaveText(SERVICE_UNMAPPED.name);

    // Complete a booking on the therapist's OWN calendar (patient created_by them).
    const patient = dialog.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.joao.name);
    await dialog.getByRole("option", { name: PATIENTS.joao.name }).click();
    await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
    await fillDate(dateField(dialog), date);
    await fillTime(dialog, "11:00");
    await dialog.getByRole("button", { name: SAVE }).click();
    await expect(dialog).toBeHidden({ timeout: 12_000 });

    // The therapist agenda is scoped to their OWN calendar (W10-04), so the new
    // card appearing here confirms the appointment was booked to self — the
    // practitioner was forced to the logged-in therapist end-to-end.
    await expect(
      page.getByRole("button", { name: new RegExp(PATIENTS.joao.name) }),
    ).toBeVisible({ timeout: 8_000 });
  });
});
