/**
 * agenda-action-skew.spec.ts - SKEW-01 S9. Runs as admin.
 *
 * DEPLOYMENT SKEW, REPRODUCED ON THE WIRE. A tab opened before a deploy posts an
 * action id the new deployment does not have. The server answers exactly what
 * this spec answers (next/dist/server/app-render/action-handler.js:331-346):
 * 404, `x-nextjs-action-not-found: 1`, body "Server action not found." Next's
 * client reads that header first and throws UnrecognizedActionError
 * (server-action-reducer.js:76-83). Under `next dev` there is no deployment id,
 * so real skew routing cannot happen locally; answering the POST is the
 * faithful reproduction.
 *
 * WHAT IT PROVES:
 *   1. the "Nova versão disponível, a atualizar..." toast appears, ONCE;
 *   2. the page reloads EXACTLY ONCE, even though every action POST of the
 *      first page life is answered as skewed (a patient search plus the three
 *      reads a therapist pick fires, so several fail within the same moment);
 *   3. nothing escaped: no unhandled rejection, no page error.
 *
 * WHAT IT CANNOT SEE: two `location.reload()` calls from the SAME document
 * produce one navigation, so the document count alone cannot tell a guarded
 * wrapper from an unguarded one. The once-per-page guard shows here as the
 * toast count (the skew toast is raised by the same guarded branch), and
 * `reload` itself is counted by the unit test (run-action-core.test.ts).
 *
 * Every action POST is answered as skewed ONLY while the first document is
 * loaded. The reload is a new document, so its requests pass through untouched
 * and a correct page stays put: a second reload would be the guard failing.
 *
 * TWO MORE ARMS, both through "Terminar sessão", the one server action in the
 * shell and therefore on EVERY staff page:
 *   - on /patients, a page with NO <ToastProvider>, the skew toast still
 *     appears (the toast bridge mounts its own provider, S4) and the page still
 *     reloads exactly once;
 *   - with JavaScript OFF, the logout form is still a plain form: the served
 *     HTML carries the action id and the click is a document POST carrying it.
 * NEITHER LETS THE LOGOUT REACH THE SERVER. logout() calls
 * supabase.auth.signOut() with its default GLOBAL scope, which revokes every
 * session of the user, including the stored admin session every other spec in
 * the run signs in with. The POST is answered here instead; how Next's server
 * handles a form POST carrying `$ACTION_ID_` is Next's own path, unchanged by
 * this PR, and the path the server-component form used before it.
 *
 * Nothing is saved, so this spec derives no RUN_DAY_BASE day
 * (scripts/e2e-spec-days-do-not-collide).
 */
import { expect, test, type Page } from "@playwright/test";

import { futureDate } from "./fixtures";
import { openNewAppointment } from "./helpers";

const REJECTIONS_KEY = "__skew01_unhandled_rejections";
const LOADS_KEY = "__skew01_document_loads";
const SKEW_TOASTS_KEY = "__skew01_skew_toasts_per_document";
const FALLBACK_KEY = "__skew01_skew_toast_in_fallback";
const SKEW_MESSAGE = "Nova versão disponível, a atualizar...";

/**
 * Counts documents, records unhandled rejections, and counts every DISTINCT
 * "Nova versão disponível" toast each document ever rendered, all across the
 * reload.
 *
 * WHY THE TOAST COUNT IS RECORDED IN THE PAGE and not read with
 * `toHaveCount(1)`: that assertion retries until it matches, so it passes the
 * moment exactly one toast is on screen, before a second or third one has
 * rendered. Measured on 2026-09-27 with the once-per-page guard removed from
 * run-action-core.ts: three skew toasts rendered, and the builder's version of
 * this spec caught it only because all three landed in the same frame (a
 * strict-mode violation on the first `toBeVisible`), which is timing, not an
 * assertion. Counting distinct toast elements from the first script on is
 * deterministic. A WeakSet dedupes the region being re-parented into the
 * drawer, which re-inserts the same toast element (packages/ui Toast.tsx).
 */
async function instrument(page: Page) {
  await page.addInitScript(
    ([rejectionsKey, loadsKey, toastsKey, message, fallbackKey]) => {
      if (window.top !== window) return;
      const n = Number(window.sessionStorage.getItem(loadsKey) ?? "0") + 1;
      window.sessionStorage.setItem(loadsKey, String(n));
      window.addEventListener("unhandledrejection", (event) => {
        const list = JSON.parse(window.sessionStorage.getItem(rejectionsKey) ?? "[]") as string[];
        list.push(String(event.reason));
        window.sessionStorage.setItem(rejectionsKey, JSON.stringify(list));
      });
      const seen = new WeakSet<Element>();
      const record = () => {
        const counts = JSON.parse(window.sessionStorage.getItem(toastsKey) ?? "[]") as number[];
        while (counts.length < n) counts.push(0);
        counts[n - 1] += 1;
        window.sessionStorage.setItem(toastsKey, JSON.stringify(counts));
      };
      const scan = (root: Element) => {
        const found = root.matches('[role="status"], [role="alert"]')
          ? [root]
          : Array.from(root.querySelectorAll('[role="status"], [role="alert"]'));
        for (const el of found) {
          if (!seen.has(el) && (el.textContent ?? "").includes(message)) {
            seen.add(el);
            record();
            // Whether the toast bridge had to mount its own provider for it
            // (lib/actions/toast-bridge.tsx): true only on a page with none.
            window.sessionStorage.setItem(
              fallbackKey,
              String(document.querySelector("[data-toast-fallback]") !== null),
            );
          }
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
    [REJECTIONS_KEY, LOADS_KEY, SKEW_TOASTS_KEY, SKEW_MESSAGE, FALLBACK_KEY] as const,
  );
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  return {
    pageErrors,
    loads: () => page.evaluate((key) => Number(window.sessionStorage.getItem(key) ?? "0"), LOADS_KEY),
    rejections: () =>
      page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[], REJECTIONS_KEY),
    skewToastsPerDocument: () =>
      page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as number[], SKEW_TOASTS_KEY),
    skewToastInFallback: () => page.evaluate((key) => window.sessionStorage.getItem(key), FALLBACK_KEY),
  };
}

/** The visible "Terminar sessão" (the shell renders the user area twice, one of them hidden). */
const signOutButton = (page: Page) =>
  page.getByRole("button", { name: "Terminar sessão", exact: true }).filter({ visible: true }).first();

test("skew: an action the server does not recognise shows 'Nova versão disponível' and reloads exactly once", async ({
  page,
}) => {
  const probe = await instrument(page);

  // Main-frame document loads, counted on the Node side for the route below.
  let documents = 0;
  page.on("load", () => {
    documents += 1;
  });

  let answeredAsSkew = 0;
  await page.route(
    (url) => url.pathname === "/agenda",
    async (route) => {
      const request = route.request();
      if (documents <= 1 && request.method() === "POST" && request.headers()["next-action"]) {
        answeredAsSkew += 1;
        await route.fulfill({
          status: 404,
          headers: { "x-nextjs-action-not-found": "1", "content-type": "text/plain" },
          body: "Server action not found.",
        });
        return;
      }
      await route.continue().catch(() => {});
    },
  );

  const dialog = await openNewAppointment(page, futureDate(4));
  expect(await probe.loads()).toBe(1);

  // Several action POSTs in the same moment: the patient search (after its
  // 300 ms debounce) and the three reads a therapist pick fires.
  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill("Versao SKEW");
  await dialog.getByLabel(/Terapeuta/i).selectOption({ index: 1 });

  // `.first()`: HOW MANY toasts rendered is asserted below from the in-page
  // count, which a retrying locator assertion cannot do (see instrument()).
  await expect(page.getByText(SKEW_MESSAGE).first()).toBeVisible({ timeout: 15_000 });

  // The reload: a second document, a navigation of type "reload".
  //
  // 60 s, not 20: this waits for a WHOLE document (proxy.ts auth, the server
  // render, hydration), not for one control. On the blue lane on 2026-09-27,
  // with the Docker VM saturated, that reload's GET took 19.9 s (proxy.ts 13.0 s)
  // and a 20 s budget went red with the reloaded agenda already on screen. The
  // budget only bounds a wait for something that must happen; the "exactly
  // once" arm below is unaffected by it.
  await expect.poll(() => documents, { timeout: 60_000 }).toBe(2);
  await expect.poll(() => probe.loads(), { timeout: 30_000 }).toBe(2);
  expect(
    await page.evaluate(
      () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type,
    ),
  ).toBe("reload");
  expect(answeredAsSkew, "only one action failed, so the guard was never exercised").toBeGreaterThanOrEqual(2);
  // ONE toast in the first document's whole life, however many calls failed.
  expect(await probe.skewToastsPerDocument(), "skew toasts rendered, per document").toEqual([1]);

  // EXACTLY once: give a wrongly-guarded second reload every chance to happen.
  await page.waitForTimeout(5_000);
  expect(documents).toBe(2);
  expect(await probe.loads()).toBe(2);
  await expect(page.getByText(SKEW_MESSAGE)).toHaveCount(0);
  expect(await probe.skewToastsPerDocument(), "the reloaded page showed a skew toast").toEqual([1]);

  expect(probe.pageErrors, "an uncaught error reached the page").toEqual([]);
  expect(await probe.rejections(), "an unhandled promise rejection escaped").toEqual([]);
});

test("skew on a page with NO ToastProvider (/patients): the bridge mounts its own, the toast shows, one reload", async ({
  page,
}) => {
  const probe = await instrument(page);
  let documents = 0;
  page.on("load", () => {
    documents += 1;
  });

  // Every action POST of the first document is answered as skewed, and none
  // reaches the server: the logout below never signs anybody out.
  let answeredAsSkew = 0;
  await page.route(
    (url) => url.pathname === "/patients",
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        if (documents <= 1) {
          answeredAsSkew += 1;
          await route.fulfill({
            status: 404,
            headers: { "x-nextjs-action-not-found": "1", "content-type": "text/plain" },
            body: "Server action not found.",
          });
        } else {
          await route.abort();
        }
        return;
      }
      await route.continue().catch(() => {});
    },
  );

  await page.goto("/patients");
  await expect(signOutButton(page)).toBeVisible({ timeout: 30_000 });
  // The page has no provider of its own: nothing rendered a toast region.
  await expect(page.locator("[data-toast-region]")).toHaveCount(0);

  await signOutButton(page).click();
  await expect(page.getByText(SKEW_MESSAGE).first()).toBeVisible({ timeout: 15_000 });
  expect(await probe.skewToastInFallback(), "the toast was not shown by the bridge's own provider").toBe("true");

  await expect.poll(() => documents, { timeout: 60_000 }).toBe(2);
  await expect.poll(() => probe.loads(), { timeout: 30_000 }).toBe(2);
  expect(answeredAsSkew).toBe(1);
  expect(await probe.skewToastsPerDocument(), "skew toasts rendered, per document").toEqual([1]);

  await page.waitForTimeout(3_000);
  expect(documents).toBe(2);
  // Still signed in, still here: the logout never reached the server.
  await expect(page).toHaveURL(/\/patients/);
  await expect(signOutButton(page)).toBeVisible();

  expect(probe.pageErrors, "an uncaught error reached the page").toEqual([]);
  expect(await probe.rejections(), "an unhandled promise rejection escaped").toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("'Terminar sessão' is still a plain form: a document POST carrying the logout action's id", async ({ page }) => {
    await page.goto("/patients");
    const button = signOutButton(page);
    await expect(button).toBeVisible({ timeout: 30_000 });
    const form = page.locator("form").filter({ has: button });

    // The served markup: a POST form with the action id as a hidden field,
    // which is what a server-rendered <form action={serverAction}> is.
    expect((await form.getAttribute("method"))?.toLowerCase()).toBe("post");
    const idField = form.locator('input[type="hidden"][name^="$ACTION_ID_"]');
    await expect(idField).toHaveCount(1);
    const fieldName = await idField.getAttribute("name");
    expect(fieldName).toMatch(/^\$ACTION_ID_[0-9a-f]{40,}$/);

    let posted: { navigation: boolean; body: string } | null = null;
    await page.route(
      (url) => url.pathname === "/patients",
      async (route) => {
        const request = route.request();
        if (request.method() !== "POST") {
          await route.continue();
          return;
        }
        posted = { navigation: request.isNavigationRequest(), body: request.postData() ?? "" };
        // Answered here, never sent: see the header on signOut()'s GLOBAL scope.
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: "<!doctype html><title>posted</title><p>logout form posted</p>",
        });
      },
    );

    await button.click();
    await expect(page.getByText("logout form posted")).toBeVisible({ timeout: 30_000 });
    expect(posted, "clicking did not submit the form").not.toBeNull();
    const sent = posted as unknown as { navigation: boolean; body: string };
    expect(sent.navigation, "the submit was not a document navigation").toBe(true);
    expect(sent.body).toContain(`name="${fieldName}"`);
  });
});
