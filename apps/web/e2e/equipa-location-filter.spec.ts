/**
 * equipa-location-filter.spec.ts — W5-32 (re-pointed to the W12-40 card grid).
 *
 * Runs as ADMIN (default storageState). The Administração / Equipa list gains the
 * Agenda location select right of the search bar: default "Todas as localizações"
 * shows everyone; selecting a location shows only members assigned there (via
 * their availability); and it composes (AND) with the ?q= name search. The list
 * is now a grid of per-member cards (data-testid="equipa-card").
 *
 * Seeded team↔location (seed-e2e.mjs): "E2E Terapeuta Clinica Unica" → Linda-a-
 * Velha only; "E2E Terapeuta Varias Clinicas" → Linda-a-Velha + Consultório B.
 */
import { test, expect, type Page } from "@playwright/test";

const UNICA = "E2E Terapeuta Clinica Unica"; // Linda-a-Velha only
const MULTI = "E2E Terapeuta Varias Clinicas"; // Linda-a-Velha + Consultório B
const LOC_LV = "Linda-a-Velha";
const LOC_B = "Consultório B (E2E)";

/** The member card for `name` (each card holds exactly one member). */
function card(page: Page, name: string) {
  return page.locator('[data-testid="equipa-card"]').filter({ hasText: name });
}

test("W5-32: Equipa location filter — default Todas, filters by assigned location, composes with search", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const filter = page.getByLabel("Localização");

  // Default: "Todas as localizações" — both therapists visible.
  await expect(filter).toHaveValue("");
  await expect(card(page, UNICA)).toBeVisible();
  await expect(card(page, MULTI)).toBeVisible();

  // Select Consultório B → only the multi-location therapist (Unica is LV-only).
  await filter.selectOption({ label: LOC_B });
  await expect(card(page, MULTI)).toBeVisible();
  await expect(card(page, UNICA)).toHaveCount(0);

  // Select Linda-a-Velha → both are assigned there.
  await filter.selectOption({ label: LOC_LV });
  await expect(card(page, MULTI)).toBeVisible();
  await expect(card(page, UNICA)).toBeVisible();

  // Compose: Linda-a-Velha + search "Varias" → intersection (only Multi).
  await page.getByRole("searchbox").fill("Varias");
  await expect(card(page, MULTI)).toBeVisible();
  await expect(card(page, UNICA)).toHaveCount(0);
  // The location filter is preserved through the search navigation.
  await expect(filter).toHaveValue(/.+/);

  // Clearing the search widens back to both (location still Linda-a-Velha).
  await page.getByRole("searchbox").fill("");
  await expect(card(page, MULTI)).toBeVisible();
  await expect(card(page, UNICA)).toBeVisible();
});
