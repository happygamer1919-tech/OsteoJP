/**
 * recuperacao-note-roundtrip.spec.ts — INC-NOTES-PREVIEW.
 *
 * ==========================================================================
 * THE QUESTION THIS FILE EXISTS TO ANSWER, AND WHY IT NEEDED A NEW FILE
 * ==========================================================================
 * The owner opened /recuperacao on production and saw NO note line on ANY row.
 * The design is that absence draws nothing, so **a broken read and a correct
 * empty state are the same screen**. Nothing already written can tell them
 * apart:
 *
 *   `note-previews.spec.ts` asserts a SEEDED note renders. It proves the READ
 *   and the RENDER, and says nothing about whether a note WRITTEN THROUGH THE
 *   PRODUCT lands where that read looks.
 *
 * So this walks the whole round trip in one run, with no seeded note anywhere
 * in it: find a patient ON THE LIST, write a note the way reception does,
 * come back, and read the row.
 *
 * ==========================================================================
 * IT RUNS AS RECEPTION, WHICH IS A DIFFERENT PRINCIPAL FROM EVERY OTHER
 * ASSERTION ON THIS FEATURE
 * ==========================================================================
 * `note-previews.spec.ts` runs as the default project's ADMIN. Reception is who
 * actually writes these notes and works this list, and running as them adds the
 * one thing an admin run cannot: that `followup:read` + `patients:write` are
 * enough, with no admin-only capability quietly carrying it.
 *
 * ==========================================================================
 * BOTH ARMS, ON ONE SCREEN, IN ONE RUN
 * ==========================================================================
 * The positive (a patient who now has a note shows it) and the negative (a
 * patient who has none shows NOTHING) are asserted against the SAME rendered
 * page. That is the pair that distinguishes "the read is broken" from "there
 * were no notes" - which is the exact confusion the owner's screen produced.
 */
import { test, expect } from "@playwright/test";

/** Seeded onto the recuperação list by `ensureRecuperacaoFixtures`. */
const ON_THE_LIST = "E2E Recuperar Outro Terapeuta";
/** Also on the list, and deliberately left without a note by the seed. */
const NO_NOTE = "E2E Recuperar Fixo";

test.describe("INC-NOTES-PREVIEW — a note written through the product reaches the row", () => {
  test.use({ storageState: "e2e/.auth/reception.json" });

  test("write it on the profile, come back, and the row carries it", async ({ page }, testInfo) => {
    /* ---- 1. THE PREMISE: this patient is on the list AND has no note yet ---- */
    await page.goto("/recuperacao");
    const before = page.locator("li").filter({ hasText: ON_THE_LIST }).first();
    await expect(before).toBeVisible({ timeout: 15_000 });
    // If this patient already had a note the test would pass without proving
    // anything about the write, so the starting state is asserted rather than
    // assumed - the vacuous shape this whole feature keeps being checked for.
    await expect(before.getByTestId("followup-note-preview")).toHaveCount(0);
    await expect(before.getByTestId("followup-notes-button")).toHaveCount(0);

    /* ---- 2. WRITE IT THE WAY RECEPTION DOES ---- */
    // Through the row's own "Abrir ficha" link, so the path is the one a
    // receptionist actually takes rather than a URL a test knows.
    await before.getByRole("link", { name: "Abrir ficha" }).click();
    await page.waitForURL(/\/patients\//, { timeout: 15_000 });
    await page.goto(`${new URL(page.url()).pathname}?tab=notas`);

    const NOTE = `Ligou a cancelar, telefona ele proprio. run-${testInfo.retry}`;
    await page.locator("textarea").first().fill(NOTE);
    await page.getByRole("button", { name: "Adicionar nota" }).click();
    // The note in the LIST, not the composer's textarea, which still holds the
    // typed text until the action resolves. Scoped, because unscoped it is a
    // strict-mode violation and a race.
    await expect(page.getByRole("list").getByText(NOTE)).toBeVisible({ timeout: 15_000 });

    /* ---- 3. COME BACK AND READ THE ROW ---- */
    await page.goto("/recuperacao");
    const after = page.locator("li").filter({ hasText: ON_THE_LIST }).first();
    await expect(after.getByTestId("followup-note-preview")).toBeVisible({ timeout: 15_000 });
    await expect(after).toContainText("Ligou a cancelar, telefona ele proprio");
    await expect(after).toContainText("Última nota do paciente");
    await expect(after.getByTestId("followup-notes-button")).toBeVisible();

    /* ---- 4. THE NEGATIVE ARM, ON THE SAME SCREEN ---- */
    // This is what tells "the read is broken" apart from "nobody had a note":
    // one row on this page shows a note and another shows nothing, and both are
    // correct. A broken read would show neither.
    const none = page.locator("li").filter({ hasText: NO_NOTE }).first();
    await expect(none).toBeVisible();
    await expect(none.getByTestId("followup-note-preview")).toHaveCount(0);
    await expect(none.getByTestId("followup-notes-button")).toHaveCount(0);
    await expect(none.getByText("Última consulta")).toBeVisible();

    /* ---- 5. A PICTURE, because the owner reviews screens and not logs ---- */
    await testInfo.attach("recuperacao-with-and-without-a-note.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
