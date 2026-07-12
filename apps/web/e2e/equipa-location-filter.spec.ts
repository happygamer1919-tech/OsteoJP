/**
 * equipa-location-filter.spec.ts — W5-32.
 *
 * Runs as ADMIN (default storageState). The Administração / Equipa list gains the
 * Agenda location select right of the search bar: default "Todas as localizações"
 * shows everyone; selecting a location shows only members assigned there (via
 * their availability); and it composes (AND) with the ?q= name search.
 *
 * Seeded team↔location (seed-e2e.mjs): "E2E Terapeuta Clinica Unica" → Linda-a-
 * Velha only; "E2E Terapeuta Varias Clinicas" → Linda-a-Velha + Consultório B.
 */
import { test, expect } from "@playwright/test";

const UNICA = "E2E Terapeuta Clinica Unica"; // Linda-a-Velha only
const MULTI = "E2E Terapeuta Varias Clinicas"; // Linda-a-Velha + Consultório B
const LOC_LV = "Linda-a-Velha";
const LOC_B = "Consultório B (E2E)";

test("W5-32: Equipa location filter — default Todas, filters by assigned location, composes with search", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const filter = page.getByLabel("Localização");
  // Target the table CELL specifically (the per-row manage modal also holds the
  // name in a hidden <p>, so a plain getByText is ambiguous).
  const cell = (name: string) => page.getByRole("cell", { name, exact: true });

  // Default: "Todas as localizações" — both therapists visible.
  await expect(filter).toHaveValue("");
  await expect(cell(UNICA)).toBeVisible();
  await expect(cell(MULTI)).toBeVisible();

  // Select Consultório B → only the multi-location therapist (Unica is LV-only).
  await filter.selectOption({ label: LOC_B });
  await expect(cell(MULTI)).toBeVisible();
  await expect(cell(UNICA)).toHaveCount(0);

  // Select Linda-a-Velha → both are assigned there.
  await filter.selectOption({ label: LOC_LV });
  await expect(cell(MULTI)).toBeVisible();
  await expect(cell(UNICA)).toBeVisible();

  // Compose: Linda-a-Velha + search "Varias" → intersection (only Multi).
  await page.getByRole("searchbox").fill("Varias");
  await expect(cell(MULTI)).toBeVisible();
  await expect(cell(UNICA)).toHaveCount(0);
  // The location filter is preserved through the search navigation.
  await expect(filter).toHaveValue(/.+/);

  // Clearing the search widens back to both (location still Linda-a-Velha).
  await page.getByRole("searchbox").fill("");
  await expect(cell(MULTI)).toBeVisible();
  await expect(cell(UNICA)).toBeVisible();
});
