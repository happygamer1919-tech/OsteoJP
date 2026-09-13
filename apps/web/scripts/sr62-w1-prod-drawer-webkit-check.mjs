#!/usr/bin/env node
// SR-62 W1 - THE LOGGED-IN WEBKIT PASS ON PRODUCTION for the Safari calendar fix
// (#1277), on both drawer paths the clinic filmed: Nova marcacao and Marcar
// novamente. It prints PASS / FAIL lines only: no names, no screenshots, nothing
// saved to disk.
//
// READ ONLY, AND NOT ONLY BY INTENT. It presses exactly these buttons, each by
// its EXACT name: "Nova marcação", "Abrir calendário", "Mês seguinte", a day
// cell, the drawer title, "Marcar novamente", "Cancelar", "Descartar", "Fechar".
// It never presses Guardar, Marcar or anything carrying "mesmo assim". A regex
// name would have been a loaded gun: /Cancelar/ also matches "Cancelar marcação".
// Behind that, a request guard aborts any server-action POST whose body carries a
// booking-write signature and turns the run red if one was ever attempted.
//
// WHY IT NEEDS A PERSON. The pass needs a staff session, and a production
// credential never enters an executor terminal (standing rule 3). The script
// opens a real WebKit window at the login page and waits; you log in by hand;
// it drives the rest. The session lives only in that window's memory.
//
// RUN IT BY REF (SR-61), from the clone whose apps/web has node_modules, so the
// file you run is the one on origin/main and not whatever that checkout holds:
//
//   cd ~/osteojp/apps/web && git fetch -q origin && \
//   git show origin/main:apps/web/scripts/sr62-w1-prod-drawer-webkit-check.mjs \
//     | node --input-type=module
//
// WebKit for Playwright must be installed once:
//   pnpm --filter web exec playwright install webkit
//
// Exit codes: 0 every check passed; 1 a check failed; 2 refused configuration;
// 3 nobody logged in within the wait.
//
// LANE REHEARSAL ONLY (refused against production):
//   OSTEOJP_CHECK_BASE=http://localhost:3020      a local dev server
//   OSTEOJP_CHECK_STORAGE=<storage state json>    skip the manual login
//   OSTEOJP_CHECK_HEADLESS=1                      no window
//   OSTEOJP_CHECK_PROVE_GUARD=1                   press Marcar once, expect the guard to stop it
import { expect, webkit } from "@playwright/test";

const PRODUCTION = "https://app.osteojp.pt";
const BASE = (process.env.OSTEOJP_CHECK_BASE ?? PRODUCTION).replace(/\/+$/, "");
const IS_PRODUCTION = BASE === PRODUCTION;
const STORAGE = process.env.OSTEOJP_CHECK_STORAGE;
const HEADLESS = process.env.OSTEOJP_CHECK_HEADLESS === "1";
const PROVE_GUARD = process.env.OSTEOJP_CHECK_PROVE_GUARD === "1";
const LOGIN_WAIT_MS = Number(process.env.OSTEOJP_CHECK_LOGIN_MINUTES ?? 15) * 60_000;

if (IS_PRODUCTION && (STORAGE || HEADLESS || PROVE_GUARD)) {
  console.error(
    "REFUSED: OSTEOJP_CHECK_STORAGE, OSTEOJP_CHECK_HEADLESS and OSTEOJP_CHECK_PROVE_GUARD are lane-rehearsal settings. Against production a person logs in, in a visible window, and nothing is ever pressed that saves.",
  );
  process.exit(2);
}

/**
 * A booking write, as its server-action body looks on the wire:
 *   createAppointment / reschedules  [{..."allowConflict":false}]
 *   cloneAppointment (Marcar)         ["<uuid>","<iso instant>",false]
 *   cancelAppointment                 [..., {"scope":"one"}]
 *   hard delete                       [..., "password"]
 */
const WRITE_SIGNATURE =
  /"allowConflict"|^\[\s*"[0-9a-f-]{36}"\s*,\s*"\d{4}-\d{2}-\d{2}T[\d:.]+Z"\s*,\s*(?:true|false)|"scope"\s*:|"password"/;

const results = [];
let stoppedWrites = 0;

function record(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/** The first line of an error only: Playwright's later lines can quote page text. */
function firstLine(e) {
  return String(e?.message ?? e).split("\n")[0].slice(0, 140);
}

/** Runs one check; a failure is recorded and stops the rest of its path. */
async function check(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch (e) {
    record(name, false, firstLine(e));
    throw new PathStopped();
  }
}

class PathStopped extends Error {}

const browser = await webkit.launch({ headless: HEADLESS });
const context = await browser.newContext({
  locale: "pt-PT",
  timezoneId: "Europe/Lisbon",
  viewport: { width: 1440, height: 900 },
  ...(STORAGE ? { storageState: STORAGE } : {}),
});

await context.route("**/*", async (route) => {
  const req = route.request();
  if (req.method() === "POST" && req.headers()["next-action"] && WRITE_SIGNATURE.test(req.postData() ?? "")) {
    stoppedWrites += 1;
    return route.abort("blockedbyclient");
  }
  return route.continue();
});

const page = await context.newPage();

console.log(`WebKit ${browser.version()}  ${BASE}${IS_PRODUCTION ? "  (production)" : "  (rehearsal)"}`);

if (!STORAGE) {
  await page.goto(`${BASE}/login`);
  console.log(`Log in in the WebKit window. Waiting up to ${LOGIN_WAIT_MS / 60_000} minutes...`);
  try {
    await page.waitForURL((u) => /^\/(dashboard|agenda|patients)/.test(u.pathname), { timeout: LOGIN_WAIT_MS });
  } catch {
    console.log("NOT RUN  nobody logged in within the wait. No check was made.");
    await browser.close();
    process.exit(3);
  }
}

/** The popover is role=dialog named by the field's label; the drawer is a dialog too. */
const calendarIn = (drawer) => drawer.getByRole("dialog", { name: "Data", exact: true });
const toggleIn = (drawer) => drawer.getByRole("button", { name: "Abrir calendário", exact: true }).first();
const dateFieldIn = (drawer) => drawer.getByPlaceholder("dd/mm/aaaa").first();

async function driveCalendar(drawer, label) {
  const calendar = calendarIn(drawer);
  const header = calendar.locator('[aria-live="polite"]');
  let monthBefore = "";

  await check(`${label}: the calendar opens`, async () => {
    await toggleIn(drawer).click();
    await expect(calendar).toBeVisible();
    monthBefore = (await header.textContent()) ?? "";
    expect(monthBefore, "the month header is empty").not.toBe("");
  });
  await check(`${label}: it stays open after Mes seguinte, and the month moves`, async () => {
    await calendar.getByRole("button", { name: "Mês seguinte", exact: true }).click();
    await expect(calendar).toBeVisible();
    await expect(header).not.toHaveText(monthBefore);
  });
  await check(`${label}: pressing day 15 picks it and closes the calendar`, async () => {
    await calendar.getByRole("gridcell").filter({ hasText: /^15$/ }).click();
    await expect(calendar).toBeHidden();
    await expect(dateFieldIn(drawer)).toHaveValue(/^15\/\d{2}\/\d{4}$/);
  });
  await check(`${label}: a press outside the calendar still closes it`, async () => {
    await toggleIn(drawer).click();
    await expect(calendar).toBeVisible();
    await drawer.locator("header h2").first().click();
    await expect(calendar).toBeHidden();
  });
}

/**
 * The drawer's own footer Cancelar (exactly one), then Descartar if the discard
 * confirm opens. Both are found by NAME, never by text: the discard Dialog is
 * rendered INSIDE the drawer's <dialog>, so a text filter also matches the drawer,
 * and a closed discard Dialog still carries its text inside a drawer that is open.
 */
async function closeWithoutSaving(drawer, label) {
  await check(`${label}: closed without saving`, async () => {
    const cancel = drawer.locator("footer").getByRole("button", { name: "Cancelar", exact: true });
    await expect(cancel).toHaveCount(1);
    await cancel.click();
    const discard = page.getByRole("dialog", { name: "Descartar alterações?", exact: true });
    await expect(async () => {
      if (await discard.isVisible()) {
        await discard.getByRole("button", { name: "Descartar", exact: true }).click();
      }
      await expect(drawer).toBeHidden({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  });
}

async function path(fn) {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof PathStopped)) record("unexpected error", false, firstLine(e));
  }
}

// PATH 1 - Nova marcacao, from today's agenda.
await path(async () => {
  const drawer = page.getByRole("dialog", { name: "Nova marcação", exact: true });
  await check("Nova marcacao: the drawer opens", async () => {
    await page.goto(`${BASE}/agenda`);
    // The toolbar press was lost 2 of 3 times in WebKit on the lane (a hydration
    // mismatch sits on that page), so press until the drawer is open, never after.
    await expect(async () => {
      if (!(await drawer.isVisible())) {
        await page.getByRole("button", { name: "Nova marcação", exact: true }).click({ timeout: 3_000 });
      }
      await expect(drawer).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 45_000 });
  });
  await driveCalendar(drawer, "Nova marcacao");
  await closeWithoutSaving(drawer, "Nova marcacao");
});

// PATH 2 - Marcar novamente, from the first appointment on LAST week's agenda
// (a lane has no last week, so a rehearsal names its own week).
await path(async () => {
  const week = process.env.OSTEOJP_CHECK_WEEK_DATE ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const again = page.getByRole("dialog", { name: "Marcar novamente", exact: true });
  await check("Marcar novamente: the drawer opens from an appointment", async () => {
    await page.goto(`${BASE}/agenda?view=week&date=${week}`);
    const card = page.locator("[data-appointment-id]").first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    const open = page.getByRole("dialog").getByRole("button", { name: "Marcar novamente", exact: true });
    await expect(open).toHaveCount(1, { timeout: 15_000 });
    await open.click();
    await expect(again).toBeVisible();
  });
  await driveCalendar(again, "Marcar novamente");
  if (PROVE_GUARD) {
    await check("guard: a Marcar press is stopped before it reaches the server", async () => {
      const before = stoppedWrites;
      // Marcar stays disabled until a time is set.
      await again.getByLabel("Horas").selectOption("10");
      await again.getByLabel("Minutos").selectOption("0");
      await again.getByRole("button", { name: "Marcar", exact: true }).click();
      await expect.poll(() => stoppedWrites, { timeout: 10_000 }).toBe(before + 1);
    });
  }
  await closeWithoutSaving(again, "Marcar novamente");
  // Closing Marcar novamente can hand back the appointment's own drawer. Close
  // that too, by its exact Cancelar; it was never edited.
  const leftOpen = page.getByRole("dialog");
  if (await leftOpen.count()) await closeWithoutSaving(leftOpen.first(), "the appointment drawer");
});

const expectedStops = PROVE_GUARD ? 1 : 0;
record(
  `no booking write was attempted beyond the proof (${stoppedWrites} stopped)`,
  stoppedWrites === expectedStops,
);

const passed = results.filter(Boolean).length;
const allPass = passed === results.length;
console.log(
  `\n${allPass ? "ALL PASS" : "SOME FAILED"} - ${passed}/${results.length} checks, real WebKit ${browser.version()}, ${BASE}, nothing saved.`,
);
await browser.close();
process.exit(allPass ? 0 : 1);
