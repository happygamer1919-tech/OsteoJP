/**
 * timing-panel-audience.spec.ts - WHO RECEIVES THE TIMING BREAKDOWN, IN BYTES.
 *
 * ==========================================================================
 * WHY THIS IS NOT IN THE `perf` PROJECT WITH THE REST OF THE MEASUREMENT
 * ==========================================================================
 * `perf-admin-stats.spec.ts` needs a database seeded to production scale - 8,413
 * patients - so it lives on a project CI never names. THIS file needs no such
 * thing: it asserts an AUTHORISATION property, and the e2e fixture's three
 * patients prove it exactly as well as eight thousand would. So it runs on
 * `chromium`, which is the project `.github/workflows/e2e.yml` invokes, on every
 * PR.
 *
 * That split is deliberate. The measurement is expensive and answers a question
 * asked once; the audience rule is cheap and must hold on every commit
 * thereafter. Putting this file beside the other one would have made the only
 * proof of the rule live in a project nothing runs.
 *
 * ==========================================================================
 * WHAT "RECEIVES NO PANEL" MEANS HERE, AND WHY THE DOM IS NOT ENOUGH
 * ==========================================================================
 * A hidden panel and an absent panel look identical on screen and are not the
 * same fact. `display: none`, `hidden`, an early `return null` inside the client
 * component - every one of those still SENDS the numbers to the browser, where
 * anybody can read them out of the RSC payload with no tooling. That is the
 * difference between hiding a control and not granting it, which this repository
 * has already paid for once at INC-CONFIRM-10.
 *
 * So the assertion is made against the RESPONSE BODY of the navigation itself -
 * the literal bytes the principal was served, HTML and inline RSC flight payload
 * together - and not against what the DOM ended up showing. The DOM is checked
 * too, second, as the weaker of the two.
 *
 * ==========================================================================
 * THE POSITIVE CONTROL IS NOT A COURTESY. WITHOUT IT THIS FILE PASSES EMPTY.
 * ==========================================================================
 * "These strings are absent" is trivially true of a login page, a 500, a
 * redirect, or a renamed span label. Every marker asserted ABSENT for reception
 * is asserted PRESENT for admin first, from the same route on the same run, so a
 * marker that stopped meaning anything fails the control instead of silently
 * passing the arm. PORTAL-REHYDRATE 1.3, criterion F: a guard proves a test ran;
 * only the assertion proves it tested the right subject.
 */

import { test, expect, type Page } from "@playwright/test";
import { STORAGE } from "./fixtures";

/**
 * STRINGS THAT MUST APPEAR IN AN ADMIN'S PAYLOAD AND MUST NOT APPEAR IN A
 * RECEPTIONIST'S.
 *
 * ASCII ONLY, ON PURPOSE. The panel's accessible name is "Medição de
 * desempenho", and a flight payload may carry that as raw UTF-8 or as escaped
 * \\u00e7 depending on how the serialiser felt about it. Matching on the ASCII
 * tail "de desempenho" is true of both encodings, so the negative arm cannot
 * pass merely because the accented form was spelled differently.
 *
 * THE THREE `db:` LABELS ARE THE ONES /patients EMITS ON EVERY LOAD. The
 * stat-strip MISS mark is deliberately NOT here: it appears only on a cache
 * miss, so requiring it in the positive control would make this file fail on a
 * warm cache for a reason that has nothing to do with who may read what.
 */
const PANEL_MARKERS = [
  "de desempenho",
  "db:patients-list",
  "db:patients-filter-locations",
  "stat-strip:read",
] as const;

/** Every byte the navigation actually delivered, HTML and inline RSC alike. */
async function payloadOf(page: Page, url: string): Promise<string> {
  const response = await page.goto(url);
  if (!response) throw new Error(`no navigation response for ${url}`);
  const status = response.status();
  if (status !== 200) {
    throw new Error(`${url} answered ${status}, so the payload below describes an error page`);
  }
  return response.text();
}

test.describe("the timing panel is granted, not hidden", () => {
  test.describe("as ADMIN - the positive control", () => {
    // The project default is admin; stated rather than assumed, because this
    // file's whole meaning depends on which principal fetched which bytes.
    test.use({ storageState: STORAGE.admin });

    test("every marker the negative arm looks for is present in an admin's payload", async ({
      page,
    }) => {
      const payload = await payloadOf(page, "/patients");

      for (const marker of PANEL_MARKERS) {
        expect(
          payload,
          `"${marker}" is absent from an ADMIN's /patients payload. The negative arm below ` +
            "asserts the ABSENCE of this same string, so with the control failing that arm " +
            "would pass while proving nothing. Either the panel stopped rendering for an " +
            "admin, or this label was renamed and this list was not.",
        ).toContain(marker);
      }

      // And it is a real, reachable panel rather than four strings in a script.
      await expect(page.getByRole("region", { name: "Medição de desempenho" })).toHaveCount(1);
    });
  });

  test.describe("as RECEPTION - the negative arm", () => {
    test.use({ storageState: STORAGE.reception });

    test("a receptionist's /patients payload contains no panel and no span, at all", async ({
      page,
    }) => {
      const payload = await payloadOf(page, "/patients");

      // THE PREMISE, BEFORE ANY ABSENCE IS BELIEVED. A redirect to /login, or a
      // 403 body, contains none of the markers either - and would make every
      // assertion below pass for the wrong reason. So: this really is the
      // patients list, really rendered, really for this principal.
      await expect(
        page.getByRole("heading", { name: "Pacientes", exact: true }),
        "reception did not land on the patients list, so 'no panel here' says nothing",
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/patients");

      for (const marker of PANEL_MARKERS) {
        expect(
          payload,
          `a RECEPTION principal was served "${marker}". The panel element must never be ` +
            "created for them, so the spans are never serialised - if this fires, the numbers " +
            "are in the browser and a hidden element is not a withheld one.",
        ).not.toContain(marker);
      }

      // The weaker check, kept because it is the one a person can reproduce by
      // looking: no panel in the rendered document either.
      await expect(page.getByRole("region", { name: "Medição de desempenho" })).toHaveCount(0);
    });

    test("no store is opened for them: the payload carries no db: span of any name", async ({
      page,
    }) => {
      // BROADER THAN THE NAMED LIST ON PURPOSE. The test above pins four labels
      // that exist today; this one fires on a span nobody has written yet. A
      // future query labelled `db:something-new` would be invisible to a
      // hard-coded list and is caught here on the day it is added.
      const payload = await payloadOf(page, "/patients");
      const leaked = [...payload.matchAll(/db:[a-z0-9-]+/gi)].map((m) => m[0]);
      expect(
        [...new Set(leaked)],
        "span labels reached a receptionist's payload - collectFor was given an audience it " +
          "should not have, or a panel element was created outside the measured arm",
      ).toEqual([]);
    });
  });
});
