// TWO E2E SPEC FILES MAY NOT DERIVE THE SAME DAY. A static guard, so the next
// collision is a named red in the required CI job instead of a drawer that times
// out on a lane one run in N.
//
// ===========================================================================
// WHAT HAPPENED (LE-e2e-drawer-not-hidden-under-full-suite-load, SR-62 W5)
// ===========================================================================
// agenda-clinic-closure.spec.ts booked E2E Therapist at 10:00 on RUN_DAY_BASE + 46.
// marcacao-patient-link.spec.ts:51 booked the same therapist at the same hour on
// bandDay(46), at the other clinic. public.appointment_conflicts (0059) ignores
// the clinic, and it is RIGHT to: a therapist cannot be at Linda-a-Velha and
// Castelo Branco in the same hour (owner ruling 2026-09-13; making conflicts
// clinic-scoped is refused in advance). So the second save was refused in 26 ms
// and the drawer waited out its 12 seconds with "Guardar mesmo assim" on screen.
// CI never showed it: the two specs run on different shards, each with its own
// database. Reproduced on a lane, where one database serves the whole suite.
//
// ===========================================================================
// THE RULE, AND WHY ITS UNIT IS THE DAY
// ===========================================================================
// A day offset belongs to ONE spec file. The collision needed the same
// therapist, day and hour; this guard refuses the same DAY. That is stricter on
// purpose. Therapists and hours are runtime values - a select label, a
// fillTime argument, a clone that inherits its source's practitioner - and a
// static read can only guess at them. A guard that guesses reports safety it
// did not check. A day offset is a literal in the source, so this reads it.
//
// HOW A DAY IS READ. `RUN_DAY_BASE + <n>` anywhere on a code line, widened by
// the wrapper: futureWeekdayDate() may move a Sunday to Monday (n..n+1), and
// weekend-two-period's nextWeekday() walks up to six days (n..n+6). And
// `bandDay(<n>, ...)` in a file whose bandDay is exactly the shared
// RUN_DAY_BASE + base + retry * 100. ANY OTHER MENTION OF RUN_DAY_BASE ON A CODE
// LINE FAILS THIS TEST ("cannot see it"). Never a skip: a derivation this file
// cannot read is a derivation it cannot guard.
//
// RETRIES ARE NOT WIDENED, and that is not an oversight. A retry runs in a NEW
// Playwright worker, which re-imports fixtures.ts and draws a new RUN_DAY_BASE,
// so `+ retry * 100` never lands on another spec's day under the same base.
//
// ===========================================================================
// THE BASELINE, AND WHAT IT DOES NOT PROMISE
// ===========================================================================
// Shared days that already existed on origin/main 39762d98 when this guard
// landed. THEY ARE NOT PROVEN SAFE BY BEING LISTED. Each entry records what was
// checked by reading both specs on 2026-09-13. The list can only shrink: an
// entry that no longer occurs fails this test too, so it is deleted rather than
// left in place to cover a future collision.
//
// WHAT NO OFFSET RULE CAN SEE. RUN_DAY_BASE is drawn when a worker loads
// fixtures.ts, and Playwright replaces the worker after every failed test. Rows
// written under the old base can land on any day a later spec derives under the
// new one. That residual belongs to RUN_DAY_BASE itself, not to any pair.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const E2E = join(ROOT, "apps/web/e2e");

/** The one bandDay this guard understands, whitespace-insensitive. */
const SHARED_BAND_DAY =
  /function bandDay\(base: number, retry: number\): string \{\s*return futureDate\(RUN_DAY_BASE \+ base \+ retry \* 100\);\s*\}/;

/** How far a wrapper can move the day past its literal offset. */
const WIDEN = { futureWeekdayDate: 1, nextWeekday: 6 };

function e2eSources(dir = E2E) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...e2eSources(p));
    else if (/\.ts$/.test(e.name) && e.name !== "fixtures.ts") out.push(p);
  }
  return out.sort();
}

const isCommentLine = (t) => t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
const isImportOfTheName = (t) => /^RUN_DAY_BASE,?$/.test(t) || /^import\b/.test(t);

/**
 * Every day a source derives, as { file, line, lo, hi, form }, plus every line
 * that mentions RUN_DAY_BASE in a shape this reader does not understand.
 */
export function readDays(file, src) {
  const days = [];
  const unread = [];
  const sharedBand = SHARED_BAND_DAY.test(src);
  src.split("\n").forEach((text, i) => {
    const line = i + 1;
    const t = text.trim();
    if (isCommentLine(t) || isImportOfTheName(t)) return;
    let understood = 0;
    for (const m of text.matchAll(/(?:(\w+)\(\s*)?RUN_DAY_BASE\s*\+\s*(\d+)/g)) {
      const n = Number(m[2]);
      days.push({ file, line, lo: n, hi: n + (WIDEN[m[1]] ?? 0), form: m[0] });
      understood += 1;
    }
    if (sharedBand && /return futureDate\(RUN_DAY_BASE \+ base \+ retry \* 100\);/.test(t)) understood += 1;
    for (const m of text.matchAll(/\bbandDay\(\s*(\d+)\s*,/g)) {
      if (!sharedBand) unread.push({ file, line, text: t, why: "calls a bandDay that is not the shared definition" });
      else days.push({ file, line, lo: Number(m[1]), hi: Number(m[1]), form: m[0] });
    }
    const mentions = (text.match(/RUN_DAY_BASE/g) ?? []).length;
    if (mentions > understood) unread.push({ file, line, text: t, why: "mentions RUN_DAY_BASE in a form this guard cannot read" });
  });
  return { days, unread };
}

/** Pairs of days from DIFFERENT files whose ranges overlap, one entry per file pair and first shared day. */
export function collisions(days) {
  const seen = new Map();
  for (let a = 0; a < days.length; a += 1) {
    for (let b = a + 1; b < days.length; b += 1) {
      const x = days[a];
      const y = days[b];
      if (x.file === y.file) continue;
      const day = Math.max(x.lo, y.lo);
      if (day > Math.min(x.hi, y.hi)) continue;
      const [p, q] = x.file < y.file ? [x, y] : [y, x];
      const key = `${p.file}|${q.file}|${day}`;
      if (!seen.has(key)) seen.set(key, { files: [p.file, q.file], day, at: [`${p.file}:${p.line} ${p.form}`, `${q.file}:${q.line} ${q.form}`] });
    }
  }
  return [...seen.values()];
}

/**
 * PRE-EXISTING SHARED DAYS ON origin/main 39762d98. Listed, not blessed: `checked`
 * is what reading both specs showed on 2026-09-13. Keyed by file pair and day.
 */
export const BASELINE = [
  { files: ["agenda-sticky-header.spec.ts", "agenda-toolbar-compact.spec.ts"], day: 12, checked: "both only open the agenda; neither writes" },
  { files: ["agenda-sticky-header.spec.ts", "scheduling.spec.ts"], day: 12, checked: "sticky-header only views; scheduling:97 opens Nova marcação and never saves" },
  { files: ["agenda-toolbar-compact.spec.ts", "scheduling.spec.ts"], day: 12, checked: "toolbar-compact only views; scheduling:97 never saves" },
  { files: ["agenda-sticky-header.spec.ts", "scheduling.spec.ts"], day: 13, checked: "sticky-header only views; scheduling is the one writer (E2E Therapist 14:00)" },
  { files: ["booking-service-preselection.spec.ts", "equipa-primary-service.spec.ts"], day: 23, checked: "different therapists: E2E Therapist against E2E Terapeuta Clinica Unica" },
  {
    files: ["therapist-blocks.spec.ts", "working-hours.spec.ts"],
    day: 24,
    checked:
      "NOT A BOOKING PAIR AND NOT PROVEN HARMLESS: both write E2E Therapist's WORKING HOURS for that weekday; only therapist-blocks books (09:00, Consultório B). A weekday is shared by every seventh offset, which no day rule can see",
  },
  { files: ["agenda-cards.spec.ts", "marcacao-audit-notes.spec.ts"], day: 29, checked: "same therapist, ADJACENT not overlapping: 14:00-15:00 (only when +28 is a Sunday) and 15:00-16:00, 60-minute service, half-open overlap rule" },
  { files: ["agenda-header.spec.ts", "agenda-location-filter.spec.ts"], day: 30, checked: "both only view and filter; neither writes" },
  { files: ["agenda-header.spec.ts", "marcacoes-open-edit.spec.ts"], day: 30, checked: "agenda-header only views; marcacoes-open-edit is the one writer (10:00)" },
  { files: ["agenda-location-filter.spec.ts", "marcacoes-open-edit.spec.ts"], day: 30, checked: "location-filter only filters; marcacoes-open-edit is the one writer" },
  { files: ["agenda-clinic-closure.spec.ts", "booking-packs.spec.ts"], day: 41, checked: "the closure spec only views day 41; booking-packs books E2E Therapist 10:00" },
  { files: ["agenda-clinic-closure.spec.ts", "location-auto-select.spec.ts"], day: 41, checked: "neither writes on day 41: the closure spec views, location-auto-select opens Nova marcação unsaved" },
  { files: ["agenda-clinic-closure.spec.ts", "notes-unification.spec.ts"], day: 41, checked: "the closure spec only views; notes-unification books E2E Therapist 15:00" },
  { files: ["booking-packs.spec.ts", "location-auto-select.spec.ts"], day: 41, checked: "location-auto-select never saves" },
  { files: ["booking-packs.spec.ts", "notes-unification.spec.ts"], day: 41, checked: "same therapist, different hours: 10:00 and 15:00, 60-minute services" },
  { files: ["location-auto-select.spec.ts", "notes-unification.spec.ts"], day: 41, checked: "location-auto-select never saves" },
  { files: ["booking-packs.spec.ts", "notes-unification.spec.ts"], day: 42, checked: "same therapist, different hours: 11:00 and 16:00, 60-minute services" },
  { files: ["note-previews.spec.ts", "weekend-two-period.spec.ts"], day: 64, checked: "different therapists: weekend-two-period writes and books E2E Terapeuta Fim de Semana only" },
];

const keyOf = (c) => `${c.files[0]}|${c.files[1]}|${c.day}`;

function readTree() {
  const days = [];
  const unread = [];
  for (const path of e2eSources()) {
    const r = readDays(relative(E2E, path), readFileSync(path, "utf8"));
    days.push(...r.days);
    unread.push(...r.unread);
  }
  return { days, unread };
}

test("every mention of RUN_DAY_BASE in the e2e tree is a day this guard can read", () => {
  const { unread } = readTree();
  assert.deepEqual(
    unread.map((u) => `${u.file}:${u.line} ${u.why}: ${u.text}`),
    [],
    "A day derivation this guard cannot read is a day it cannot guard. Use RUN_DAY_BASE + <literal>, or the shared bandDay.",
  );
});

test("the reader actually reads the tree (a guard that parses nothing passes everything)", () => {
  const { days } = readTree();
  assert.ok(days.length >= 60, `only ${days.length} days read; the reader has stopped matching`);
  const has = (file, lo) => days.some((d) => d.file === file && d.lo === lo);
  assert.ok(has("marcacao-patient-link.spec.ts", 45), "bandDay(45) in marcacao-patient-link was not read");
  assert.ok(has("scheduling.spec.ts", 13), "RUN_DAY_BASE + 13 in scheduling was not read");
  assert.ok(days.some((d) => d.file === "agenda-cards.spec.ts" && d.hi === d.lo + 1), "futureWeekdayDate was not widened");
});

test("NO NEW SHARED DAY: two spec files never derive the same day outside the baseline", () => {
  const known = new Set(BASELINE.map(keyOf));
  const fresh = collisions(readTree().days).filter((c) => !known.has(keyOf(c)));
  assert.deepEqual(
    fresh.map((c) => `DAY RUN_DAY_BASE + ${c.day} IS DERIVED BY TWO SPEC FILES: ${c.at.join("  AND  ")}`),
    [],
    "Two specs on one day share a database row space: the same therapist at an overlapping hour is refused as a " +
      "double booking (appointment_conflicts is clinic-blind, by ruling). Give one of them a day no other spec uses.",
  );
});

test("the baseline only shrinks: every entry still occurs", () => {
  const live = new Set(collisions(readTree().days).map(keyOf));
  assert.deepEqual(
    BASELINE.filter((b) => !live.has(keyOf(b))).map(keyOf),
    [],
    "This shared day no longer exists. Delete its BASELINE entry so it cannot cover a future collision.",
  );
});

test("NEGATIVE ARM: the +46 pair that reddened :51 is named, file and line, by the reader and the pair check", () => {
  const closure = readDays(
    "agenda-clinic-closure.spec.ts",
    "  const day = futureDate(RUN_DAY_BASE + 46 + testInfo.retry * 100);\n",
  );
  const link = readDays(
    "marcacao-patient-link.spec.ts",
    [
      "function bandDay(base: number, retry: number): string {",
      "  return futureDate(RUN_DAY_BASE + base + retry * 100);",
      "}",
      "  const date = bandDay(46, testInfo.retry);",
    ].join("\n"),
  );
  assert.deepEqual([...closure.unread, ...link.unread], []);
  const found = collisions([...closure.days, ...link.days]);
  assert.equal(found.length, 1);
  assert.equal(found[0].day, 46);
  assert.deepEqual(found[0].files, ["agenda-clinic-closure.spec.ts", "marcacao-patient-link.spec.ts"]);
  assert.match(found[0].at[1], /marcacao-patient-link\.spec\.ts:4 bandDay\(46,/);
});

test("a Sunday shift is a shared day too: futureWeekdayDate(n) meets n + 1", () => {
  const a = readDays("a.spec.ts", "const d = futureWeekdayDate(RUN_DAY_BASE + 28);\n");
  const b = readDays("b.spec.ts", "const d = futureDate(RUN_DAY_BASE + 29);\n");
  assert.deepEqual(collisions([...a.days, ...b.days]).map((c) => c.day), [29]);
});

test("an unreadable derivation is reported, not skipped", () => {
  const r = readDays("c.spec.ts", "const offset = 12;\nconst d = futureDate(RUN_DAY_BASE + offset);\n");
  assert.equal(r.days.length, 0);
  assert.equal(r.unread.length, 1);
  assert.equal(r.unread[0].line, 2);
});
