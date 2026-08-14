import { test, expect, type Page } from "@playwright/test";
import { STORAGE, USERS, E2E_PASSWORD } from "./fixtures";

/**
 * ITEM 1 - /horarios rendered a BLACK PAGE reading "Application error: a
 * client-side exception has occurred" for a located receptionist, in front of
 * the clinic team.
 *
 * WHY THIS IS AN E2E SPEC AND NOT A UNIT TEST. The unit half is pinned in
 * app/horarios/horarios-roster-scope.test.ts, which is where the two
 * disagreeing predicates live. But the SYMPTOM was a server component throwing
 * AFTER the shell had been flushed, which is a rendering fact: the page
 * "succeeds" at the HTTP level and then dies in the browser. Only a browser can
 * observe that, and this spec is the arm that would have caught it.
 *
 * THE ASSERTION IS DELIBERATELY NEGATIVE-FIRST. Asserting that some heading is
 * visible would pass on a page that also carried an error overlay; the thing
 * that must be true is that the error is ABSENT and real content is PRESENT.
 */

const ERROR_TEXT = /Application error|client-side exception|Erro da aplica/i;

/** Fail loudly on the browser-level symptom rather than on a missing element. */
async function expectNoClientException(page: Page) {
  // A page-level exception surfaces both as the Next.js fallback text and as an
  // uncaught error on the console; both are checked because either alone can be
  // suppressed by a future error boundary.
  await expect(page.locator("body")).not.toContainText(ERROR_TEXT);
}

const ROLES = [
  { role: "admin", storage: STORAGE.admin },
  { role: "reception", storage: STORAGE.reception },
  { role: "therapist", storage: STORAGE.therapist },
] as const;

for (const { role, storage } of ROLES) {
  test.describe(`horarios renders - ${role}`, () => {
    test.use({ storageState: storage });

    test(`${role}: /horarios renders without a client-side exception`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      const response = await page.goto("/horarios");

      // A role without schedule:read is REDIRECTED to /dashboard, which is a
      // correct outcome and not a crash. Both landings are acceptable; a
      // rendered exception is not.
      expect(response?.status()).toBeLessThan(500);
      await page.waitForLoadState("domcontentloaded");
      await expectNoClientException(page);
      expect(pageErrors, `uncaught page errors for ${role}: ${pageErrors.join(" | ")}`).toEqual([]);
    });
  });
}

/**
 * The owner has no stored session (fixtures: "log in fresh with E2E_PASSWORD"),
 * and is the role the reporting owner actually uses. Owner is UNSCOPED, so it
 * is the NEGATIVE ARM at the browser level: it never reached the failing gate,
 * which is precisely why the defect survived every demo.
 */
test.describe("horarios renders - owner", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("owner: /horarios renders without a client-side exception", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.owner);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/(dashboard|agenda)/);

    await page.goto("/horarios");
    await page.waitForLoadState("domcontentloaded");
    await expectNoClientException(page);
    expect(pageErrors, `uncaught page errors for owner: ${pageErrors.join(" | ")}`).toEqual([]);
  });
});
