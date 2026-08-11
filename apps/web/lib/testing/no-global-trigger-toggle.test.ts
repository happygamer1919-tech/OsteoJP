import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * INC-db-gated-trigger-race — the guard that keeps the fix fixed.
 *
 * THE DEFECT THIS EXISTS FOR. `ALTER TABLE ... DISABLE TRIGGER` changes GLOBAL
 * table state. It is not session-scoped and not transaction-local: every
 * connection to that database sees it immediately. Two apps/web DB-gated
 * suites (reminders/redeem.db.test.ts and scheduling/pedido-confirm.db.test.ts)
 * each disabled the SAME patient_audit_log append-only trigger in teardown, and
 * vitest runs test FILES in parallel by default. Either suite's ENABLE could
 * land inside the other's disabled window, the loser's DELETE was refused, and
 * the DB-gated REQUIRED check went red on a sha whose diff could not touch it.
 *
 * WHY A SOURCE GUARD AND NOT A RUNTIME ONE. The bug is nondeterministic by
 * construction — it needs two suites, parallel scheduling and an unlucky
 * interleaving. A test that tried to REPRODUCE it would itself be flaky, which
 * is the disease. A source scan is deterministic: the toggle is either in the
 * tree or it is not, and this fails the moment it comes back.
 *
 * IT STRIPS COMMENTS BEFORE IT SCANS, and that is not a nicety. The first
 * version of this file did not, and it failed on the two suites it had just
 * FIXED — because their new teardown comments explain the ban in the same words
 * the ban is written in. A guard that cannot tell prose from code is the
 * "unstripped-comment" class ACC-vacuous-guard-sweep counts 25 of, in its
 * inverted form: there it passes on a comment, here it failed on one. Same
 * defect, and the same fix.
 *
 * WHY packages/db IS OUT OF SCOPE, stated rather than silently skipped.
 * packages/db/tests/patient-audit-append-only.test.ts legitimately toggles both
 * triggers: its SUBJECT is the trigger, and it runs in a different vitest
 * invocation with no second toggler beside it. This guard scans apps/web only,
 * which is the surface where the race actually occurred.
 */

/** `ALTER TABLE <x> DISABLE|ENABLE TRIGGER`, in any casing, across whitespace. */
const TRIGGER_TOGGLE = /alter\s+table[\s\S]{0,80}?\b(disable|enable)\s+trigger\b/i;

const WEB_ROOT = join(__dirname, "..", "..");

/** This file. Excluded from its own scan: the pattern tests below are string
 *  literals in CODE, not comments, so stripping cannot reach them. */
const SELF = join("lib", "testing", "no-global-trigger-toggle.test.ts");

/** Block and line comments removed, so the scan reads code and not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every .test.ts under apps/web, minus build output. */
function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(full, out);
    else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("no apps/web test toggles a database trigger", () => {
  const files = testFiles(WEB_ROOT);
  const rel = files.map((f) => relative(WEB_ROOT, f));

  // VACUOUS-PASS GUARD, and it is not decoration. If the walk above ever
  // returns nothing — a moved directory, a renamed suffix, a bad __dirname
  // under a different bundler — every assertion below passes over an empty
  // list and this file reports green while checking nothing. So the scan
  // asserts it found a corpus, and names the two suites that caused the
  // incident: if either is missing from the walk, the walk is wrong and the
  // guard proves nothing about them.
  it("actually found a corpus of apps/web test files to scan", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(rel).toContain(join("lib", "reminders", "redeem.db.test.ts"));
    expect(rel).toContain(join("lib", "scheduling", "pedido-confirm.db.test.ts"));
    // The self-exclusion must exclude something that is really there. If this
    // file is renamed and SELF is not updated, the exclusion below would
    // silently stop applying to anything.
    expect(rel).toContain(SELF);
  });

  // THE GUARD ITSELF. Reported as a LIST rather than one failure at a time, so
  // a reintroduction in three files is one red run naming three files instead
  // of three successive red runs.
  it("contains no ALTER TABLE ... DISABLE/ENABLE TRIGGER in executable code", () => {
    const offenders = files
      .filter((f) => relative(WEB_ROOT, f) !== SELF)
      .filter((f) => TRIGGER_TOGGLE.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(WEB_ROOT, f));
    expect(offenders).toEqual([]);
  });

  // The regex and the stripper ARE the guard, so both are themselves tested. A
  // pattern that matched nothing, or a stripper that ate everything, would make
  // the assertion above vacuously green — the same trap one level down.
  it("the pattern it scans with actually matches the shape it bans", () => {
    expect(
      TRIGGER_TOGGLE.test(
        "alter table patient_audit_log disable trigger patient_audit_log_append_only",
      ),
    ).toBe(true);
    expect(TRIGGER_TOGGLE.test("ALTER TABLE foo\n  ENABLE TRIGGER bar_append_only")).toBe(true);
    // And does not fire on ordinary SQL, so a red run means what it says.
    expect(TRIGGER_TOGGLE.test("delete from patient_audit_log where tenant_id = $1")).toBe(false);
    expect(TRIGGER_TOGGLE.test("alter table foo add column bar text")).toBe(false);
  });

  it("the stripper removes the ban from prose but leaves it in code", () => {
    const inAComment = "// we never run alter table x disable trigger y here\nconst a = 1;";
    expect(TRIGGER_TOGGLE.test(inAComment)).toBe(true); // unstripped: false positive
    expect(TRIGGER_TOGGLE.test(stripComments(inAComment))).toBe(false); // stripped: clean

    const inABlock = "/* alter table x disable trigger y */\nconst b = 2;";
    expect(TRIGGER_TOGGLE.test(stripComments(inABlock))).toBe(false);

    // THE ARM THAT MATTERS: stripping must not disarm the guard. Real code
    // still trips it after the stripper has run.
    const inCode = "await sql.execute(raw`alter table t disable trigger t_append_only`);";
    expect(TRIGGER_TOGGLE.test(stripComments(inCode))).toBe(true);
  });
});
