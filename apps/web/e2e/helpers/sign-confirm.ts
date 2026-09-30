/**
 * SIGN-CONFIRM-AND-SAVE-FIRST: "Assinar e bloquear" and "Finalizar (assinar e
 * bloquear)" no longer sign on one press. Each opens a confirmation dialog
 * (titled with the button's own label) and signs only from its confirm button,
 * saving unsaved edits first. These are the two steps every spec that signs
 * now takes.
 *
 * `exact: true` on every name: "Finalizar (assinar e bloquear)" CONTAINS
 * "assinar e bloquear", so a substring match would take the wrong button on the
 * review screen. The dialog is addressed by its role and title, so its confirm
 * button is never confused with the trigger behind it.
 */
import { expect, type Locator, type Page } from "@playwright/test";

export const SIGN_LABEL = "Assinar e bloquear";
export const FINALIZE_LABEL = "Finalizar (assinar e bloquear)";

/** The confirmation dialog a sign or finalize press opens. */
export function signDialog(page: Page, label: string = SIGN_LABEL): Locator {
  return page.getByRole("dialog", { name: label, exact: true });
}

/**
 * The sign (or finalize) button on the page. Only while the dialog is CLOSED:
 * an open dialog carries a confirm button with the same name, and a dialog
 * that was just cancelled stays open through its 200ms exit animation, so wait
 * for `signDialog(...)` to be hidden before pressing this again.
 */
export function signButton(page: Page, label: string = SIGN_LABEL): Locator {
  return page.getByRole("button", { name: label, exact: true });
}

/** Press the sign (or finalize) button, then confirm in the dialog it opens. */
export async function signAndConfirm(page: Page, label: string = SIGN_LABEL): Promise<void> {
  await signButton(page, label).click();
  const dialog = signDialog(page, label);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label, exact: true }).click();
}
