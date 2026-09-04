import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

/**
 * PERF-timing-admin-stats - THE `perf` PLAYWRIGHT PROJECT MUST KEEP EXISTING.
 *
 * ==========================================================================
 * WHY A PROJECT CI NEVER NAMES NEEDS A GUARD AND NOTHING ELSE DOES
 * ==========================================================================
 * The measurement suite runs against a database seeded to production scale -
 * 8,413 patients and ~24,600 appointments - which is minutes of seeding and a
 * shape no CI shard has. So it is EXCLUDED from per-PR CI on purpose:
 * `.github/workflows/e2e.yml` invokes `--project=chromium` and nothing else.
 *
 * That exclusion is correct and it has a cost, which is the whole reason this
 * file exists: NOTHING GOES RED IF THE PROJECT IS DELETED. Removing it, or
 * renaming the specs out from under its `testMatch`, leaves every check green
 * and every gate passing, and the only signal is an absence - which is the one
 * thing a green check cannot report. Same shape as the confirm page having no
 * browser coverage for months: not a failure, a silence.
 *
 * The owner's instruction, 2026-09-04: "A project CI never names is a project
 * that rots silently." So deleting it fails here instead.
 *
 * ==========================================================================
 * IT ALSO PINS THE OTHER HALF: THE AUDIENCE ARM STAYS *IN* CI
 * ==========================================================================
 * `timing-panel-audience.spec.ts` proves that a reception principal is served no
 * panel and no spans AT ALL - an authorisation property, cheap, and it must hold
 * on every commit. It is deliberately NOT named `perf-*`, because that prefix is
 * exactly what the three browser projects ignore. Renaming it into that prefix
 * would move a security-shaped proof out of CI while looking like tidying, so
 * that is asserted too.
 *
 * ==========================================================================
 * HOW IT READS THE CONFIG, AND THE ONE THING IT DOES NOT DO
 * ==========================================================================
 * `playwright.config.ts` is TypeScript with regex literals in it; this test does
 * not import or evaluate it. It slices the `projects: [` array out of the source
 * and splits it at each `name: "<id>",` line. That is a SHAPE match, and it is
 * chosen knowing the limit: if prettier ever reflows those lines the split finds
 * nothing and the vacuity test below goes RED rather than green. Failing loud on
 * a formatting change is the correct direction for a guard whose subject is an
 * absence.
 */

const CONFIG = "apps/web/playwright.config.ts";
const E2E_DIR = "apps/web/e2e";
const WORKFLOW = ".github/workflows/e2e.yml";

/** The projects CI can reach, each of which must keep ignoring the perf specs. */
const BROWSER_PROJECTS = ["chromium", "firefox", "webkit"];

function projectBlocks() {
  const text = readFileSync(CONFIG, "utf8");
  const start = text.indexOf("\n  projects: [");
  assert.notEqual(start, -1, `${CONFIG} has no \`projects: [\` array where this guard expects one`);
  const end = text.indexOf("\n  ],\n", start);
  assert.notEqual(end, -1, `${CONFIG}: the \`projects\` array does not close where this guard expects`);
  const lines = text.slice(start, end).split("\n");

  const marks = [];
  for (const [i, line] of lines.entries()) {
    const m = /^\s*(?:\{\s*)?name:\s*"([A-Za-z0-9_-]+)"/.exec(line);
    if (m) marks.push({ name: m[1], at: i });
  }
  const blocks = new Map();
  for (const [i, mark] of marks.entries()) {
    const until = i + 1 < marks.length ? marks[i + 1].at : lines.length;
    blocks.set(mark.name, lines.slice(mark.at, until).join("\n"));
  }
  return blocks;
}

test("the scan is not vacuous", () => {
  assert.ok(existsSync(CONFIG), `${CONFIG} is missing`);
  assert.ok(existsSync(WORKFLOW), `${WORKFLOW} is missing`);

  const blocks = projectBlocks();
  for (const expected of ["setup", "perf", ...BROWSER_PROJECTS]) {
    assert.ok(
      blocks.has(expected),
      `no project named "${expected}" was parsed out of ${CONFIG}. Either it was removed, or ` +
        "the file was reformatted so this guard no longer finds any project - both are red on " +
        "purpose, because a guard that silently parses nothing asserts nothing.",
    );
  }

  const perfSpecs = readdirSync(E2E_DIR).filter((f) => /^perf-.*\.spec\.ts$/.test(f));
  assert.ok(
    perfSpecs.length >= 1,
    `${E2E_DIR} holds no perf-*.spec.ts, so the perf project matches nothing and running it ` +
      "would report success having executed no test",
  );
});

test("the perf project exists and still matches the perf specs", () => {
  const perf = projectBlocks().get("perf");
  assert.match(
    perf,
    /testMatch:\s*\/perf-/,
    "the perf project no longer declares a testMatch for perf-*.spec.ts, so the measurement " +
      "suite is orphaned: the files stay in the repo and nothing can run them.",
  );
  assert.match(
    perf,
    /storageState:\s*"e2e\/\.auth\/admin\.json"/,
    "the perf project must run as the ADMIN principal (SR-24). A reading taken as another " +
      "principal, or with RLS off, describes a different plan and has misled this project twice.",
  );
});

test("every browser project CI can run still ignores the perf specs", () => {
  // The other direction of the same rule. If chromium stopped ignoring them, the
  // measurement suite would run on every PR against a database seeded to three
  // patients and report numbers about nothing - and its premise assertion would
  // redden the whole gate.
  const blocks = projectBlocks();
  for (const name of BROWSER_PROJECTS) {
    assert.match(
      blocks.get(name),
      /"\*\*\/perf-\*\.spec\.ts"/,
      `project "${name}" no longer ignores **/perf-*.spec.ts, so the production-scale ` +
        "measurement suite would run inside per-PR CI, which has no such database.",
    );
  }
});

test("CI names chromium and never names perf", () => {
  const wf = readFileSync(WORKFLOW, "utf8");
  assert.ok(
    wf.includes("--project=chromium"),
    `${WORKFLOW} no longer invokes --project=chromium; this guard's premise about what CI runs ` +
      "is stale and every conclusion below it is unsupported",
  );
  assert.ok(
    !wf.includes("--project=perf"),
    `${WORKFLOW} invokes --project=perf. The measurement needs 8,413 seeded patients, which no ` +
      "CI shard has; running it there produces a red gate, not a measurement.",
  );
});

test("the audience arm is NOT named perf-*, so CI keeps running it", () => {
  const spec = `${E2E_DIR}/timing-panel-audience.spec.ts`;
  assert.ok(
    existsSync(spec),
    `${spec} is missing. It is the only proof that a reception principal receives no timing ` +
      "spans in their payload at all - the panel is granted, not hidden.",
  );
  assert.ok(
    !/^perf-/.test("timing-panel-audience.spec.ts"),
    "the audience spec is named perf-*, which the three browser projects ignore - moving an " +
      "authorisation proof out of CI",
  );
  // And the chromium project must not have grown an ignore for it by some other
  // name. Asserted against the block rather than the whole file, because the
  // perf project legitimately mentions it nowhere.
  const chromium = projectBlocks().get("chromium");
  assert.ok(
    !chromium.includes("timing-panel-audience"),
    "the chromium project ignores timing-panel-audience.spec.ts, so the negative arm no longer " +
      "runs in CI",
  );
});
