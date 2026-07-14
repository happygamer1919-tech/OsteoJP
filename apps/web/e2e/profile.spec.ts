/**
 * profile.spec.ts - W6-02 (b): the self-service profile page (/perfil) is
 * reachable by EVERY role for their OWN account. Runs as THERAPIST (a non-admin)
 * to prove it is not gated behind users:manage.
 *
 * The name change is exercised end-to-end as a round-trip (change then restore)
 * so the shared therapist fixture ends unchanged. The password change is proven
 * at the unit level (app/perfil/actions.test.tsx: Supabase updateUser on the
 * actor's own session + audit); here we exercise the password form's client-side
 * precheck without mutating auth state.
 */
import { test, expect } from "@playwright/test";
import { STORAGE } from "./fixtures";

test.use({ storageState: STORAGE.therapist });

test("a therapist opens their own profile, edits their name (round-trip), and sees the password form validate", async ({
  page,
}) => {
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Perfil", exact: true })).toBeVisible();

  const nameField = page.getByLabel("Nome", { exact: true });
  await expect(nameField).toBeVisible();
  const original = await nameField.inputValue();

  // Email is the sign-in identifier: shown, read-only.
  const emailField = page.getByLabel("Email", { exact: true });
  await expect(emailField).toBeDisabled();

  // Change the name and persist.
  await nameField.fill("Perfil Teste W6-02");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Nome atualizado.")).toBeVisible();

  // Reload: the new name persisted (server-scoped write to the actor's own row).
  await page.reload();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Perfil Teste W6-02");

  // Restore the original name so the shared fixture is left unchanged.
  await page.getByLabel("Nome", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Nome atualizado.")).toBeVisible();

  // Password form: the shared strength precheck rejects a weak password client-side
  // (no submission, no auth change).
  await page.getByLabel("Nova palavra-passe", { exact: true }).fill("short");
  await page.getByLabel("Confirmar palavra-passe", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Alterar palavra-passe", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
