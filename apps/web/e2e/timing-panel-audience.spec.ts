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
 * redirect, or a renamed span label. Every named marker asserted ABSENT for
 * reception is asserted PRESENT for admin first, from the same route on the same
 * run, so a marker that stopped meaning anything fails the control instead of
 * silently passing the arm. The broad `db:` search has its own control in the
 * same admin test: the helper that finds nothing for reception must find the two
 * /patients labels for admin, through the decoded flight payload.
 * PORTAL-REHYDRATE 1.3, criterion F: a guard proves a test ran; only the
 * assertion proves it tested the right subject.
 */

import { test, expect, type Page } from "@playwright/test";
import { STORAGE } from "./fixtures";
import { scanSpanLabels, splitPayload } from "./helpers/flight-span-labels";

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
      const payload = await payloadOf(page, "/patients?medicao=1");

      for (const marker of PANEL_MARKERS) {
        expect(
          payload,
          `"${marker}" is absent from an ADMIN's /patients?medicao=1 payload. The negative arm below ` +
            "asserts the ABSENCE of this same string, so with the control failing that arm " +
            "would pass while proving nothing. Either the panel stopped rendering for an " +
            "admin, or this label was renamed and this list was not.",
        ).toContain(marker);
      }

      // THE BROAD SEARCH'S CONTROL. The reception arm's `db:` scan passes on an
      // empty result, and a scanner that matches nothing returns exactly that. So
      // the same scanner, on an admin's measured payload, must find the labels
      // /patients emits, and find them in the DECODED FLIGHT TEXT, which proves
      // the push() chunks were found and parsed rather than skipped.
      const scan = scanSpanLabels(payload);
      expect(
        scan.flightChunks,
        "no self.__next_f.push chunk was decoded from an ADMIN's payload: the scanner has " +
          "fallen back to raw bytes, so Next changed how it writes the flight payload",
      ).toBeGreaterThan(0);
      for (const label of ["db:patients-list", "db:patients-filter-locations"]) {
        expect(
          scan.flightLabels,
          `the span scanner did not find "${label}" in an ADMIN's decoded flight payload. ` +
            "The reception arm's empty result means nothing until this passes.",
        ).toContain(label);
      }

      // And it is a real, reachable panel rather than four strings in a script.
      await expect(page.getByRole("region", { name: "Medição de desempenho" })).toHaveCount(1);
    });

    // ON REQUEST, NEVER BY DEFAULT (owner ruling, 2026-09-19). The same admin,
    // the same page, without the parameter: no panel, and no span in the payload,
    // because `collectFor` was given `false` and opened no store. The arm above is
    // its positive control: those markers DO appear once the admin asks.
    test("an admin who did NOT ask gets no panel and no span", async ({ page }) => {
      const payload = await payloadOf(page, "/patients");
      await expect(page.getByRole("heading", { name: "Pacientes", exact: true })).toBeVisible();
      const { flight } = splitPayload(payload);
      for (const marker of PANEL_MARKERS) {
        expect(payload, `"${marker}" reached an admin who did not ask for the panel`).not.toContain(
          marker,
        );
        expect(
          flight,
          `"${marker}" reached an admin who did not ask, split across flight chunks`,
        ).not.toContain(marker);
      }
      await expect(page.getByRole("region", { name: "Medição de desempenho" })).toHaveCount(0);
    });
  });

  test.describe("as RECEPTION - the negative arm", () => {
    test.use({ storageState: STORAGE.reception });

    // THEY ASK, AND ARE STILL REFUSED. Since 2026-09-19 the panel needs
    // `?medicao=1`, which anybody can type, so both negative arms type it: the
    // parameter asks and grants nothing.
    test("a receptionist's /patients?medicao=1 payload contains no panel and no span, at all", async ({
      page,
    }) => {
      const payload = await payloadOf(page, "/patients?medicao=1");

      // THE PREMISE, BEFORE ANY ABSENCE IS BELIEVED. A redirect to /login, or a
      // 403 body, contains none of the markers either - and would make every
      // assertion below pass for the wrong reason. So: this really is the
      // patients list, really rendered, really for this principal.
      await expect(
        page.getByRole("heading", { name: "Pacientes", exact: true }),
        "reception did not land on the patients list, so 'no panel here' says nothing",
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/patients");

      // Searched twice: the raw bytes, and the decoded flight text, where a
      // marker the serialiser split across two push() chunks is whole again.
      const { flight } = splitPayload(payload);
      for (const marker of PANEL_MARKERS) {
        for (const [where, text] of [
          ["payload", payload],
          ["decoded flight payload", flight],
        ] as const) {
          expect(
            text,
            `a RECEPTION principal was served "${marker}" (${where}). The panel element must ` +
              "never be created for them, so the spans are never serialised - if this fires, the " +
              "numbers are in the browser and a hidden element is not a withheld one.",
          ).not.toContain(marker);
        }
      }

      // The weaker check, kept because it is the one a person can reproduce by
      // looking: no panel in the rendered document either.
      await expect(page.getByRole("region", { name: "Medição de desempenho" })).toHaveCount(0);
    });

    test("no store is opened for them: the payload carries no db: span of any name", async ({
      page,
    }) => {
      // BROADER THAN THE NAMED LIST ON PURPOSE. The test above pins four strings
      // that exist today; this one fires on any `db:` span label, including one
      // added later, as long as it keeps the `db:` prefix. A span named without
      // that prefix (a `mark:` or `stat-strip:` label, say) is not caught here,
      // and the named list above catches only the four strings it names.
      const payload = await payloadOf(page, "/patients?medicao=1");
      // The scanner decodes the inline flight chunks first, then searches the
      // HTML and the decoded text for any `db:` label shape. It drops only a
      // flight row header: a hex row id at a row start, then `db:` and an
      // uppercase row tag ("\n1db:I[..." is row "1db", an import row, the #1701
      // false positive). See helpers/flight-span-labels.ts and its unit test.
      const leaked = scanSpanLabels(payload).labels;
      expect(
        [...new Set(leaked)],
        "span labels reached a receptionist's payload - collectFor was given an audience it " +
          "should not have, or a panel element was created outside the measured arm",
      ).toEqual([]);
    });
  });
});
