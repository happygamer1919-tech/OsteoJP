/**
 * agenda-signout.spec.ts - SKEW-01: "Terminar sessão" WITH JavaScript, all the
 * way to the server and back.
 *
 * SKEW-01 moved the logout out of the server component AppShell into
 * components/logout-form.client.tsx: `onSubmit` prevents the default and calls
 * the action through runAction, and Next's router performs the action's
 * redirect to /login. That form is on every staff page (13 layouts), and until
 * this spec the successful path was proven only by reading source: React skips
 * its own form-action dispatch when the submit was default-prevented, and
 * Next's reducer navigates before it rejects with `handled = true`.
 * agenda-action-skew.spec.ts proves the skew arm and the no-JavaScript arm, and
 * deliberately never lets its logout reach the server.
 *
 * WHAT IT PROVES, on /agenda:
 *   1. pressing "Terminar sessão" sends ONE server-action POST (a fetch, not a
 *      document POST: the form's own submit was prevented), and the server
 *      answers it with the redirect to /login (`x-action-redirect`,
 *      next/dist/server/app-render/action-handler.js:234);
 *   2. the page lands on /login;
 *   3. the session is really gone: /agenda now sends the browser to /login;
 *   4. nothing escaped and nothing was shown as a failure: no page error, no
 *      unhandled rejection, and no "Sem ligação", generic error or "Nova versão"
 *      toast. A redirect is Next's control flow, not a failure
 *      (classify-action-error.ts).
 *
 * WHO IT SIGNS OUT. logout() calls supabase.auth.signOut() with its default
 * GLOBAL scope, which ends every session of the user. So this spec logs in, in
 * a fresh context, as a user that exists only to be signed out, one per browser
 * project (fixtures.ts signOutUser, seed-e2e.mjs receptionSignOut*). The stored
 * admin, therapist and reception sessions the rest of the suite uses are never
 * touched.
 *
 * Nothing is saved, so this spec derives no RUN_DAY_BASE day
 * (scripts/e2e-spec-days-do-not-collide).
 */
import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD, signOutUser } from "./fixtures";

const REJECTIONS_KEY = "__skew01_signout_rejections";
const TOASTS_KEY = "__skew01_signout_toasts";
/** The three sentences the wrapper shows on a failure (packages/i18n strings.pt.json). */
const FAILURE_TEXTS = [
  "Sem ligação ao servidor",
  "Ocorreu um erro",
  "Nova versão disponível",
];

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Records, across the client navigation to /login, every unhandled rejection
 * and the text of every status or alert element that appeared. Kept in
 * sessionStorage, which the same tab keeps across a same-origin navigation,
 * because a toast raised just before the redirect would be gone by the time an
 * assertion could look for it.
 */
async function instrument(page: Page) {
  await page.addInitScript(
    ([rejectionsKey, toastsKey]) => {
      if (window.top !== window) return;
      const push = (key: string, value: string) => {
        const list = JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[];
        list.push(value);
        window.sessionStorage.setItem(key, JSON.stringify(list));
      };
      window.addEventListener("unhandledrejection", (event) => push(rejectionsKey, String(event.reason)));
      const seen = new WeakSet<Element>();
      const scan = (root: Element) => {
        const found = root.matches('[role="status"], [role="alert"]')
          ? [root]
          : Array.from(root.querySelectorAll('[role="status"], [role="alert"]'));
        for (const el of found) {
          if (seen.has(el)) continue;
          seen.add(el);
          push(toastsKey, el.textContent ?? "");
        }
      };
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof Element) scan(node);
          }
        }
      }).observe(document, { childList: true, subtree: true });
    },
    [REJECTIONS_KEY, TOASTS_KEY] as const,
  );
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const read = (key: string) =>
    page.evaluate((k) => JSON.parse(window.sessionStorage.getItem(k) ?? "[]") as string[], key);
  return {
    pageErrors,
    rejections: () => read(REJECTIONS_KEY),
    statusTexts: () => read(TOASTS_KEY),
  };
}

/** The visible "Terminar sessão" (the shell renders the user area twice, one of them hidden). */
const signOutButton = (page: Page) =>
  page.getByRole("button", { name: "Terminar sessão", exact: true }).filter({ visible: true }).first();

test("'Terminar sessão' with JavaScript: one action POST, Next's redirect to /login, and the session is gone", async ({
  page,
}, testInfo) => {
  const email = signOutUser(testInfo.project.name);
  const probe = await instrument(page);

  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Iniciar sessão/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto("/agenda");
  await expect(signOutButton(page)).toBeVisible({ timeout: 30_000 });

  // Every POST from the click on: a document POST would mean the form's own
  // submit was not prevented; an action POST is the wrapper's call.
  const posts: Array<{ navigation: boolean; action: boolean }> = [];
  const redirects: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    posts.push({ navigation: request.isNavigationRequest(), action: Boolean(request.headers()["next-action"]) });
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return;
    const redirect = response.headers()["x-action-redirect"];
    if (redirect) redirects.push(redirect);
  });

  await signOutButton(page).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Iniciar sessão/i })).toBeVisible({ timeout: 30_000 });

  expect(posts.filter((p) => p.navigation), "the form posted as a document: onSubmit did not take over").toEqual([]);
  expect(posts.filter((p) => p.action), "server-action POSTs sent by the click").toHaveLength(1);
  expect(redirects, "the logout action's answer").toHaveLength(1);
  expect(redirects[0]).toMatch(/^\/login(;|$)/);

  const shown = await probe.statusTexts();
  for (const text of FAILURE_TEXTS) {
    expect(
      shown.filter((t) => t.includes(text)),
      `a failure toast ("${text}") was shown for a successful logout`,
    ).toEqual([]);
  }
  expect(probe.pageErrors, "an uncaught error reached the page").toEqual([]);
  expect(await probe.rejections(), "an unhandled promise rejection escaped").toEqual([]);

  // Signed out for real: the staff platform sends the browser back to /login.
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
});
