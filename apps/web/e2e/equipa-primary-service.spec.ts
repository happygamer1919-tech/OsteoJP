/**
 * equipa-primary-service.spec.ts — Equipa tab: zero-mapping therapist gets a
 * primary service + a per-therapist Horários entry point (W4-01). Runs as admin.
 *
 * "E2E Terapeuta Sem Servicos" is seeded with NO therapist_services (the
 * Catarina-Vieira case): before W4-01 the row showed "Sem serviços" with no
 * control; now the dropdown lists all active services so a first primary can be
 * assigned, and Nova marcação then auto-fills it.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment } from "./helpers";
import { futureDate, RUN_DAY_BASE } from "./fixtures";

const THER = "E2E Terapeuta Sem Servicos";

test("Equipa: assign a primary to a zero-mapping therapist + Horários link + Nova marcação auto-fill (W4-01)", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const row = page.locator("tbody tr").filter({ hasText: THER });
  const select = row.locator('select[name="serviceId"]');

  // The primary dropdown lists ALL active services (not "Sem serviços").
  await expect(select).toBeVisible();
  await expect(select.locator("option", { hasText: "Osteopatia" })).toHaveCount(1);

  // A per-therapist Horários entry point deep-links into the working-hours view.
  await expect(row.getByRole("link", { name: "Horários" })).toHaveAttribute(
    "href",
    /\/admin\/working-hours\?t=/,
  );

  // Assign a first/primary service → it persists.
  await select.selectOption({ label: "Osteopatia" });
  await row.getByRole("button", { name: "Definir" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: THER })
      .locator('select[name="serviceId"] option:checked'),
  ).toHaveText("Osteopatia");

  // Nova marcação now auto-fills that primary when the therapist is chosen.
  const date = futureDate(RUN_DAY_BASE + 23);
  const dialog = await openNewAppointment(page, date);
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THER });
  await expect(dialog.getByLabel(/Serviço/i).locator("option:checked")).toHaveText("Osteopatia");
});

test("Equipa: password-gated therapist delete — wrong password refused, correct deletes an activity-free therapist (W4-01)", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const row = () => page.locator("tbody tr").filter({ hasText: THER });
  await expect(row()).toHaveCount(1);
  // W4-13: the management actions (incl. the password-gated delete) live in a
  // per-row `<details>` "Gerir" drawer — open it before interacting. The gate
  // itself is unchanged (restyle only).
  const openManage = async () => {
    const summary = row().locator("summary");
    if (!(await row().locator('input[name="password"]').isVisible())) {
      await summary.click();
    }
  };

  // Wrong password → refused; the therapist is still there.
  await openManage();
  await row().locator('input[name="password"]').fill("0000");
  await row().getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText(/Palavra-passe incorreta/i)).toBeVisible();
  await expect(row()).toHaveCount(1);

  // Correct password (tenant default 1234) → the activity-free therapist is deleted.
  await openManage();
  await row().locator('input[name="password"]').fill("1234");
  await row().getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(row()).toHaveCount(0);
});
