/**
 * staff-invite.spec.ts — Administração > Equipa > Convidar novo membro (W7-01).
 *
 * The regression: the invite returned the generic "A operação falhou. Tente
 * novamente." with no temporary password, because any raw error from the
 * privileged provisioning step was masked by the action's catch-all.
 *
 * The E2E environment sets neither INVITES_LIVE_SEND nor RESEND_API_KEY, so this
 * runs behaviour (a): the auth user IS created, the email is NOT sent, and the
 * admin is handed the temporary password. Runs as admin (default storage state).
 *
 * SYNTHETIC DATA ONLY: a unique @osteojp.test address per run.
 */
import { test, expect } from "@playwright/test";

const GENERIC_ERROR = "A operação falhou. Tente novamente.";

function syntheticEmail(): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-invite-${unique}@osteojp.test`;
}

test("Convidar: invite succeeds via the temp-password hand-off, never the generic error (W7-01)", async ({
  page,
}) => {
  await page.goto("/admin/staff");

  // Every staff ROW also carries an edit form with a fullName input, so scope to
  // the invite panel by its unique submit button (rows submit with "Guardar").
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Convidar", exact: true }) });
  await form.locator('input[name="fullName"]').fill("E2E Convidado W7-01");
  await form.locator('input[name="email"]').fill(syntheticEmail());
  await form.locator('select[name="role"]').selectOption({ value: "reception" });
  await form.getByRole("button", { name: "Convidar" }).click();

  // The invite SUCCEEDS: success panel, not an error.
  const status = form.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status).toContainText("Membro convidado.");

  // It states plainly that the email was not sent...
  await expect(status).toContainText("O email de convite não foi enviado.");

  // ...and hands over a non-empty temporary password.
  await expect(status).toContainText("Palavra-passe temporária.");
  const tempPassword = status.locator("code");
  await expect(tempPassword).toBeVisible();
  expect((await tempPassword.innerText()).trim().length).toBeGreaterThan(0);

  // The regression string never appears, and the form raises no error at all.
  // Scoped to the form: `next dev` injects its own role="alert" overlay node.
  await expect(form.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
});

test("Convidar: re-inviting an existing staff email is refused with a specific message (W7-01)", async ({
  page,
}) => {
  await page.goto("/admin/staff");

  // The seeded admin already exists in this tenant → the idempotency pre-check
  // rejects it BEFORE any privileged auth call, with its own clear message.
  // Every staff ROW also carries an edit form with a fullName input, so scope to
  // the invite panel by its unique submit button (rows submit with "Guardar").
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Convidar", exact: true }) });
  await form.locator('input[name="fullName"]').fill("E2E Duplicado");
  await form.locator('input[name="email"]').fill("e2e-admin@osteojp.test");
  await form.locator('select[name="role"]').selectOption({ value: "reception" });
  await form.getByRole("button", { name: "Convidar" }).click();

  const alert = form.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Já existe um membro da equipa com esse email.");
  // Specific, never the opaque mask.
  await expect(alert).not.toContainText(GENERIC_ERROR);
});
