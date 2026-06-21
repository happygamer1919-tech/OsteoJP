/**
 * quick-notes.spec.ts — Notas rápidas (dashboard scratchpad)
 *
 * Feature: a per-user, per-tenant scratchpad persisted to the quick_notes
 * table via saveQuickNotes() server action. RLS: each staff user sees and
 * writes ONLY their own row — another user's notes are never visible.
 *
 * Table: quick_notes (tenant_id, staff_user_id) — UNIQUE, one row per user.
 * All specs use chromium only (listed in testIgnore for firefox + webkit).
 */

import { test, expect } from "@playwright/test";
import { STORAGE } from "./fixtures";

// ---------------------------------------------------------------------------
// Admin — create, save, and reload
// ---------------------------------------------------------------------------

test.describe("quick notes — admin", () => {
  // Default storageState is admin (from playwright.config.ts).

  test("saves a note and it persists after reload", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });

    const textarea = page.getByRole("textbox", { name: /Notas rápidas/i });
    await expect(textarea).toBeVisible();

    // Clear any previous content, then type a unique note.
    await textarea.clear();
    const note = `Admin note ${Date.now()}`;
    await textarea.pressSequentially(note);

    await page.getByRole("button", { name: /Guardar/i }).click();

    // Server action revalidates /dashboard; wait for the button to leave loading state.
    await expect(page.getByRole("button", { name: /Guardar/i })).toBeEnabled({
      timeout: 8_000,
    });

    // Hard reload to confirm the note round-tripped through the DB.
    await page.goto("/dashboard");
    await expect(page.getByRole("textbox", { name: /Notas rápidas/i })).toHaveValue(note, {
      timeout: 8_000,
    });
  });
});

// ---------------------------------------------------------------------------
// RLS isolation — therapist sees their own row, never admin's content
// ---------------------------------------------------------------------------

test.describe("quick notes — RLS self-scope", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist note widget is empty (does not show admin's note)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });

    const textarea = page.getByRole("textbox", { name: /Notas rápidas/i });
    await expect(textarea).toBeVisible();

    // The therapist's own quick_notes row is empty (no note saved yet for
    // this user in the e2e seed). Admin's note must NOT leak here.
    await expect(textarea).toHaveValue("");
  });

  test("therapist can save and reload their own note independently", async ({ page }) => {
    await page.goto("/dashboard");

    const textarea = page.getByRole("textbox", { name: /Notas rápidas/i });
    await textarea.clear();
    const note = `Therapist note ${Date.now()}`;
    await textarea.pressSequentially(note);

    await page.getByRole("button", { name: /Guardar/i }).click();
    await expect(page.getByRole("button", { name: /Guardar/i })).toBeEnabled({
      timeout: 8_000,
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("textbox", { name: /Notas rápidas/i })).toHaveValue(note, {
      timeout: 8_000,
    });
  });
});
