/**
 * marcacoes-service-filter.spec.ts (W6-01b): the Marcações "Serviço" filter is
 * DATA-DRIVEN from the tenant's real services, not the old hardcoded 5-entry
 * colour-category list. Runs as admin (appointments:read + services:read).
 *
 * Proof: the filter offers the seeded tenant services (Osteopatia, NESA) and no
 * longer offers the old hardcoded accent labels ("Outros serviços",
 * "Massagem Relaxamento"). The seed provisions no appointments, so this pins the
 * OPTION SOURCE (the bug); the narrowing + inactive-inclusion + tint are covered
 * deterministically by app/marcacoes/marcacoes-view.test.tsx.
 */
import { test, expect } from "@playwright/test";

test("Marcações Serviço filter lists the tenant's real services, not the hardcoded categories", async ({
  page,
}) => {
  await page.goto("/marcacoes");
  const serviceFilter = page.getByLabel("Serviço", { exact: true });
  await expect(serviceFilter).toBeVisible();

  // Data-driven: the real seeded services appear as options.
  await expect(serviceFilter.locator("option", { hasText: "Osteopatia" })).toHaveCount(1);
  await expect(serviceFilter.locator("option", { hasText: "NESA" })).toHaveCount(1);

  // The old hardcoded accent labels / "other" bucket are gone from the filter.
  await expect(serviceFilter.locator("option", { hasText: "Outros serviços" })).toHaveCount(0);
  await expect(serviceFilter.locator("option", { hasText: "Massagem Relaxamento" })).toHaveCount(0);
});
