// SHADOW-COMPARE (2026-11-06, strategy's A2 re-run with the rulings of 2026-11-06 on the A1
// findings, F4 re-ruled at 14:20): the reminder sweep's shadow against the sleeping job over every
// full day from Monday 2026-11-02 to END_DAY, with LATE-PASS (F1), HARD-DELETE (F3) and LR, the
// lost run (F4). Built from the 2026-11-04 read's test (#1691); its document and its block agree
// with each other, the read writes nothing, every halt in the block is explicit (proven by fault
// injection), the read's copy of #1678's re-arming saves is held to the code it mirrors, and, on a
// local database, every verdict flips on its own seeded fault and every label predicate names
// exactly its shape.
//
// WHAT THIS PROVES, with no database:
//   * the read's copy of R20 is R20's lines 145 to 444 on main with exactly the two named
//     substitutions (now: `closes` from END_DAY, and `full_day` from 11-02 to END_DAY);
//   * the read's copy of R22 is byte for byte R22's lines 413 to 586 on main;
//   * the code the read mirrors is #1678's at 1bd32c06, byte for byte (unchanged from #1691);
//   * LATE-PASS, HARD-DELETE and LR are written as the document says: LATE-PASS needs the empty
//     slot, the doubled slot after it and the run time in the empty slot; HARD-DELETE reads the
//     recorded `appointment.hard_delete` audit row, ties to the FIRST pass, and verdict 8's REVIEW
//     needs every short heartbeat short by exactly its ties; LR sits after S8, needs all four of
//     its conditions, is in R32's set, and every LR row is printed with its appointment id;
//   * nothing of the withdrawn F4 read or NC is left (no setting, no file, no label);
//   * THE START WRITERS (R4 round 3): every writer of appointments in apps/ and packages/ is in
//     the read's classified list at `lr`, and each class holds (R recorded, C rule 1, N never
//     writes a start, L never runs against production); a new or moved writer fails it;
//   * the document's first line is NOT READY; no em dash in the document, the read or the tests;
//   * the document pins the real read, guard and module; the sidecar pins the document;
//   * the read writes nothing, controls no transaction, and reads the clock once;
//   * the block's shape, and EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape
//     (`true && eval '<block>' < /dev/null && echo TOOL-CHAIN-CONTINUED`), every external command a
//     stub, each call made to fail in turn: each run ends with exit 1, exactly one STOP line, no
//     pass line, the tool chain stopped. Under bash always; under zsh wherever it is installed;
//   * the compare's four closing lines, each on its own profile only, REVIEW on 3 and 8 counted as
//     clean, the number of full days taken from END_DAY (two and four days proven), and the count
//     of LR rows printed to the terminal without their ids;
//   * THE F4 EXCEPTION (strategy, 2026-11-06 16:30, option A): the block checks the exception
//     file (F4XFILE, F4XSHA) before anything reads production, each fault a clean STOP (missing,
//     wrong sha256, wrong mode, a byte outside the allowed set, not ending in one line feed), hands
//     its content to psql exactly, prints `F4 EXCEPTION 1 (ruling 11-06)` and row 29's count and
//     never an id; and on a local database the read accepts exactly the one named mark (F4X) and
//     REFUSES two entries, a malformed entry and an entry naming no UNEXPLAINED shadow-only mark,
//     and prints every mark that fails rule 1b alone in row 29 while verdict 13 still FAILs.
//
// WITH A LOCAL DATABASE (SHADOW_COMPARE_1106_TEST_PGURL names one on 127.0.0.1 or localhost whose
// `public` schema is the repository's): the read runs on seeded throwaways, as the block runs it.
// Any other host is refused. Without the variable those cases are skipped.
//
// Run: node --test scripts/read-shadow-compare-20261106.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
/** `git grep` over the tracked files of this checkout; its lines, sorted. No match is an empty list. */
const gitGrep = (...args) => {
  const r = spawnSync("git", ["-C", ROOT, "grep", ...args], { encoding: "utf8" });
  assert.ok(r.status === 0 || r.status === 1, `git grep failed: ${r.stderr}`);
  return r.stdout.split("\n").filter(Boolean).sort();
};

const DOC_PATH = "docs/read-shadow-compare-20261106.md";
const SIDECAR = "docs/read-shadow-compare-20261106.sha256";
const READ_PATH = "scripts/db/read-shadow-compare-20261106.sql";
const R20_PATH = "scripts/db/read-shadow-compare-20261029.sql";
const R22_PATH = "scripts/db/read-sweep-unexplained-20261030.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const OUT_NAME = "shadow-compare-20261106.out";
const PRHEAD = "a".repeat(40);
const CLOCK_LINE = "  select now() as t1";
const GUC = "osteojp.r47_deployed_at";
const GUC_END = "osteojp.r47_end_day";
const GUC_F4X = "osteojp.r47_f4x";
const F4X_LABEL = "F4X the F4 exception (ruling 11-06): the one shadow-only mark the exception file names, accepted outside LR (row 28 prints the count only)";
const F4X_NAME = "f4-exception-20261106.txt";
const R8_LABEL = "R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false)";
const RK_LABEL = "RK kept out by R24: a re-arming save after its mark at every pass that could otherwise take it";
const S8_LABEL = "S8 a re-arming save in the 30 seconds up to its mark: the sleeping job dropped it, the sweep took it";
const LR_LABEL = "LR lost run: no claim and no ledger row, sendable at its mark, its start unchanged, planned by a scheduling save before it fell due (each printed in row 26)";

/** R8's eighth condition (the 2026-10-31 read's): every in-range pass recorded a visit left out. */
const R8_EXCLUDED = "not exists (select 1 from pr where pr.uk = u.uk and pr.in_range and coalesce(pr.excluded_count, 0) = 0)";

/** R22's span: lines 413 to 586 on main (#1672), joined by "\n"; the sha256 the 2026-10-31 read pinned. */
const R22_FIRST = 413;
const R22_SPAN_LINES = 174;
const R22_SPAN_SHA256 = "c86ca78e7a86ffbe54173814c2bcaf9f7dce461337c8a5275689c3d3660a930d";

/** The only two substitutions the read makes in R20's span. */
const R20_SUBSTITUTIONS = [
  [
    "  select timestamptz '2026-10-25 15:15:19 Europe/Lisbon' as resync,\n         timestamptz '2026-10-26 07:00:00 Europe/Lisbon' as first_full_pass,\n         timestamptz '2026-10-29 07:15:00 Europe/Lisbon' as closes\n",
    `  select current_setting('${GUC}')::timestamptz as resync,\n         timestamptz '2026-11-02 07:00:00 Europe/Lisbon' as first_full_pass,\n         ((current_setting('${GUC_END}')::date + 1) + time '07:15') at time zone 'Europe/Lisbon' as closes\n`,
  ],
  [
    "    from (values (date '2026-10-26', 0), (date '2026-10-27', 1), (date '2026-10-28', 2)) as g(d, n)\n",
    `    from (select s.d, (row_number() over (order by s.d) - 1)::int as n from generate_series(date '2026-11-02', current_setting('${GUC_END}')::date, interval '1 day') as s(d)) as g(d, n)\n`,
  ],
];

/**
 * #1678's code at its head 1bd32c06, which the read mirrors: each a span of a file, from a start
 * marker (inclusive) to the end of the function (`\n}\n`) or of the file, and its sha256 there.
 */
const MIRRORED = [
  { file: "apps/web/lib/reminders/reminder-population.ts", from: "export const RE_ARMING_SAVES = [", toEnd: true, sha: "12ddbfbf97406a216f2c59bcd98900c0de4c22ec3042d6b9edb95fabd799b8ca" },
  { file: "apps/web/lib/reminders/sweep.ts", from: "export function notSavedAfterMark(", sha: "dc8cdcc5dc5ec644a9e181ea6c1715ed29ed411c0e4878c5894d8854eb142e1c" },
  { file: "apps/web/lib/reminders/sweep.ts", from: "function markOf(", sha: "603114a10f12dafd7434c136a43556b480dbe2a52d0efb1e203dd3b302cb7970" },
  { file: "apps/web/lib/reminders/sweep-send.ts", from: "function notSavedAfterMarkBeforeItWasHandedOver(", sha: "e0b3be957a9b41c672a1f411d6cf557f0922e6e64d171276de397bcf29ba3eab" },
  { file: "apps/web/lib/reminders/sweep-send.ts", from: "function claimOfThisMark(", sha: "0024eef63ca71e6e4ceabfbf1c290ee98ac1cb3075fde0632bb0691c0e9c0da2" },
];
const CLAUSES = ["booked", "moved", "accepted_in_pedidos", "accepted_with_estado", "brought_back", "accepted_in_sms_review", "accepted_by_sms_reply"];

const doc = read(DOC_PATH);
const sql = read(READ_PATH);

function blockAfter(md, heading) {
  const at = md.indexOf(heading);
  assert.ok(at >= 0, `the document has no ${heading} section`);
  const m = md.slice(at).match(/```\n(\([\s\S]*?\n\))\n```/);
  assert.ok(m, `${heading} has no fenced block`);
  return m[1];
}
const block = blockAfter(doc, "\n## THE BLOCK\n");

/** A read with its comments removed and every string literal emptied. */
const strip = (s) => s.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
const code = strip(sql);

test("the document's first line is NOT READY, and no em dash is written anywhere in this change", () => {
  assert.equal(doc.split("\n")[0], "NOT READY");
  for (const [p, s] of [[DOC_PATH, doc], [READ_PATH, sql], ["this test", read("scripts/read-shadow-compare-20261106.test.mjs")]]) {
    assert.ok(!s.includes("\u2014"), `an em dash in ${p}`);
  }
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(doc), "a uuid is written in the document");
});

test("the read's copy of R20 is R20's lines 145 to 444 with exactly the two named substitutions", () => {
  const r20 = read(R20_PATH).split("\n");
  assert.equal(r20[144], "clock as (", "R20's line 145 moved");
  assert.match(r20[444], /^agree as \($/, "R20's pc no longer ends at line 444");
  let span = r20.slice(144, 444).join("\n");
  for (const [from, to] of R20_SUBSTITUTIONS) {
    assert.equal(span.split(from).length, 2, `R20's span does not carry this text once: ${from}`);
    span = span.replace(from, to);
  }
  const mine = sql.split("\n");
  const start = mine.indexOf("clock as (");
  assert.equal(mine[start - 1], "with");
  const n = span.split("\n").length;
  assert.equal(mine.slice(start, start + n).join("\n"), span, "the copied span differs from R20's beyond the two substitutions");
  assert.equal(sql.split(span).length, 2, "the span appears more than once");
});

test("the read's copy of R22 is byte for byte its lines 413 to 586 on main", () => {
  const r22 = read(R22_PATH).split("\n").slice(R22_FIRST - 1, R22_FIRST - 1 + R22_SPAN_LINES);
  assert.equal(r22[0], "off_min as (");
  assert.equal(sha256(r22.join("\n")), R22_SPAN_SHA256, "R22's span on main is not the span the 2026-10-31 read pinned");
  const mine = sql.split("\n");
  const start = mine.indexOf("off_min as (");
  assert.ok(start > 0, "the read has no off_min");
  assert.deepEqual(mine.slice(start, start + R22_SPAN_LINES), r22, "the copied span differs from R22's");
  const r8At = mine.indexOf("r8 as (");
  assert.ok(mine.slice(start + R22_SPAN_LINES, r8At).every((l) => l.startsWith("--")), "something other than a comment sits between R22's span and r8");
});

test("the code the read mirrors is #1678's at 1bd32c06 (FAILS on a base without #1678, by design)", () => {
  for (const m of MIRRORED) {
    const text = read(m.file);
    const at = text.indexOf(m.from);
    assert.ok(at >= 0, `${m.file} has no ${m.from}`);
    const span = m.toEnd ? text.slice(at) : text.slice(at, text.indexOf("\n}\n", at) + 3);
    assert.equal(sha256(span), m.sha, `${m.file} ${m.from} is not #1678's at 1bd32c06: the read's mirror must be re-derived and re-reviewed`);
  }
  assert.match(read("apps/web/lib/reminders/sweep-send.ts"), /^export const SWEEP_RETRY_AFTER_SAVE_LIMIT_MS = 3 \* 60 \* 60_000;$/m);
  assert.match(read("apps/web/lib/reminders/sweep.ts"), /\n {6}notSavedAfterMark\(tx, offset\),\n {6}notTakenBySweep\(/, "selectDueMarks does not apply R24");
  const pop = read("apps/web/lib/reminders/reminder-population.ts");
  const table = pop.slice(pop.indexOf("export const RE_ARMING_SAVES = ["), pop.indexOf("] as const;", pop.indexOf("export const RE_ARMING_SAVES = [")));
  assert.deepEqual([...table.matchAll(/clause: "([a-z_]+)"/g)].map((m) => m[1]), CLAUSES, "RE_ARMING_SAVES' clauses are not the read's");
});

test("the read's re-arming saves name every clause once, with the conditions of reArmingClause", () => {
  const rearm = sql.slice(sql.indexOf("\nrearm_rows as ("), sql.indexOf("\nprobe_eval as ("));
  for (const c of CLAUSES) assert.equal(rearm.split(`then '${c}'`).length, 2, `the clause ${c} is not named exactly once`);
  for (const piece of [
    "when l.action = 'appointment.create' then 'booked'",
    "when l.action = 'appointment.reschedule' then 'moved'",
    "when l.action = 'appointment.update' and l.metadata->>'via' = 'portal_request_confirm'",
    "join public.appointments a on a.id = l.entity_id and a.tenant_id = l.tenant_id",
  ]) assert.ok(rearm.includes(piece), `rearm_rows lost: ${piece}`);
  const ev = sql.slice(sql.indexOf("\nprobe_eval as ("), sql.indexOf("\nrk as ("));
  for (const piece of [
    "and n.clause = 'moved' and n.created_at > p.mark and n.created_at <= p.upto\n                 order by n.created_at, n.id limit 1",
    "and b.clause in ('booked', 'moved') and b.created_at <= p.mark\n                 order by b.created_at desc, b.id desc limit 1",
    "and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)",
  ]) assert.ok(ev.includes(piece), `probe_eval lost: ${piece}`);
});

test("R8, RK and S8 are #1691's; LR sits after S8, on a shadow-only UNEXPLAINED mark, needs all four conditions, and is in R32's set", () => {
  for (const label of [R8_LABEL, RK_LABEL, S8_LABEL, LR_LABEL]) assert.equal(sql.split(`'${label}'`).length, 2, `the label is not written exactly once: ${label}`);
  for (const c of ["s.in_range > 0", "s.f7 = s.in_range", "s.f1 = 0", "s.f2 = 0 and s.u2 = 0", "s.f3 = 0 and s.u3 = 0", "s.f6 = 0", "s.f8 = 0", R8_EXCLUDED]) {
    assert.ok(sql.includes(c), `r8 lost its condition ${c}`);
  }
  const pcl = sql.slice(sql.indexOf("\npcl as ("), sql.indexOf("\nagree as ("));
  assert.ok(pcl.indexOf("then 'S8 ") < pcl.indexOf("then 'LR "), "LR does not come after S8");
  assert.ok(pcl.includes("when p.side = 'shadow_only' and p.category = 'UNEXPLAINED'\n                   and exists (select 1 from lr\n"), "LR is not on a shadow-only UNEXPLAINED mark");
  assert.ok(pcl.includes("and lr.starts_at = p.starts_at\n                                  and lr.c1 and lr.c2 and lr.c3 and lr.c4)"), "LR is not keyed on the mark or does not need all four conditions");
  assert.doesNotMatch(code, /kept/i, "a kept-start label in the read");
  assert.ok(doc.includes(`\`${LR_LABEL}\``), "the document does not name the LR label exactly");
  const after = sql.slice(sql.indexOf("\nagree as ("));
  assert.doesNotMatch(after.replace(/--[^\n]*/g, ""), /\bfrom pc\b|join pc\b/, "a verdict reads pc, not pcl");
  // R32's accepted set, as verdict 16 reads it, LR and F4X in it, both times.
  assert.equal((sql.match(/letter not in \('R2', 'R4', 'R8', 'S5', 'LR', 'F4X'\)/g) || []).length, 2);
  assert.doesNotMatch(sql, /letter not in \('R2', 'R4', 'R8', 'S5'\)/);
  assert.doesNotMatch(sql, /letter not in \('R2', 'R4', 'R8', 'S5', 'LR'\)/);
});

test("THE F4 EXCEPTION: one entry of the ruled form, after S8 and LR, on an UNEXPLAINED shadow-only mark, in R32's set by itself only; the read refuses with counts only; row 29 is rule 1b alone", () => {
  assert.equal(sql.split(`'${F4X_LABEL}'`).length, 2, "the F4X label is not written exactly once");
  assert.ok(doc.includes(`\`${F4X_LABEL}\``), "the document does not name the F4X label exactly");
  const pcl = sql.slice(sql.indexOf("\npcl as ("), sql.indexOf("\nf4x_check as ("));
  assert.ok(pcl.indexOf("then 'S8 ") < pcl.indexOf("then 'LR ") && pcl.indexOf("then 'LR ") < pcl.indexOf("then 'F4X "), "F4X does not come after S8 and LR");
  assert.ok(pcl.includes("when p.side = 'shadow_only' and p.category = 'UNEXPLAINED'\n                   and exists (select 1 from f4x_entry x\n"), "F4X is not on a shadow-only UNEXPLAINED mark");
  assert.ok(pcl.includes("and x.offset_id = p.offset_id and x.channel = p.channel and x.due_at = p.due_at)"), "F4X is not keyed on the mark");
  // The ruled form, once: the id, 48h, email and the mark of 2026-11-03 10:00 Lisbon.
  const form = "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},48h,email,2026-11-03 10:00$'";
  assert.equal(sql.split(form).length, 2, "the entry's form is not written exactly once");
  for (const piece of ["'48h'::text as offset_id, 'email'::text as channel,", "timestamptz '2026-11-03 10:00:00 Europe/Lisbon' as due_at", "   where f.well_formed\n", "regexp_split_to_table(current_setting('osteojp.r47_f4x'), E'\\n')"]) {
    assert.ok(sql.includes(piece), `the F4 exception's entry lost: ${piece}`);
  }
  assert.ok(doc.includes("```\n<appointment id>,48h,email,2026-11-03 10:00\n```"), "the document does not give the file's exact format");
  // The refusals: more than one line, a malformed line, no UNEXPLAINED shadow-only mark named; counts only.
  const chk = sql.slice(sql.indexOf("\nf4x_check as ("), sql.indexOf("\nlr_1b_only as ("));
  for (const piece of ["when c.lines <> 1 then", "when c.malformed > 0 then", "when c.accepted <> 1 then", "(select count(*) from f4x_in where not f4x_in.well_formed) as malformed", "(select count(*) from pcl where pcl.category like 'F4X %') as accepted"]) {
    assert.ok(chk.includes(piece), `the F4 exception's refusal lost: ${piece}`);
  }
  assert.doesNotMatch(chk.replace(/--[^\n]*/g, ""), /f4x_text|appointment_id/, "a refusal reason can print the entry");
  assert.equal(sql.split("case when f.problem is null then f.accepted else ('F4XSTOP ' || f.problem)::int end").length, 2, "row 28's refusal is not written exactly once");
  // Row 29: every part of LR but rule 1b, on a mark that stays UNEXPLAINED.
  const only = sql.slice(sql.indexOf("\nlr_1b_only as ("), sql.indexOf("\nagree as ("));
  for (const piece of ["   where p.category = 'UNEXPLAINED'\n", "     and l.c1 and l.c2 and l.c3\n", "     and coalesce(l.plan_start = l.iso_start, false)\n", "     and not l.start_changed\n", "     and not l.portal_notified\n", "     and not l.importer_touched\n"]) {
    assert.ok(only.includes(piece), `row 29 lost: ${piece}`);
  }
  assert.doesNotMatch(only.replace(/--[^\n]*/g, ""), /portal_window|\bc4\b/, "row 29 reads rule 1b");
});

test("LR's four conditions are written as strategy ruled them, each read from recorded rows, and the withdrawn F4 read and NC are gone", () => {
  const lr = sql.slice(sql.indexOf("\nlr as ("), sql.indexOf("\npcl as ("));
  // 1. no claim of any taker for the appointment, offset, channel and start, and no reminder ledger row.
  for (const piece of [
    "(not exists (select 1 from public.reminder_claims c\n                       where c.tenant_id = m.tenant_id and c.appointment_id = m.appointment_id\n                         and c.kind = 'claim' and c.offset_id = m.offset_id and c.channel = m.channel\n                         and c.starts_at = m.starts_at)",
    "and not exists (select 1 from public.reminder_dispatches x",
    "and x.channel = m.channel and x.template_id like 'reminder.' || m.offset_id || '.%'",
    "and x.created_at >= m.due_at - interval '10 minutes')) as c1,",
  ]) assert.ok(lr.includes(piece), `LR condition 1 lost: ${piece}`);
  assert.doesNotMatch(lr.slice(0, lr.indexOf(" as c1,")).replace(/--[^\n]*/g, ""), /taker|early|release/, "condition 1 narrows the claim by taker, early or release");
  // 2. existed, and the estado at the mark from recorded rows: sendable by the dispatcher's rule.
  for (const piece of [
    "coalesce(m.visit_now and m.visit_created < m.due_at",
    "and (st.status_at_mark in ('scheduled', 'confirmed')",
    "and (not m.pedido_origin\n                       or (st.status_at_mark = 'confirmed' and rc.kind_rec = 'change' and rc.status_rec = 'confirmed')), false) as c2,",
    "and v.created_at <= m.due_at\n               order by v.created_at desc, v.k desc limit 1) as kind_rec,",
    "and v.created_at <= m.due_at\n               order by v.created_at desc, v.k desc limit 1) as status_rec) rc on true",
    "and v.kind = 'change' and v.created_at > m.due_at\n                        order by v.created_at, v.k limit 1)",
    "and v.created_at <= m.due_at\n                      order by v.created_at desc, v.k desc limit 1)",
  ]) assert.ok(lr.includes(piece), `LR condition 2 lost: ${piece}`);
  const ev = sql.slice(sql.indexOf("\nlr_ev as ("), sql.indexOf("\nlr as ("));
  for (const piece of [
    "case when l.action = 'appointment.create' then l.metadata->>'status'",
    "from public.patient_audit_log pa",
    "then z.to_status else 'unknown' end as to_status",
    "join lr_mark m on m.appointment_id = l.entity_id and m.tenant_id = l.tenant_id",
    // Both key spellings, for every row (confirmAppointmentRequest writes snake case).
    "select coalesce(l.metadata->>'toStatus', l.metadata->>'to_status') as ts,\n                 coalesce(l.metadata->>'fromStatus', l.metadata->>'from_status') as fs) s",
    "when s.ts is not null then s.fs",
    "when s.ts is not null then s.ts",
    "or s.ts is not null\n",
    "when l.action = 'appointment.confirm.sms_code' then 'confirmed'",
    "or (l.action = 'appointment.confirm.sms_code' and l.metadata->>'reason' is null)",
  ]) assert.ok(ev.includes(piece), `LR's estado history lost: ${piece}`);
  assert.equal((ev.replace(/--[^\n]*/g, "").match(/metadata->>'(toStatus|to_status|fromStatus|from_status)'/g) || []).length, 4,
    "lr_ev reads a status key outside the two coalesces, so one spelling could be read alone");
  // The writers of a status change the comment names, each on main as cited.
  const actions = read("apps/web/lib/scheduling/actions.ts").split("\n");
  assert.equal(actions[3022], '            from_status: "scheduled",', "actions.ts:3023 is not confirmAppointmentRequest's snake-case from_status");
  assert.equal(actions[3023], '            to_status: "confirmed",', "actions.ts:3024 is not confirmAppointmentRequest's snake-case to_status");
  assert.equal(actions[3027], '            via: "portal_request_confirm",');
  for (const w of ["actions.ts:2031 to 2047  updateAppointment", "actions.ts:3018 to 3028  confirmAppointmentRequest", "actions.ts:3248 to 3257  correctAppointmentEstadoAction",
    "actions.ts:3374 to 3412  the cancel", "inbound-reply.ts:155     applyInboundReply", "inbound-store.ts:372     resolveReviewItem",
    "confirm-redeem.ts:220 to 230  the confirm code", "redeem.ts:228 and 297    the patient's link cancel", "store.ts:1064 to 1078, `cancelOwn`", "upsert.ts:820"]) {
    assert.ok(ev.includes(w), `lr_ev's comment does not name the status writer ${w}`);
  }
  // Every status-key writer in the application is one the comment names: the keys, grepped.
  const writers = gitGrep("-n", "-E", "(toStatus|to_status): ", "--", "apps/**/*.ts", ":!*.test.*")
    .filter((l) => !/\/analytics\.ts:|reminder-population\.ts:|\/inngest\//.test(l))
    .map((l) => l.split(":").slice(0, 2).join(":"));
  assert.deepEqual(writers, ["apps/web/lib/scheduling/actions.ts:2045", "apps/web/lib/scheduling/actions.ts:2066", "apps/web/lib/scheduling/actions.ts:3024", "apps/web/lib/scheduling/actions.ts:3257", "apps/web/lib/scheduling/actions.ts:3411"],
    "a writer of a status key appeared or moved: re-derive lr_ev's list (2066 is the domain event of a completion, not an audit row)");
  const appointmentUpdates = gitGrep("-n", "\\.update(appointments)", "--", "apps/**/*.ts", "packages/**/*.ts", ":!*.test.*").map((l) => l.split(":").slice(0, 2).join(":"));
  assert.deepEqual(appointmentUpdates, [
    "apps/api/lib/appointments/store.ts:1068", "apps/api/lib/appointments/store.ts:1115", "apps/web/lib/packs/link.ts:177",
    "apps/web/lib/reminders/confirm-redeem.ts:220", "apps/web/lib/reminders/inbound-reply.ts:326", "apps/web/lib/reminders/inbound-reply.ts:408",
    "apps/web/lib/reminders/inbound-store.ts:272", "apps/web/lib/reminders/redeem.ts:223", "apps/web/lib/reminders/redeem.ts:228",
    "apps/web/lib/scheduling/actions.ts:1976", "apps/web/lib/scheduling/actions.ts:1989", "apps/web/lib/scheduling/actions.ts:2497",
    "apps/web/lib/scheduling/actions.ts:3008", "apps/web/lib/scheduling/actions.ts:3243", "apps/web/lib/scheduling/actions.ts:3364",
    "packages/db/src/migration/upsert.ts:820",
  ], "a writer of appointments appeared or moved: re-derive lr_ev's list of status writers");
  assert.doesNotMatch(strip(lr + ev), /\ba\.status\b/, "LR reads the estado from the row now");
  // The dispatcher's rule it mirrors, on main.
  const dispatch = read("apps/web/lib/reminders/dispatch.ts").split("\n");
  assert.equal(dispatch[80], 'const REMINDABLE_STATUSES = new Set(["scheduled", "confirmed"]);', "dispatch.ts:81 is not the estado rule LR cites");
  assert.equal(dispatch[140], '  return data.status === "scheduled" && PEDIDO_ORIGINS.has(data.origin);', "dispatch.ts:141 is not the request gate LR cites");
  assert.equal(dispatch[1268], "  if (!REMINDABLE_STATUSES.has(data.status)) {", "dispatch.ts:1269 is not where the estado rule is applied");
  assert.equal(dispatch[1274], "  if (isUnacceptedPedido(data)) {", "dispatch.ts:1275 is not where the request gate is applied");
  const sweep = read("apps/web/lib/reminders/sweep.ts").split("\n");
  assert.equal(sweep[208], 'export const SWEEP_REMINDABLE_STATUSES = ["scheduled", "confirmed"] as const;');
  assert.equal(sweep[293], "    inArray(appointments.status, [...SWEEP_REMINDABLE_STATUSES]),");
  assert.equal(sweep[296], "    sql`${appointments.createdAt} < ${markOf(offset)}`,");
  // 3. the start at the mark (#1678's startAtTheMark, probe source `lost`) is the start now and the mark's.
  assert.ok(lr.includes("coalesce(e.start_at_mark = m.iso_start and m.start_now = m.iso_start, false) as c3,"));
  assert.ok(lr.includes("on e.src = 'lost' and e.tenant_id = m.tenant_id and e.appointment_id = m.appointment_id"));
  assert.ok(sql.includes("  select 'lost', null, p.tenant_id, p.appointment_id, p.offset_id, p.channel, p.due_at, p.iso_start, win.t1\n    from pc p cross join win\n   where p.side = 'shadow_only' and p.category = 'UNEXPLAINED'\n"));
  for (const reader of ["\nrk as (", "\nsubj as (", "\nr24 as (", "\nlab as (", "\nr34 as ("]) {
    const at = sql.indexOf(reader);
    const body = sql.slice(at, sql.indexOf("\n),", at));
    if (body.includes("probe_eval")) assert.match(body, /e\.src = '(pass|subject|shadow|sent)'/, `${reader.trim()} reads probe_eval without naming its source`);
  }
  // 4. the last save that SENDS appointment/scheduled at or before the mark: R33's re-arming saves
  //    (`rearm_rows`, held to RE_ARMING_SAVES above), less a move of a request unaccepted at the move.
  for (const piece of [
    "select r.created_at as plan_at, r.clause as plan_clause, r.to_start as plan_to_start\n        from rearm_rows r\n       where r.tenant_id = m.tenant_id and r.appointment_id = m.appointment_id\n         and r.created_at <= m.due_at\n",
    "and (r.clause <> 'moved' or not m.pedido_origin\n              or coalesce((select v.to_status from lr_ev v\n                            where v.appointment_id = r.appointment_id and v.tenant_id = r.tenant_id\n                              and v.created_at <= r.created_at\n                            order by v.created_at desc, v.k desc limit 1) not in ('scheduled', 'unknown'), false))",
    "order by r.created_at desc, r.id desc limit 1) pl on true",
    // ... and that save planned the run FOR THE MARK'S START (the R4 review's round 2).
    "(pl.plan_at is not null\n          and coalesce(ps.plan_start = m.iso_start, false)\n          and not ps.start_changed\n          and not ux.portal_notified\n          and not ux.importer_touched\n          and not ps.portal_window) as c4",
    "select case when pl.plan_clause in ('booked', 'moved') then pl.plan_to_start\n                  else (select b.to_start from rearm_rows b\n                         where b.tenant_id = m.tenant_id and b.appointment_id = m.appointment_id\n                           and b.clause in ('booked', 'moved') and b.created_at <= pl.plan_at\n                         order by b.created_at desc, b.id desc limit 1) end as plan_start,",
    "exists (select 1 from rearm_rows n\n                      where n.tenant_id = m.tenant_id and n.appointment_id = m.appointment_id\n                        and n.clause = 'moved' and n.from_start is distinct from n.to_start\n                        and n.created_at > pl.plan_at and n.created_at <= m.due_at) as start_changed,",
    // ... and no start change the recorded rows cannot order (the R4 review's round 3, rule 1).
    "pl.plan_at < m.due_at as portal_window) ps on true",
    "select exists (select 1 from public.staff_notifications sn\n                      where sn.tenant_id = m.tenant_id and sn.appointment_id = m.appointment_id\n                        and sn.kind = 'rescheduled' and sn.occurred_at <= m.due_at) as portal_notified,",
    "exists (select 1 from public.migration_staging_rows s\n                      where s.tenant_id = m.tenant_id and s.imported_entity_id = m.appointment_id) as importer_touched) ux on true",
  ]) assert.ok(lr.includes(piece), `LR condition 4 lost: ${piece}`);
  assert.doesNotMatch(lr.slice(lr.indexOf("and not ps.portal_window) as c4")).replace(/--[^\n]*/g, ""), /public\.audit_log|toStatus|hasSchedulingEvent/, "condition 4 reads audit rows of its own instead of the sending saves");
  // `rearm_rows` carries every move row, sending or not, with both of its starts: condition 4's start change reads them all.
  assert.ok(sql.includes("when l.action = 'appointment.reschedule' then 'moved'"), "rearm_rows no longer reads every move row as `moved`");
  assert.ok(sql.includes("l.metadata->>'fromStartsAt' as from_start,\n           l.metadata->>'startsAt' as to_start"), "rearm_rows no longer carries both starts of a row");
  // THE SENDERS, FROM THE CODE. Every reference, in apps/ and packages/ (tests excluded, comment
  // lines excluded: a comment sends nothing), to the event (its constant or its literal name) and
  // to the two functions every application sender goes through (a call with or without `await`,
  // an import, a definition) is pinned here, so a new sender, a new caller or an alias fails it.
  const codeRefs = (pattern) => gitGrep("-n", "-E", pattern, "--", "apps", "packages", ":!*.test.*")
    .filter((l) => !/^[^:]+:[0-9]+:[ \t]*(\/\/|\*|\/\*)/.test(l))
    .map((l) => l.split(":").slice(0, 2).join(":"));
  assert.deepEqual(codeRefs("EVENT_APPOINTMENT_SCHEDULED|appointment/scheduled"), [
    "apps/web/lib/reminders/index.ts:11", "apps/web/lib/reminders/index.ts:70",
    "apps/web/lib/reminders/inngest/client.ts:125",
    "apps/web/lib/reminders/inngest/functions.ts:108", "apps/web/lib/reminders/inngest/functions.ts:153",
    "apps/web/lib/reminders/inngest/functions.ts:296", "apps/web/lib/reminders/inngest/functions.ts:3",
    "apps/web/lib/reminders/notification-registry.ts:67",
    "packages/db/scripts/inc-1007-rearm-reminders-emit.mjs:237", "packages/db/scripts/obs-05-backfill-emit.mjs:69",
  ], "a reference to appointment/scheduled appeared or moved: a new sender? re-derive condition 4's list (index.ts:70 is the one sender in the application; functions.ts reads the event as trigger and cancelOn; the registry names it; the two scripts are owner-run senders that write no audit row)");
  assert.equal(read("apps/web/lib/reminders/index.ts").split("\n")[69], "    name: EVENT_APPOINTMENT_SCHEDULED,", "index.ts:70 is not the one sender");
  assert.deepEqual(gitGrep("-n", "enqueueAppointmentReminders", "--", "apps", "packages", ":!*.test.*").filter((l) => !/^[^:]+:[0-9]+:[ \t]*(\/\/|\*|\/\*)/.test(l)).map((l) => l.split(":").slice(0, 2).join(":")),
    ["apps/web/lib/reminders/index.ts:49", "apps/web/lib/scheduling/reminders.ts:139", "apps/web/lib/scheduling/reminders.ts:2"].sort(), "the sender has another caller");
  assert.deepEqual(codeRefs("enqueueRemindersAfterCommit|emitAcceptedPedidoReminders"), [
    "apps/web/lib/reminders/inbound-reply.ts:463", "apps/web/lib/reminders/inbound-reply.ts:9",
    "apps/web/lib/reminders/inbound-store.ts:15", "apps/web/lib/reminders/inbound-store.ts:325",
    "apps/web/lib/scheduling/actions.ts:1107", "apps/web/lib/scheduling/actions.ts:1212", "apps/web/lib/scheduling/actions.ts:1554",
    "apps/web/lib/scheduling/actions.ts:2142", "apps/web/lib/scheduling/actions.ts:2173", "apps/web/lib/scheduling/actions.ts:2858",
    "apps/web/lib/scheduling/actions.ts:3089", "apps/web/lib/scheduling/actions.ts:75",
    "apps/web/lib/scheduling/pedido-acceptance.ts:141", "apps/web/lib/scheduling/pedido-acceptance.ts:148", "apps/web/lib/scheduling/pedido-acceptance.ts:3",
    "apps/web/lib/scheduling/reminders.ts:117",
  ], "a reference to a sender appeared or moved (a call with or without await, an alias): re-derive condition 4's list");
  // The calls among them (not the imports at inbound-reply.ts:9, inbound-store.ts:15, actions.ts:75 and
  // pedido-acceptance.ts:3, nor the definitions at pedido-acceptance.ts:141 and reminders.ts:117).
  const enqueueCalls = gitGrep("-n", "-E", "(enqueueRemindersAfterCommit|emitAcceptedPedidoReminders)\\(", "--", "apps", "packages", ":!*.test.*")
    .filter((l) => !/^[^:]+:[0-9]+:[ \t]*(\/\/|\*|\/\*)/.test(l) && !/export async function /.test(l))
    .map((l) => l.split(":").slice(0, 2).join(":"));
  assert.deepEqual(enqueueCalls, [
    "apps/web/lib/reminders/inbound-reply.ts:463", "apps/web/lib/reminders/inbound-store.ts:325",
    "apps/web/lib/scheduling/actions.ts:1107", "apps/web/lib/scheduling/actions.ts:1212", "apps/web/lib/scheduling/actions.ts:1554",
    "apps/web/lib/scheduling/actions.ts:2142", "apps/web/lib/scheduling/actions.ts:2173", "apps/web/lib/scheduling/actions.ts:2858",
    "apps/web/lib/scheduling/actions.ts:3089", "apps/web/lib/scheduling/pedido-acceptance.ts:148",
  ], "a sender of appointment/scheduled appeared or moved: re-derive condition 4's list");
  for (const c of enqueueCalls) {
    const short = c.replace(/^.*\//, "");
    assert.ok(lr.includes(`${short} `) || lr.includes(`${short}  `), `condition 4's comment does not name the sender ${short}`);
  }
  assert.equal(read("apps/web/lib/scheduling/actions.ts").split("\n")[2569], "          .filter((t) => !unacceptedPedidoIds.has(t.id))", "actions.ts:2570 is not the move's unaccepted-request filter");
  // Every LR row and every shadow-only mark that is not LR is printed, with which conditions failed.
  assert.ok(sql.includes("  select 26, 'LR (lost run), mark due '"));
  assert.ok(sql.includes("   where p.category like 'LR %'\n"));
  assert.ok(sql.includes("  select 27, 'shadow-only UNEXPLAINED, not LR, mark due '"));
  for (const n of ["1", "2", "3"]) assert.ok(sql.includes(`case when not l.c${n} then '${n} `), `row 27 does not name condition ${n}`);
  assert.ok(sql.includes("case when not l.c4 then concat_ws('; ',\n                  case when l.plan_at is null then '4 no save"), "row 27 does not name condition 4");
  for (const arm of ["case when l.portal_notified then '4 ", "case when l.importer_touched then '4 ", "case when l.portal_window then '4 "]) {
    assert.ok(sql.includes(arm), `row 27 does not name rule 1's arm ${arm}`);
  }
  // Nothing of the F4 read or NC is left.
  for (const gone of ["r47_f4_answer", "f4_appointment_id", "nc_in", "nc_outcome", "F4_ANSWER"]) {
    assert.ok(!sql.includes(gone), `the read still carries ${gone}`);
    assert.ok(!doc.includes(gone), `the document still carries ${gone}`);
  }
  assert.doesNotMatch(doc, /read-f4-contact|shadow-compare-nc|## F4 READ/, "the document still names the F4 read or the NC agreement test");
});

test("THE START WRITERS: every writer of appointments in apps/ and packages/ is in the read's list, classified, and each class holds", () => {
  // The list in the SQL comment at `lr` (R4 round 3): one line per writer, file:line, class, words.
  const listed = [...sql.matchAll(/^ *--   W (\S+:\d+)  ([RCNL])  (.+)$/gm)].map((m) => ({ at: m[1], cls: m[2], what: m[3] }));
  assert.ok(listed.length > 0, "the read carries no list of start writers");
  // Every writer, from the source: a Drizzle insert or update of `appointments` (split lines
  // included), a supabase-js insert, update or upsert, and raw SQL `update` or `insert into` the
  // table, in any source file under apps/ and packages/ (migrations and owner-run scripts included).
  // Tests, Playwright specs and their e2e helpers and seeds, and test folders are not writers.
  // A comment line writes nothing.
  const files = spawnSync("git", ["-C", ROOT, "ls-files", "apps", "packages"], { encoding: "utf8" }).stdout.split("\n")
    .filter((f) => /\.(ts|tsx|mts|cts|js|mjs|cjs|sql)$/.test(f) && !/\.(test|spec)\.|(^|\/)(e2e|tests|__tests__)\//.test(f));
  const PATTERNS = [
    /\.(?:update|insert)\(\s*(?:schema\.)?appointments\s*\)/g,
    /from\(\s*["'`]appointments["'`]\s*\)\s*\.(?:insert|update|upsert)\(/g,
    /\b(?:update|insert\s+into)\s+(?:public\.)?"?appointments"?(?![A-Za-z0-9_])/gi,
  ];
  const found = new Map();
  for (const f of files) {
    const text = read(f);
    const lines = text.split("\n");
    for (const p of PATTERNS) for (const m of text.matchAll(p)) {
      const ln = text.slice(0, m.index).split("\n").length;
      if (/^\s*(\/\/|\*|\/\*|--)/.test(lines[ln - 1])) continue;
      found.set(`${f}:${ln}`, { f, text, index: m.index, raw: !m[0].startsWith(".") && !m[0].startsWith("from(") });
    }
  }
  assert.deepEqual([...found.keys()].sort(), listed.map((w) => w.at).sort(),
    "a writer of appointments appeared or moved: classify it in the read's list at `lr` (R, C, N or L) and re-derive condition 4");
  for (const w of listed) {
    const src = found.get(w.at);
    if (w.cls === "N") {
      // It never writes the start: the statement, up to its WHERE, names neither column.
      const rest = src.text.slice(src.index);
      const end = src.raw ? rest.search(/\bwhere\b/i) : rest.indexOf(".where(");
      assert.ok(end > 0, `${w.at} has no WHERE after it`);
      assert.doesNotMatch(rest.slice(0, end), /starts_?at|ends_?at/i, `${w.at} is listed N but writes a start`);
    } else if (w.cls === "R") {
      // Recorded: the audit row it cites is written where the list says.
      const cite = w.what.match(/\(([a-z-]+\.ts):(\d+)\)$/);
      assert.ok(cite, `${w.at} is listed R without the audit row's line`);
      const line = read(`${dirname(src.f)}/${cite[1]}`).split("\n")[Number(cite[2]) - 1];
      assert.match(line, /writeAppointmentAudit\(tx, \{|action: "appointment\.reschedule",/, `${w.at}: ${cite[1]}:${cite[2]} is not the audit row it cites`);
    } else if (w.cls === "C") {
      // Treated conservatively: the arm of rule 1 it names is in condition 4.
      for (const arm of w.what.match(/\b1[abc]\b/g) || []) {
        const piece = { "1a": "and not ux.portal_notified\n", "1b": "and not ps.portal_window) as c4", "1c": "and not ux.importer_touched\n" }[arm];
        assert.ok(sql.includes(piece), `${w.at} names rule ${arm}, which condition 4 does not apply`);
      }
      assert.match(w.what, /\b1[abc]\b/, `${w.at} is listed C without naming the arm of rule 1 that covers it`);
    } else {
      // Never against production: the file carries its refusal.
      assert.match(src.text, /LOCAL ONLY, AND IT REFUSES|refuseProdApplyCwd\(import\.meta\.url\)/, `${w.at} is listed L but carries no refusal`);
    }
  }
  // updateAppointment writes `.set(set)`: `set` takes only service, room and status.
  const actions = read("apps/web/lib/scheduling/actions.ts");
  assert.doesNotMatch(actions, /\bset\.(startsAt|endsAt)\b|\bset\[/, "updateAppointment's set can carry a start");
  // The portal move is the one writer C names for 1a and 1b, and the code it cites is unchanged.
  const store = read("apps/api/lib/appointments/store.ts").split("\n");
  assert.equal(store[1079], "  async rescheduleOwn(principal, id, { startsAt, endsAt }): Promise<void> {");
  assert.equal(store[1115], "        .set({ startsAt, endsAt })");
  assert.equal(store[1121], '            inArray(appointments.status, ["scheduled", "confirmed"]),', "rescheduleOwn's status guard moved: re-derive rule 1b");
  assert.match(read("apps/api/lib/appointments/booking.ts"), /const MUTABLE_STATUSES: ReadonlySet<AppointmentStatus> = new Set\(\[\n  "scheduled",\n  "confirmed",\n\]\);/, "the portal's movable estados changed: re-derive rule 1b");
  const booking = read("apps/api/lib/appointments/booking.ts").split("\n");
  assert.equal(booking[781], "  await emitPatientChange({", "booking.ts:782 is not the portal move's notification");
  assert.equal(booking[782], '    kind: "rescheduled",');
  assert.match(read("apps/api/lib/appointments/cutoff.ts"), /^export const CANCELLATION_CUTOFF_HOURS = 24;$/m, "the portal's cutoff is not 24 hours: re-derive rule 1b");
  const centre = read("apps/api/lib/notifications/centre.ts").split("\n");
  assert.equal(centre[159], "  if (recipients.length === 0) {", "centre.ts:160 is not the zero-recipient branch rule 1b cites");
  assert.equal(centre[176], "    .insert(staffNotifications)", "centre.ts:177 is not the notification's insert rule 1a reads");
  const upsert = read("packages/db/src/migration/upsert.ts").split("\n");
  assert.equal(upsert[831], "  await markImported(tx, tenantId, ledger.stagingRowId, row!.id);", "upsert.ts:832 is not the importer's ledger write rule 1c reads");
  assert.equal(upsert[399], "          await markImportedMany(", "upsert.ts:400 is not the chunked ledger write rule 1c reads");
});

test("LATE-PASS needs the empty slot, exactly two heartbeats in the next slot, and a run time in the empty slot; verdict 3's REVIEW needs every gap to be one", () => {
  const lp = sql.slice(sql.indexOf("\nlate_pass as ("), sql.indexOf("\nhb_day3 as ("));
  for (const piece of [
    "where d.slot < d.d + time '21:45'",
    "and not exists (select 1 from hb_run x where x.tenant_id = t.tenant_id and x.slot = d.slot)",
    "x.slot = d.slot + interval '15 minutes' and x.mode = 'shadow') = 2",
    "and x.run_slot = d.slot)",
  ]) assert.ok(lp.includes(piece), `late_pass lost: ${piece}`);
  const run = sql.slice(sql.indexOf("\nhb_run as ("), sql.indexOf("\nday_slot as ("));
  assert.ok(run.includes("case when h.pass_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$' then"), "the run time is not read only from a ULID");
  assert.ok(run.includes("power(32::numeric, 10 - i)"), "the run time is not the first 10 characters in base 32");
  // The decode is the 2026-11-05 diagnostic's, character for character.
  const diag = "to_timestamp((select sum((strpos(cr.alphabet, substr(h.pass_id, i, 1)) - 1)::numeric * power(32::numeric, 10 - i))";
  assert.ok(run.includes(diag));
  const v = sql.slice(sql.indexOf("\nhb_verdict3 as ("), sql.indexOf("\nhd as ("));
  assert.ok(v.includes("x.beats = 60 and x.shadow_beats = 60 and x.outside = 0 and x.late > 0\n                                      and x.missing = x.late and x.doubled = x.late and x.most_in_a_slot = 2\n                                      and x.slots = 60 - x.late"));
  assert.ok(sql.includes("when v.tenants_ok + v.tenants_late = v.tenants then 'REVIEW'\n              else 'FAIL' end\n    from hb_verdict3 v"), "verdict 3 does not read hb_verdict3 or its REVIEW arm moved");
});

test("HARD-DELETE reads the recorded audit row, cites its source, ties to the FIRST pass, and verdict 8's REVIEW needs every short heartbeat short by exactly its ties", () => {
  const hd = sql.slice(sql.indexOf("\nhd as ("), sql.indexOf("\ntwice as ("));
  for (const piece of [
    "from public.audit_log l cross join win",
    "where l.entity_type = 'appointment' and l.action = 'appointment.hard_delete'",
    "and not exists (select 1 from public.appointments a where a.id = l.entity_id)",
    "and m.deleted_at > h.created_at",
    "and m.starts_at > h.pass_at",
    "order by m.audit_id, m.offset_id, h.pass_at, h.created_at",
    "(select count(*) from hd_acct where short > 0 and short = tied) as explained",
    "(select count(*) from hd_acct where short < 0) as over",
  ]) assert.ok(hd.includes(piece), `HARD-DELETE lost: ${piece}`);
  for (const col of ["tenant_id", "entity_type", "entity_id", "created_at", "metadata->>'startsAt'"]) assert.ok(hd.includes(col), `HARD-DELETE's source does not cite ${col}`);
  assert.ok(sql.includes("when rows_without_beat = 0 and hdv.over = 0 and hdv.differing > 0\n                   and hdv.explained = hdv.differing then 'REVIEW'"), "verdict 8's REVIEW arm moved");
  assert.ok(sql.includes("(action appointment.hard_delete; tenant_id, entity_type, entity_id, created_at, metadata startsAt)"), "row 25 does not cite the source");
  assert.ok(doc.includes("`public.audit_log`, the rows with `entity_type = 'appointment'` and `action = 'appointment.hard_delete'`, read for `tenant_id`, `entity_id` (the visit), `created_at` (the delete's transaction) and `metadata->>'startsAt'`"));
  const actions = read("apps/web/lib/scheduling/actions.ts").split("\n");
  assert.match(actions[3516], /const deleted = await tx$/, "actions.ts:3517 is not the delete the read cites");
  assert.match(actions[3524], /await writeAppointmentAudit\(tx, \{$/, "actions.ts:3525 is not the audit write the read cites");
  assert.match(actions[3527], /action: "appointment\.hard_delete",/);
  assert.match(actions[3535], /startsAt: appt\.startsAt\.toISOString\(\),/);
});

test("the sidecar pins the document", () => {
  assert.equal(read(SIDECAR).trim(), `${sha256(doc)}  ${DOC_PATH}`);
});

test("the document pins the real read, guard and module, in its table, in the block and in the owner's copy step", () => {
  const before = doc.slice(0, doc.indexOf("## THE BLOCK"));
  for (const [path, varName] of [[READ_PATH, "SHAREAD"], [GUARD, "SHAGUARD"], [MODULE, "SHAPTM"]]) {
    const s = sha256(read(path));
    assert.ok(block.includes(`${varName}=${s}\n`), `the block's ${varName} is not ${path}'s sha256`);
    assert.ok(before.includes(s), `the pins table does not carry ${path}'s sha256`);
  }
  assert.doesNotMatch(doc, /@@[A-Z0-9]+@@/, "a placeholder is left in the document");
  const fallback = doc.slice(doc.indexOf("## The owner's fallback"));
  assert.ok(fallback.includes(`= "${sha256(sql)}" ] && pbcopy`), "the owner's copy step does not check the read's sha256");
  for (const g of [GUC, GUC_END, GUC_F4X]) assert.ok(fallback.includes(`set local ${g} = '`), `the owner's first line does not set ${g}`);
});

test("the read writes nothing and controls no transaction; it reads the clock once and each setting where it says", () => {
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.ok(sql.includes("current_setting('transaction_read_only')"), "verdict 0 must read the transaction's own setting");
  assert.equal((sql.match(/current_setting\('osteojp\.r47_deployed_at'\)/g) || []).length, 1);
  assert.equal((sql.match(/current_setting\('osteojp\.r47_end_day'\)/g) || []).length, 2, "END_DAY is read other than in k and full_day");
  assert.equal((sql.match(/current_setting\('osteojp\.r47_f4x'\)/g) || []).length, 1, "the F4 exception is read other than once, in f4x_in");
  assert.equal((code.match(/\bnow\(\)/g) || []).length, 1, "the read must read now() exactly once");
  assert.equal(sql.split("\n").filter((l) => l === CLOCK_LINE).length, 1, "the one clock line is not where a rehearsal replaces it");
  assert.doesNotMatch(code, /\b(current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date)\b/i, "a second clock");
});

test("the read never names a person's column, prints no tenant id and no metadata text", () => {
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|phone_e164|email|address|notes|nif|patient_id|patient_2_id|practitioner_id|created_by|actor_user_id|provider_message_id|body|ip|room|name)\b/i, "the read names a personal column");
  assert.doesNotMatch(code, /tenant_id::text|tenant_id\s*\|\|/, "the read prints a tenant id");
  assert.doesNotMatch(sql, /\|\|\s*l\.metadata|metadata->>'[a-zA-Z]+'\s*\|\||\|\|\s*[a-z]+\.(from_start|to_start|start_at_mark|start_text)/, "metadata is printed");
  assert.equal((code.match(/appointment_id::text/g) || []).length, 5, "an appointment id is printed outside rows 26, 27, 29 and the mismatch list, or compared outside F4X's match");
  assert.match(sql, /where x\.appointment_id = p\.appointment_id::text\n/, "F4X's match is not the one unprinted use");
  assert.match(sql, /l\.appointment_id::text \|\| ' \| passes conditions 1, 2 and 3 and every part of condition 4 but rule 1b; /);
  assert.match(sql, /l\.appointment_id::text \|\| ' \| no claim, no ledger row; estado at the mark ' \|\| l\.status_at_mark/);
  assert.match(sql, /l\.appointment_id::text \|\| ' \| LR failed on: '/);
  assert.match(sql, /appointment_id::text \|\| ' \| ' \|\| category as observed/);
  assert.match(sql, /where rk <= 500\n/, "the mismatch list is not capped at 500 a side");
  const out = sql.slice(sql.indexOf("\nselect n, \"check\", observed, expected, verdict from ("));
  assert.doesNotMatch(out, /\.id::text|\buk\b|\bk\b\s*\|\|/, "an id or key reaches the printed rows");
  assert.equal((out.match(/audit_id::text/g) || []).length, 1, "the hard-delete audit row's id is printed other than once, in row 25");
});

test("the document's verdict table and the read agree on the verdicts", () => {
  const nums = [...sql.matchAll(/^  select (\d+)(?: \+ [a-z.]+)?,\s*$/gm)].map((m) => Number(m[1])).filter((n) => n < 20);
  assert.deepEqual(nums, [1, 2, 3, 6, 7, 8, 9, 10, 11, 13, 15, 16], "the read's verdict rows moved");
  assert.match(sql, /^ {2}select 0 as n,$/m);
  assert.match(sql, /select 11 \+ a\.rn,/);
  assert.doesNotMatch(sql, /^ {2}select 14,/m, "verdict 14's number is reused");
  for (const n of ["| 0 |", "| 1 |", "| 2 |", "| 3 |", "| 6 |", "| 7 |", "| 8 |", "| 9 |", "| 10 |", "| 11 |", "| 12 |", "| 13 |", "| 15 |", "| 16 |"]) {
    assert.ok(doc.includes(n), `the verdict table has no row ${n}`);
  }
  assert.equal((sql.match(/then 'REVIEW'/g) || []).length, 4, "REVIEW is reachable other than on verdicts 3, 8, 11 and 12 (one arm for both) and 16");
});

function commonShape(b, label) {
  const lines = b.split("\n");
  assert.equal(lines[0], "(", label);
  assert.equal(lines[1], "set -o pipefail", label);
  assert.equal(lines.at(-1), ")", label);
  assert.doesNotMatch(b, /set -e|errexit/, label);
  assert.ok(!lines.some((l) => l.trimStart().startsWith("#")), `${label}: a # line`);
  assert.ok(!lines.some((l) => l.endsWith("\\")), `${label}: a backslash continuation`);
  const psql = lines.filter((l) => /^psql /.test(l));
  assert.equal(psql.length, 1, label);
  assert.ok(!lines.some((l) => /(^|[;|&] *)psql /.test(l) && !/^psql /.test(l)), `${label}: a psql call that does not start its line`);
  assert.doesNotMatch(b, /\btee\b/, `${label}: tee`);
  assert.ok(lines.includes('git fetch origin "refs/pull/${PRNUM}/head" || { echo "STOP: the pull request\'s head could not be fetched. Nothing was read"; exit 1; }'), label);
  assert.ok(lines.some((l) => l.startsWith('[ "${FH}" = "${PRHEAD}" ] ||')), `${label}: the fetched head is not checked by full sha`);
  assert.ok(lines.some((l) => l.startsWith('[ "${HD}" = "${PRHEAD}" ] ||')), `${label}: the checkout is not checked by full sha`);
  assert.doesNotMatch(b, /origin\/main|merge-base/, `${label}: reads main`);
  assert.ok(!/(^|[^A-Za-z])\/tmp\//.test(b), `${label}: writes under /tmp`);
  for (const l of lines) {
    if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `${label}: a halt that is not one STOP and exit 1: ${l}`);
  }
  return { lines, psql: psql[0] };
}

test("the compare block's shape: seven dispatch values checked first, the exception file checked before anything reads production, one read-only psql with the three settings, the PR head by full sha", () => {
  const { lines, psql } = commonShape(block, "compare");
  assert.match(psql, /-c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp\.r47_deployed_at = '\$\{DEPLOYED_AT\}'" -c "set local osteojp\.r47_end_day = '\$\{END_DAY\}'" -c "set local osteojp\.r47_f4x = '\$\{F4X\}'" -c "select 'read only: '/);
  assert.match(psql, /-f \$\{READFILE\} -c "rollback" > \$\{OUT\} 2>&1 \|\| \{/);
  assert.deepEqual(lines.slice(2, 9), ["PRHEAD=PENDING", "DOCSHA=PENDING", "PRNUM=PENDING", "DEPLOYED_AT=PENDING", "END_DAY=PENDING", "F4XFILE=PENDING", "F4XSHA=PENDING"]);
  assert.equal((block.match(/=PENDING$/gm) || []).length, 7);
  assert.match(lines[16], /^echo "\$\{PRHEAD\} \$\{DOCSHA\} \$\{PRNUM\} \$\{DEPLOYED_AT\} \$\{END_DAY\} \$\{F4XSHA\}" \| grep -qxE '\[0-9a-f\]\{40\} \[0-9a-f\]\{64\} \[1-9\]\[0-9\]\* 2026-11-0\[12\]T/, "the PENDING check is not the first command");
  assert.ok(lines[16].endsWith(" 2026-11-(0[3-9]|[12][0-9]|30) [0-9a-f]{64}' || { echo \"STOP: the head commit, the document's sha256, the pull request number, the deploy time, the end day or the exception file's sha256 still reads PENDING or is not in its form, so it is NOT READY. Nothing was read\"; exit 1; }"), "END_DAY or F4XSHA is not checked by form");
  assert.ok(lines[17].startsWith(`echo "\${F4XFILE}" | grep -qxE '${OUT_DIR}/[A-Za-z0-9_.-]+' || `), "F4XFILE is not checked by form second");
  // The exception file is checked, in this order, before the worktree, the env file or psql.
  const at = (re) => { const i = lines.findIndex((l) => re.test(l)); assert.ok(i > 0, `no line ${re}`); return i; };
  const order = [/^\[ -f "\$\{F4XFILE\}" \]/, /^PERM=\$\(find "\$\{F4XFILE\}" -perm 600\)/, /^\[ -n "\$\{PERM\}" \]/, /^XS=\$\(shasum -a 256 "\$\{F4XFILE\}"/, /^\[ "\$\{XS\}" = "\$\{F4XSHA\}" \]/,
    /^XB=\$\(LC_ALL=C tr -d '0-9a-z:, \\n-' < "\$\{F4XFILE\}" \| wc -c/, /^\[ "\$\{XB\}" = 0 \]/, /^F4X=\$\(awk '\{ print \}' "\$\{F4XFILE\}"\)/, /^XR=\$\(printf '%s\\n' "\$\{F4X\}" \| shasum -a 256/, /^\[ "\$\{XR\}" = "\$\{F4XSHA\}" \]/].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the exception file's checks are out of order");
  assert.ok(order.at(-1) < at(/^cd \/Users\/ivan\/Projects\/GitHub\/osteojp-prod-apply/), "the exception file is checked after the worktree");
  assert.doesNotMatch(block, /echo [^\n]*\$\{F4X\}/, "the exception's content is printed");
  assert.ok(at(/^\[ "\$\{F4L\}" = "F4 EXCEPTION 1 \(ruling 11-06\)" \] \|\| /) < at(/^RES=/), "row 28 is not checked before the profile");
  assert.ok(lines.includes(`OUT=${OUT_DIR}/${OUT_NAME}`));
  assert.doesNotMatch(block, /\b(cat|head|tail|less|more)\b[^\n]*\$\{OUT\}/, "the block prints the transcript");
});

// ---- The fault-injection harness (#1691's, with END_DAY and the LR count). ----

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const realOf = (name) => {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH }, encoding: "utf8" });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}`);
  return p;
};
const STUBBED = ["git", "node", "psql", "date", "grep", "awk", "cut", "shasum", "rm", "find", "tr", "wc"];
const FAKED = ["git", "node", "psql", "date"];
const MISMATCH_ID = "00000000-0000-4000-8000-0000000000a9";
const LR_ID = "00000000-0000-4000-8000-0000000000f8";
/** The harness's exception file: one synthetic entry, and a synthetic id for row 29's rows. */
const F4X_ID = "00000000-0000-4000-8000-0000000000f4";
const F4X_ENTRY = `${F4X_ID},48h,email,2026-11-03 10:00`;
const CAND_ID = "00000000-0000-4000-8000-00000000c0de";
const F4X_LINE = " 28 | F4 EXCEPTION 1 (ruling 11-06) | the shadow-only mark the exception file names, accepted under F4X (rows 16, 31 and 50); shadow-only marks that fail rule 1b alone (row 29, UNEXPLAINED) 0 | information: the count only, never the id | INFO";
const DAYS2 = ["2026-11-02", "2026-11-03"];
const DAYS4 = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
const HARNESS_DEPLOYED = "2026-11-01T22:14:05Z";
const HARNESS_PRNUM = "4242";

/** Row 37 as psql prints it (its check text is the read's, with no `|` in it). */
const ROW37 = (count) => ` 37 | visits that would get an early copy then an on-time send after the switch: live, early, sent claims whose start's mark falls at or after 07:00 the day after this read | ${count} | information | INFO`;
const vrow = (n, text, v = "OK") => ` ${String(n).padStart(2)} | ${n}. ${text} | x | y | ${v}`;
function verdictRows(days) {
  return [
    vrow(0, "read only"), vrow(1, "the clock"), vrow(2, "the window"),
    ...days.map((d) => vrow(3, `heartbeats on ${d}`)),
    vrow(6, "sent nothing"), vrow(7, "ceiling"), vrow(8, "accounting"), vrow(9, "twice"), vrow(10, "nothing falls out"),
    ...days.map((d) => vrow(11, `agreement, marks due ${d}, 48h email`)),
    ...days.map((d) => vrow(12, `agreement, marks due ${d}, 24h sms`)),
    vrow(13, "no mark stays UNEXPLAINED"), vrow(15, "R24 held"), vrow(16, "every label in R32's set"),
  ];
}
const table = (days) => [
  "BEGIN", "SET", "SET", "SET",
  " shadow_compare_transaction ", "----------------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...verdictRows(days),
  ` 20 | window: DEPLOYED_AT | 2026-11-01 22:14:05 | 2026-11-01 22:15:03 | 2026-11-04 08:00:00 | 2026-11-04 07:45:03 | ${days[0]} to ${days.at(-1)} (${days.length}) | information | INFO`,
  ...days.map((d) => ` 22 | passes on ${d} (R11) | 60, 60, 0, 1 to 1, 4 | information | INFO`),
  F4X_LINE,
  " 36 | R34, send mode only | 0, 0, 0, 0: 0 sweep-sent rows, as shadow sends nothing | information | INFO",
  ROW37("0"),
  ` 40 | SHADOW_SUMMARY | full days ${days[0]} to ${days.at(-1)}: both=8 shadow_only=0 run_only=0 matched_share=100.0% | unexplained 0 | INFO`,
  ` 51 | run_only 2026-11-02 10:00 48h email | ${MISMATCH_ID} | ${R8_LABEL} | information | INFO`,
  // A decoy whose number contains 37: a block matching row 37 as a substring reads it too and STOPs.
  " 370 | a decoy row whose number contains 37 | 99 | information | INFO",
  "(25 rows)", "", "ROLLBACK",
].join("\n");
const TABLE_OK = table(DAYS2);
const swap = (t, n, text, v) => {
  const r = t.replace(vrow(n, text), vrow(n, text, v));
  assert.notEqual(r, t, `no row ${n} ${text} to swap`);
  return r;
};
const early = (t, count) => t.replace(ROW37("0") + "\n", count === null ? "" : `${ROW37(count)}\n`);
const FIXTURES = {
  ok: TABLE_OK,
  four: table(DAYS4),
  clean: swap(TABLE_OK, 11, "agreement, marks due 2026-11-02, 48h email", "REVIEW"),
  late: swap(TABLE_OK, 3, "heartbeats on 2026-11-03", "REVIEW"),
  hd: swap(TABLE_OK, 8, "accounting", "REVIEW"),
  lateandhd: swap(swap(swap(TABLE_OK, 3, "heartbeats on 2026-11-03", "REVIEW"), 8, "accounting", "REVIEW"), 11, "agreement, marks due 2026-11-03, 48h email", "REVIEW"),
  fourlate: swap(table(DAYS4), 3, "heartbeats on 2026-11-05", "REVIEW"),
  labels: swap(swap(TABLE_OK, 12, "agreement, marks due 2026-11-03, 24h sms", "REVIEW"), 16, "every label in R32's set", "REVIEW"),
  labelslate: swap(swap(TABLE_OK, 3, "heartbeats on 2026-11-03", "REVIEW"), 16, "every label in R32's set", "REVIEW"),
  labelsonly: swap(TABLE_OK, 16, "every label in R32's set", "REVIEW"),
  three: table([...DAYS2, "2026-11-04"]),
  one: table(DAYS2.slice(0, 1)),
  vacuous: swap(TABLE_OK, 11, "agreement, marks due 2026-11-03, 48h email", "VACUOUS"),
  vac15: swap(TABLE_OK, 15, "R24 held", "VACUOUS"),
  cleanvac15: swap(swap(TABLE_OK, 15, "R24 held", "VACUOUS"), 8, "accounting", "REVIEW"),
  labelsvac15: swap(swap(TABLE_OK, 15, "R24 held", "VACUOUS"), 16, "every label in R32's set", "REVIEW"),
  vac15and13: swap(swap(TABLE_OK, 15, "R24 held", "VACUOUS"), 13, "no mark stays UNEXPLAINED", "VACUOUS"),
  vac3: swap(TABLE_OK, 3, "heartbeats on 2026-11-02", "VACUOUS"),
  vac8: swap(TABLE_OK, 8, "accounting", "VACUOUS"),
  fail15: swap(TABLE_OK, 15, "R24 held", "FAIL"),
  fail3: swap(TABLE_OK, 3, "heartbeats on 2026-11-03", "FAIL"),
  fail8: swap(TABLE_OK, 8, "accounting", "FAIL"),
  review15: swap(TABLE_OK, 15, "R24 held", "REVIEW"),
  review2: swap(TABLE_OK, 2, "the window", "REVIEW"),
  review13: swap(TABLE_OK, 13, "no mark stays UNEXPLAINED", "REVIEW"),
  review10: swap(TABLE_OK, 10, "nothing falls out", "REVIEW"),
  fail: swap(TABLE_OK, 13, "no mark stays UNEXPLAINED", "FAIL"),
  fail2: swap(TABLE_OK, 2, "the window", "FAIL"),
  fail16: swap(TABLE_OK, 16, "every label in R32's set", "FAIL"),
  short: TABLE_OK.replace(vrow(12, "agreement, marks due 2026-11-03, 24h sms") + "\n", ""),
  no15: TABLE_OK.replace(vrow(15, "R24 held") + "\n", ""),
  no8: TABLE_OK.replace(vrow(8, "accounting") + "\n", ""),
  extra: TABLE_OK.replace(vrow(6, "sent nothing"), vrow(14, "a stray verdict") + "\n" + vrow(6, "sent nothing")),
  double13: TABLE_OK.replace(vrow(13, "no mark stays UNEXPLAINED"), vrow(13, "no mark stays UNEXPLAINED") + "\n" + vrow(13, "no mark stays UNEXPLAINED")),
  daydrift: TABLE_OK.replace(vrow(3, "heartbeats on 2026-11-03"), vrow(3, "heartbeats on 2026-11-03") + "\n" + vrow(3, "heartbeats on 2026-11-04")),
  nosummary: TABLE_OK.replace(/^ 40 \| SHADOW_SUMMARY[^\n]*\n/m, ""),
  nor11: TABLE_OK.replace(/^ 22 \|[^\n]*\n/gm, ""),
  notreadonly: TABLE_OK.replace(" read only: on", " read only: off"),
  e37five: early(TABLE_OK, "5"),
  e37six: early(TABLE_OK, "6"),
  cleansix: early(swap(TABLE_OK, 3, "heartbeats on 2026-11-03", "REVIEW"), "6"),
  labelssix: early(swap(TABLE_OK, 16, "every label in R32's set", "REVIEW"), "6"),
  vac15six: early(swap(TABLE_OK, 15, "R24 held", "VACUOUS"), "6"),
  e37none: early(TABLE_OK, null),
  e37double: TABLE_OK.replace(ROW37("0"), `${ROW37("0")}\n${ROW37("0")}`),
  e37text: early(TABLE_OK, "none"),
  e37neg: early(TABLE_OK, "-1"),
  e37dec: early(TABLE_OK, "1.5"),
  e37huge: early(TABLE_OK, "1234567890"),
  // Two LR rows (row 26), each with its appointment id: their day reads REVIEW, verdict 16 OK.
  lr: swap(TABLE_OK, 11, "agreement, marks due 2026-11-02, 48h email", "REVIEW").replace(" 36 | R34", [
    ` 26 | LR (lost run), mark due 2026-11-02 11:00 48h email | ${LR_ID} | no claim, no ledger row; estado at the mark scheduled | information: in R32's accepted set, SOLO reads every one | INFO`,
    ` 26 | LR (lost run), mark due 2026-11-02 15:00 48h email | ${LR_ID} | no claim, no ledger row; estado at the mark confirmed | information: in R32's accepted set, SOLO reads every one | INFO`,
    " 36 | R34",
  ].join("\n")),
  // Row 28 missing, doubled, reading 0, or reading 1 with a decoy row whose number contains 28.
  f4none: TABLE_OK.replace(F4X_LINE + "\n", ""),
  f4double: TABLE_OK.replace(F4X_LINE, `${F4X_LINE}\n${F4X_LINE}`),
  f4zero: TABLE_OK.replace(F4X_LINE, F4X_LINE.replace("F4 EXCEPTION 1 (", "F4 EXCEPTION 0 (")),
  f4two: TABLE_OK.replace(F4X_LINE, F4X_LINE.replace("F4 EXCEPTION 1 (", "F4 EXCEPTION 2 (")),
  f4decoy: TABLE_OK.replace(F4X_LINE, `${F4X_LINE}\n 280 | F4 EXCEPTION 1 (ruling 11-06) | a decoy | information | INFO`),
  // Two marks that fail rule 1b alone (row 29, each with its appointment id): verdict 13 FAILs on them.
  f4cand: swap(swap(TABLE_OK, 13, "no mark stays UNEXPLAINED", "FAIL"), 11, "agreement, marks due 2026-11-02, 48h email", "FAIL").replace(" 36 | R34", [
    ` 29 | shadow-only UNEXPLAINED, rule 1b alone, mark due 2026-11-02 11:00 48h email | ${CAND_ID} | passes conditions 1, 2 and 3 and every part of condition 4 but rule 1b; planned by a save that sends appointment/scheduled (booked) at 2026-10-01 09:00:00 | information: UNEXPLAINED, verdict 13 FAILs on it; strategy rules on each by name | INFO`,
    ` 29 | shadow-only UNEXPLAINED, rule 1b alone, mark due 2026-11-02 15:00 48h email | ${CAND_ID} | passes conditions 1, 2 and 3 and every part of condition 4 but rule 1b; planned by a save that sends appointment/scheduled (booked) at 2026-10-01 09:00:00 | information: UNEXPLAINED, verdict 13 FAILs on it; strategy rules on each by name | INFO`,
    " 36 | R34",
  ].join("\n")),
};
for (const [k, v] of Object.entries(FIXTURES)) if (k !== "ok" && k !== "four") assert.notEqual(v, TABLE_OK, `the fixture ${k} changed nothing`);

function stubText(name, real) {
  return `#!/bin/sh
d="$HARNESS_DIR"
n=$(( $(cat "$d/count.${name}" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$d/count.${name}"
printf '%s:%s %s\\n' "${name}" "$n" "$*" >> "$d/calls"
if [ "$HARNESS_FAIL" = "${name}:$n" ]; then
  echo "${name}: harness fault" >&2
  ${["grep", "awk", "cut", "shasum"].includes(name) ? `"${real}" "$@" > /dev/null 2>&1 < /dev/null` : ":"}
  exit ${name === "grep" ? 2 : 1}
fi
case "${name}" in
  git)
    case "$1" in
      status) [ "$HARNESS_DIRTY" = yes ] && echo " M somefile"; exit 0;;
      fetch) [ "$2" = origin ] || { echo "harness: unexpected git $*" >&2; exit 97; }; [ "$3" = "refs/pull/$HARNESS_PRNUM/head" ] || { echo "fatal: couldn't find remote ref $3" >&2; exit 128; }; [ "$#" = 3 ] || { echo "harness: unexpected git $*" >&2; exit 97; }; exit 0;;
      checkout) exit 0;;
      rev-parse)
        case "$2" in
          FETCH_HEAD) echo "$HARNESS_FETCHED"; exit 0;;
          HEAD) echo "$HARNESS_HEAD"; exit 0;;
          *) echo "harness: unexpected git $*" >&2; exit 97;;
        esac;;
      *) echo "harness: unexpected git $*" >&2; exit 97;;
    esac;;
  node)
    [ "$1" = "scripts/assert-production-target.mjs" ] || { echo "harness: unexpected node $*" >&2; exit 97; }
    [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || { echo "harness: the guard ran without the env file's URL" >&2; exit 97; }
    printf 'host: harness.invalid\\nport: 5432\\nref:  harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
  psql)
    [ "$1" = "$HARNESS_DBURL" ] || { echo "harness: psql got a URL that is not the harness's" >&2; exit 97; }
    case "$*" in
      *"-c set local osteojp.r47_deployed_at = '$HARNESS_DEPLOYED' -c set local osteojp.r47_end_day = '$HARNESS_END' -c set local osteojp.r47_f4x = '$HARNESS_F4X' -c "*) ;;
      *) echo "harness: psql was not handed the deploy time, the end day and the exception" >&2; exit 97;;
    esac
    cat "$d/fix.$HARNESS_TABLE"; exit 0;;
  date)
    [ "$TZ" = "Europe/Lisbon" ] || { echo "harness: date read without TZ=Europe/Lisbon" >&2; exit 97; }
    case "$1" in
      +%Z) echo "$HARNESS_ZONE"; exit 0;;
      +%Y%m%d%H%M) echo "$HARNESS_NOW"; exit 0;;
      *) echo "harness: unexpected date $*" >&2; exit 97;;
    esac;;
  *) exec "${real}" "$@";;
esac
`;
}

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), "shadowcompare1106-harness-"));
  mkdirSync(join(base, "bin"));
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, FAKED.includes(n) ? "" : realOf(n)));
    chmodSync(join(base, "bin", n), 0o755);
  }
  const wt = join(base, "apply");
  for (const p of [DOC_PATH, SIDECAR, READ_PATH, GUARD, MODULE]) {
    mkdirSync(dirname(join(wt, p)), { recursive: true });
    cpSync(join(ROOT, p), join(wt, p));
  }
  mkdirSync(join(base, "handover"));
  writeF4x(base, `${F4X_ENTRY}\n`);
  writeFileSync(join(base, "prod.env"), "DATABASE_URL_DIRECT=postgresql://postgres.harness:x@harness.invalid:5432/postgres\n");
  for (const [k, v] of Object.entries(FIXTURES)) writeFileSync(join(base, `fix.${k}`), v + "\n");
  return base;
}

const HARNESS_END = "2026-11-03";
/** The harness's exception file, under its handover folder, mode 600 unless `mode` says otherwise. */
function writeF4x(base, content, mode = 0o600) {
  const f = join(base, "handover", F4X_NAME);
  rmSync(f, { force: true });
  writeFileSync(f, content);
  chmodSync(f, mode);
  return f;
}

/** The compare block as GREEN pastes it from its dispatch: the five value lines filled, paths pointed at the harness. */
function filled(base, { docsha, deployed, prnum, end, f4xfile, f4xsha } = {}) {
  return block
    .replace("F4XFILE=PENDING", `F4XFILE=${f4xfile ?? `${OUT_DIR}/${F4X_NAME}`}`)
    .replace("F4XSHA=PENDING", `F4XSHA=${f4xsha ?? sha256(`${F4X_ENTRY}\n`)}`)
    .replace("PRHEAD=PENDING", `PRHEAD=${PRHEAD}`)
    .replace("DOCSHA=PENDING", `DOCSHA=${docsha ?? sha256(doc)}`)
    .replace("PRNUM=PENDING", `PRNUM=${prnum ?? HARNESS_PRNUM}`)
    .replace("DEPLOYED_AT=PENDING", `DEPLOYED_AT=${deployed ?? HARNESS_DEPLOYED}`)
    .replace("END_DAY=PENDING", `END_DAY=${end ?? HARNESS_END}`)
    .replaceAll(APPLY_DIR, join(base, "apply"))
    .replaceAll(ENV_FILE, join(base, "prod.env"))
    .replaceAll(OUT_DIR, join(base, "handover"));
}

function runOnce(shell, base, text, env = {}) {
  rmSync(join(base, "calls"), { force: true });
  for (const n of STUBBED) rmSync(join(base, `count.${n}`), { force: true });
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  const args = shell === "zsh" ? ["-f", "-c", tail] : ["--noprofile", "--norc", "-c", tail];
  const r = spawnSync(shell, args, {
    cwd: base,
    encoding: "utf8",
    env: {
      PATH: `${join(base, "bin")}:${SYSTEM_PATH}`,
      HOME: base,
      HARNESS_DIR: base,
      HARNESS_HEAD: PRHEAD,
      HARNESS_FETCHED: PRHEAD,
      HARNESS_PRNUM,
      HARNESS_DEPLOYED,
      HARNESS_END,
      HARNESS_F4X: F4X_ENTRY,
      HARNESS_DBURL: "postgresql://postgres.harness:x@harness.invalid:5432/postgres",
      HARNESS_TABLE: "ok",
      HARNESS_ZONE: "WET",
      HARNESS_NOW: "202611040800",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

function assertGood(r, days = 2, lr = 0) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, new RegExp(`^full days: ${days}$`, "m"));
  assert.match(r.stdout, new RegExp(`^LR rows: ${lr} \\(row 26 of the file, each with its appointment id and mark; SOLO reads every one\\)$`, "m"));
  assert.ok(!r.out.includes(LR_ID), "an LR row's appointment id reached the terminal");
  assert.ok(!r.out.includes(F4X_ID) && !r.out.includes(CAND_ID), "the exception's or a row 29 appointment id reached the terminal");
  assert.match(r.stdout, /^exception:   mode 600, sha256 [0-9a-f]{64}, the dispatch's$/m);
  assert.match(r.stdout, /^F4 EXCEPTION 1 \(ruling 11-06\)$/m);
  assert.match(r.stdout, /^rule 1b alone: 0 shadow-only marks \(row 29 of the file, each with its appointment id, mark and planning save; UNEXPLAINED, so verdict 13 FAILs on each; strategy rules on each by name\)$/m);
  assert.equal(r.stdout.split("\n").filter((l) => /^ 22 \| passes on 2026-11-0\d \(R11\)/.test(l)).length, days, "the R11 rows were not printed");
  assert.ok(!r.out.includes(MISMATCH_ID), "an appointment id from the mismatch list reached the terminal");
  assert.doesNotMatch(r.out, /SHADOW_SUMMARY|read only: on|R8 no scheduling/, "the table itself reached the terminal");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
  assert.equal(r.stdout.split("\n").filter((l) => l.startsWith("SHADOW-COMPARE-1106 ")).length, 1, "not exactly one closing line");
}
const EARLY_LINE = (count) => `Early-copy pairs that would follow the switch \\(row 37, as of this read; moves later today are not counted\\): ${count}, `
  + (Number(count) > 5 ? "ABOVE 5: strategy re-rules before the switch, no switch until then\\." : "not above 5\\.");
const RERULE_NEXT = "SOLO confirms the file; strategy re-rules before the switch, no switch until then";
const SWITCH_NEXT = "SOLO confirms the file and A2's other conditions, then R36's switch is the owner's, the night after this read, after 21:50";
function assertEarly(r, count) {
  const line = r.stdout.split("\n").find((l) => l.startsWith("SHADOW-COMPARE-1106 "));
  assert.match(line, new RegExp(EARLY_LINE(count)), `row 37's count ${count} is not on the closing line: ${line}`);
  if (Number(count) > 5) {
    assert.ok(!line.includes("R36's switch is the owner's"), `above 5 the closing line still names the switch: ${line}`);
    assert.match(line, /no switch until then/);
  }
}
const total = (days) => 11 + 3 * days;
function assertPass(r, count = "0", days = 2) {
  assertGood(r, days);
  assertEarly(r, count);
  assert.match(r.stdout, new RegExp(`^verdicts: ${total(days)} OK / 0 REVIEW / 0 VACUOUS / 0 FAIL$`, "m"));
  assert.match(r.stdout, new RegExp(`^SHADOW-COMPARE-1106 PASSED: ${total(days)} OK / 0 VACUOUS / 0 FAIL over ${days} full days\\. ${EARLY_LINE(count)} The whole table is in .*GREEN does not open it\\. ${Number(count) > 5 ? RERULE_NEXT : SWITCH_NEXT}$`, "m"));
}
function assertClean(r, reviews, count = "0", days = 2, lr = 0) {
  assertGood(r, days, lr);
  assertEarly(r, count);
  assert.match(r.stdout, new RegExp(`^verdicts: ${total(days) - reviews} OK / ${reviews} REVIEW / 0 VACUOUS / 0 FAIL$`, "m"));
  assert.match(r.stdout, new RegExp(`^SHADOW-COMPARE-1106 REVIEW, CLEAN UNDER R32 AND THE 2026-11-06 RULINGS: .*verdicts 3 and 8 read OK or REVIEW under LATE-PASS and HARD-DELETE \\(rows 24 and 25\\).*\\. ${EARLY_LINE(count)} The table is in .*GREEN does not open it\\. ${Number(count) > 5 ? RERULE_NEXT : SWITCH_NEXT}$`, "m"));
}
function assertNotExercised(r, reviews, count = "0") {
  assertGood(r);
  assertEarly(r, count);
  assert.match(r.stdout, new RegExp(`^verdicts: ${total(2) - 1 - reviews} OK / ${reviews} REVIEW / 1 VACUOUS / 0 FAIL$`, "m"));
  assert.match(r.stdout, new RegExp(`^SHADOW-COMPARE-1106 REVIEW, CLEAN UNDER R32 AND THE 2026-11-06 RULINGS, R24 NOT EXERCISED: .*verdict 15 alone reads VACUOUS, no mark in the window needed R24\\. ${EARLY_LINE(count)} The table is in .*GREEN does not open it\\. Strategy answers first$`, "m"));
}
function assertLabels(r, reviews, vacuous = 0, count = "0") {
  assertGood(r);
  assertEarly(r, count);
  assert.match(r.stdout, new RegExp(`^verdicts: ${total(2) - reviews - vacuous} OK / ${reviews} REVIEW / ${vacuous} VACUOUS / 0 FAIL$`, "m"));
  assert.match(r.stdout, new RegExp(`^SHADOW-COMPARE-1106 REVIEW, LABELS OUTSIDE R32'S SET: .*\\(rows 16, 31, 35, 50 and 51\\)\\. ${EARLY_LINE(count)} The table is in .*GREEN does not open it\\. Strategy reads first, no switch until then$`, "m"));
}

function assertStop(r, re, label, closing = /SHADOW-COMPARE-1106 (PASSED|REVIEW)/) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, closing, `${label}: a closing line after a fault`);
  assert.ok(!r.out.includes(MISMATCH_ID), `${label}: an appointment id reached the terminal`);
  assert.ok(!r.out.includes(LR_ID), `${label}: an LR row's appointment id reached the terminal`);
  assert.ok(!r.out.includes(F4X_ID) && !r.out.includes(CAND_ID), `${label}: the exception's or a row 29 appointment id reached the terminal`);
  assert.doesNotMatch(r.stdout, /TOOL-CHAIN-CONTINUED/, `${label}: the tool chain went on`);
  assert.doesNotMatch(r.out, /harness: unexpected/, `${label}: an unexpected call`);
}

const shells = ["bash"];
if (spawnSync("/bin/sh", ["-c", "command -v zsh"], { env: { PATH: SYSTEM_PATH } }).status === 0) shells.push("zsh");
else if (!process.env.GITHUB_ACTIONS) test("zsh is installed here", () => assert.fail("zsh is not on this machine, and the zsh arm must run wherever it is not the GitHub runner"));

for (const shell of shells) {
  test(`${shell}: the compare's own copy STOPs at its PENDING lines before anything runs, and so does every value not in its form`, () => {
    const base = makeBase();
    try {
      const r = runOnce(shell, base, block.replaceAll(APPLY_DIR, join(base, "apply")));
      assertStop(r, /still reads PENDING or is not in its form, so it is NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|date|shasum|rm|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
      for (const [k, v] of [["deployed", "PENDING"], ["deployed", "2026-11-03T06:00:00Z"], ["deployed", "2026-11-02T06:00:00Z'; drop table x; '"], ["prnum", "0"], ["docsha", "PENDING"],
        ["end", "PENDING"], ["end", "2026-11-02"], ["end", "2026-11-31"], ["end", "2026-12-01"], ["end", "2026-11-5"], ["end", "2026-11-05'; select 1; '"],
        ["f4xsha", "PENDING"], ["f4xsha", "F".repeat(64)], ["f4xfile", "PENDING"], ["f4xfile", "/var/tmp/f4-exception.txt"], ["f4xfile", `${OUT_DIR}/sub/f4.txt`],
        ["f4xfile", `${OUT_DIR}/f4 exception.txt`], ["f4xfile", `${OUT_DIR}/${OUT_NAME}`]]) {
        const p = runOnce(shell, base, filled(base, { [k]: v }));
        assertStop(p, /NOT READY/, `${k} ${v}`);
        assert.ok(!/^(git|node|psql|date):/m.test(p.calls), `a command ran before the PENDING check (${k} ${v}): ${p.calls}`);
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the filled compare passes on the clean profile, and every external call failed in turn is a clean STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const clean = runOnce(shell, base, text);
      assertPass(clean);
      assert.match(clean.stdout, /^full days:   2026-11-02 to 2026-11-03 \(2\)$/m);
      const out = readFileSync(join(base, "handover", OUT_NAME), "utf8");
      assert.match(out, /SHADOW_SUMMARY/, "the transcript is not in the handover folder");
      assert.ok(out.includes(MISMATCH_ID), "the mismatch list is not in the transcript");
      const calls = clean.calls.trim().split("\n").map((l) => l.split(" ")[0]);
      assert.ok(calls.length >= 18, `too few calls were stubbed: ${calls.length}`);
      for (const n of STUBBED) assert.ok(calls.some((c) => c.startsWith(`${n}:`)), `${n} was never called, so its failure is not proven`);
      for (const id of calls) assertStop(runOnce(shell, base, text, { HARNESS_FAIL: id }), null, `${shell} fail ${id}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the compare's profiles, the full-day count from END_DAY, the clock, the zone, the pins, the worktree and the PR head`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const profile = /a FAIL, a VACUOUS verdict other than 15, a REVIEW outside verdicts 3, 8, 11, 12 and 16, a full day count other than 2, or a verdict missing, doubled or extra.*No switch, SOLO reports to strategy/;
      for (const t of ["vacuous", "vac15and13", "vac3", "vac8", "fail15", "fail3", "fail8", "review15", "review2", "review13", "review10", "fail", "fail2", "fail16", "short", "no15", "no8", "extra", "double13", "daydrift", "three", "one", "four"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), profile, t);
      }
      // REVIEW on 3 (LATE-PASS) and 8 (HARD-DELETE) is clean, as on 11 and 12.
      assertClean(runOnce(shell, base, text, { HARNESS_TABLE: "clean" }), 1);
      assertClean(runOnce(shell, base, text, { HARNESS_TABLE: "late" }), 1);
      assertClean(runOnce(shell, base, text, { HARNESS_TABLE: "hd" }), 1);
      assertClean(runOnce(shell, base, text, { HARNESS_TABLE: "lateandhd" }), 3);
      assertLabels(runOnce(shell, base, text, { HARNESS_TABLE: "labels" }), 2);
      assertLabels(runOnce(shell, base, text, { HARNESS_TABLE: "labelslate" }), 2);
      assertLabels(runOnce(shell, base, text, { HARNESS_TABLE: "labelsonly" }), 1);
      assertLabels(runOnce(shell, base, text, { HARNESS_TABLE: "labelsvac15" }), 1, 1);
      assertNotExercised(runOnce(shell, base, text, { HARNESS_TABLE: "vac15" }), 0);
      assertNotExercised(runOnce(shell, base, text, { HARNESS_TABLE: "cleanvac15" }), 1);
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nosummary" }), /no SHADOW_SUMMARY row/, "no summary");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nor11" }), /no R11 rows/, "no R11 rows");
      // Four full days: END_DAY 2026-11-05, read on 11-06 at or after 07:15.
      const four = filled(base, { end: "2026-11-05" });
      const env4 = { HARNESS_END: "2026-11-05", HARNESS_NOW: "202611060715" };
      assertPass(runOnce(shell, base, four, { ...env4, HARNESS_TABLE: "four" }), "0", 4);
      assertClean(runOnce(shell, base, four, { ...env4, HARNESS_TABLE: "fourlate" }), 1, "0", 4);
      assertStop(runOnce(shell, base, four, { ...env4, HARNESS_TABLE: "ok" }), /a full day count other than 4/, "two days read for four");
      for (const now of ["202611060714", "202611051200"]) {
        const r = runOnce(shell, base, four, { ...env4, HARNESS_NOW: now, HARNESS_TABLE: "four" });
        assertStop(r, /earlier than 07:15 Lisbon on the day after the end day/, `four days, clock ${now}`);
        assert.ok(!/^(git|node|psql):/m.test(r.calls), `a command ran before the clock check: ${r.calls}`);
      }
      // LR rows are counted to the terminal, never their ids; the day they fall on reads REVIEW.
      assertClean(runOnce(shell, base, text, { HARNESS_TABLE: "lr" }), 1, "0", 2, 2);
      // Row 37 on the closing line (strategy's Q9(a)).
      assertPass(runOnce(shell, base, text, { HARNESS_TABLE: "e37five" }), "5");
      assertPass(runOnce(shell, base, text, { HARNESS_TABLE: "e37six" }), "6");
      assertClean(runOnce(shell, base, text, { HARNESS_TABLE: "cleansix" }), 1, "6");
      assertLabels(runOnce(shell, base, text, { HARNESS_TABLE: "labelssix" }), 1, 0, "6");
      assertNotExercised(runOnce(shell, base, text, { HARNESS_TABLE: "vac15six" }), 0, "6");
      const row37 = /row 37 \(the early-copy pairs that would follow the switch\) missing, doubled or not a whole number.*No switch, SOLO reports to strategy$/;
      for (const t of ["e37none", "e37double", "e37text", "e37neg", "e37dec", "e37huge"]) assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), row37, t);
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const now of ["202611040714", "202611032359"]) {
        const r = runOnce(shell, base, text, { HARNESS_NOW: now });
        assertStop(r, /earlier than 07:15 Lisbon on the day after the end day/, `clock ${now}`);
        assert.ok(!/^(git|node|psql):/m.test(r.calls), `a command ran before the clock check: ${r.calls}`);
      }
      assertPass(runOnce(shell, base, text, { HARNESS_NOW: "202611040715" }));
      assertStop(runOnce(shell, base, text, { HARNESS_NOW: "soon" }), null, "a clock that is not a number");
      for (const zone of ["EST", "UTC", ""]) assertStop(runOnce(shell, base, text, { HARNESS_ZONE: zone }), /not WET or WEST/, `zone ${zone}`);
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_FETCHED: "b".repeat(40) }), /the pull request's head is \[b{40}\]/, "moved head");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "c".repeat(40) }), /not on the head commit/, "checkout");
      assertStop(runOnce(shell, base, text, { HARNESS_PRNUM: "1" }), /head could not be fetched/, "another pull request");
      assertStop(runOnce(shell, base, text, { HARNESS_DEPLOYED: "2026-11-01T22:14:06Z" }), /the read did not complete/, "psql handed another deploy time");
      assertStop(runOnce(shell, base, text, { HARNESS_END: "2026-11-04" }), /the read did not complete/, "psql handed another end day");
      assertStop(runOnce(shell, base, filled(base, { docsha: "d".repeat(64) })), /not the one the dispatch names/, "docsha");
      for (const [p, re] of [[READ_PATH, /read on disk is not the reviewed file/], [GUARD, /target guard on disk/], [MODULE, /module on disk/], [DOC_PATH, /not the one the dispatch names/]]) {
        const f = join(base, "apply", p);
        const keep = readFileSync(f);
        writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
        assertStop(runOnce(shell, base, text), re, `changed ${p}`);
        writeFileSync(f, keep);
      }
      const r1 = runOnce(shell, base, text.replaceAll(join(base, "apply"), join(base, "no-such-apply-dir")));
      assertStop(r1, /the apply worktree is not there/, "missing apply directory");
      const r2 = runOnce(shell, base, text.replaceAll(join(base, "prod.env"), join(base, "no-such.env")));
      assertStop(r2, /production environment file could not be loaded/, "missing env file");
      assert.ok(!/^(node|psql):/m.test(r2.calls), `the guard or psql ran without the env file: ${r2.calls}`);
      const r3 = runOnce(shell, base, text.replaceAll(join(base, "handover"), join(base, "no-such-handover")));
      assertStop(r3, /handover folder is not there/, "missing handover folder");
      assertPass(runOnce(shell, base, text));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: THE F4 EXCEPTION's lines: the file missing, its sha256 not the dispatch's, its mode not 600, a byte outside the set, a second line feed, each a clean STOP before anything reads production; its content handed to psql exactly; row 28 and row 29's count on the terminal, never an id`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const noRead = (r, label) => assert.ok(!/^(git|node|psql):/m.test(r.calls), `${label}: the worktree, the guard or psql ran: ${r.calls}`);
      // Missing.
      rmSync(join(base, "handover", F4X_NAME));
      let r = runOnce(shell, base, text);
      assertStop(r, /the exception file is not there\. Nothing was read/, "missing");
      noRead(r, "missing");
      // Wrong sha256: the dispatch names another file.
      writeF4x(base, `${F4X_ENTRY}\n`);
      r = runOnce(shell, base, filled(base, { f4xsha: "e".repeat(64) }));
      assertStop(r, /the exception file is not the one the dispatch names \(its sha256 is [0-9a-f]{64}\)\. Never edit the file or the dispatch to pass this\./, "wrong sha256");
      noRead(r, "wrong sha256");
      // The file changed after the dispatch was filled.
      writeF4x(base, `${F4X_ENTRY.replace("f4,", "f5,")}\n`);
      assertStop(runOnce(shell, base, text), /the exception file is not the one the dispatch names/, "changed file");
      // Wrong mode, each way.
      for (const mode of [0o644, 0o640, 0o400, 0o700]) {
        writeF4x(base, `${F4X_ENTRY}\n`, mode);
        r = runOnce(shell, base, text);
        assertStop(r, /the exception file is not mode 600\. Nothing was read/, `mode ${mode.toString(8)}`);
        noRead(r, `mode ${mode.toString(8)}`);
      }
      // A byte outside the set, its sha256 the dispatch's: a quote, a backslash, a carriage return, a tab, an upper-case id, a NUL.
      for (const bad of [`${F4X_ENTRY}'\n`, `${F4X_ENTRY}\\\n`, `${F4X_ENTRY}\r\n`, `${F4X_ENTRY}\t\n`, `${F4X_ENTRY.toUpperCase()}\n`, `${F4X_ENTRY}\u0000\n`]) {
        writeF4x(base, bad);
        r = runOnce(shell, base, filled(base, { f4xsha: sha256(bad) }));
        assertStop(r, /the exception file holds [1-9][0-9]* bytes other than lower-case letters, digits, commas, colons, hyphens, spaces and line feeds\. Nothing was read/, `bad byte ${JSON.stringify(bad)}`);
        noRead(r, `bad byte ${JSON.stringify(bad)}`);
      }
      // Not ending in exactly one line feed: what would be passed is not the pinned file.
      for (const tail of ["", "\n\n"]) {
        const c = `${F4X_ENTRY}${tail}`;
        writeF4x(base, c);
        r = runOnce(shell, base, filled(base, { f4xsha: sha256(c) }));
        assertStop(r, /the exception as read is not the file the dispatch names \(the file must end with exactly one line feed\)/, `tail ${JSON.stringify(tail)}`);
        noRead(r, `tail ${JSON.stringify(tail)}`);
      }
      // Two lines pass the block's checks and reach psql exactly as written; the read itself refuses them (the database cases).
      const two = `${F4X_ENTRY}\n${F4X_ENTRY.replace("f4,", "f5,")}\n`;
      writeF4x(base, two);
      assertPass(runOnce(shell, base, filled(base, { f4xsha: sha256(two) }), { HARNESS_F4X: two.slice(0, -1) }));
      r = runOnce(shell, base, filled(base, { f4xsha: sha256(two) }));
      assertStop(r, /the read did not complete \(an error, a refusal of the F4 exception, whose reason is the one F4XSTOP line in .* and names no id/, "psql handed another exception");
      writeF4x(base, `${F4X_ENTRY}\n`);
      // Row 28 missing, doubled, reading 0 or 2: a clean STOP after the read.
      const row28 = /did not print exactly one row 28 reading F4 EXCEPTION 1 \(ruling 11-06\), so the F4 exception did not accept exactly its one mark\..*No switch, SOLO reports to strategy$/;
      for (const t of ["f4none", "f4double", "f4zero", "f4two"]) assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), row28, t);
      assertPass(runOnce(shell, base, text, { HARNESS_TABLE: "f4decoy" }));
      // Row 29's marks are counted to the terminal, never their ids; verdict 13 FAILs on them, so the block STOPs on its profile.
      r = runOnce(shell, base, text, { HARNESS_TABLE: "f4cand" });
      assertStop(r, /a FAIL, a VACUOUS verdict other than 15/, "row 29's marks");
      assert.match(r.stdout, /^F4 EXCEPTION 1 \(ruling 11-06\)$/m);
      assert.match(r.stdout, /^rule 1b alone: 2 shadow-only marks \(row 29 of the file, /m);
      assert.ok(readFileSync(join(base, "handover", OUT_NAME), "utf8").includes(CAND_ID), "row 29's ids are not in the transcript");
      assertPass(runOnce(shell, base, text));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

}


// ---- The read on a local database: every verdict flips on its own seeded fault, every label names its shape. ----

const TENANT = "00000000-0000-4000-8000-00000000f001";
const OTHER_TENANT = "00000000-0000-4000-8000-00000000f002";
const appt = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const cid = (n) => `00000000-0000-4000-9000-${n.toString(16).padStart(12, "0")}`;
const at = (s) => `timestamptz '${s} Europe/Lisbon'`;
const READ_CLOCK = "2026-11-04 08:00:00";
const DEPLOYED = "2026-11-01T15:20:00Z";
const FULL_DAYS = ["2026-11-02", "2026-11-03"];
/** Every instant here is after 2026-10-25 (WET), so a Lisbon wall time with a Z is its ISO instant. */
const iso = (s) => `${s.replace(" ", "T")}:00.000Z`;
const dueOf = (start, offset) => new Date(Date.parse(`${start.replace(" ", "T")}:00Z`) - (offset === "48h" ? 2880 : 1440) * 60000).toISOString().slice(0, 16).replace("T", " ");
const channelOf = (offset) => (offset === "48h" ? "email" : "sms");

/**
 * The base, at the read's clock Wednesday 11-04 08:00 with DEPLOYED_AT Sunday 11-01 15:20 Lisbon:
 * two synthetic tenants (the second with no visit, heartbeating with nothing due); 10 synthetic
 * visits Monday 11-02 to Friday 11-06 at 10:00 and 15:00 Lisbon (appt(1) Monday 10:00 to appt(10)
 * Friday 15:00), each with an `appointment.create` row dated 10-01 carrying its start and the
 * status it was booked with (`scheduled`, as every booking writer on main records it); a shadow
 * heartbeat every 15 minutes, 07:00 to 21:45, from Sunday 07:00 (before the deploy, so t0 is the
 * 15:30 pass) to Wednesday 07:45; for every mark due from Sunday 00:00 to Wednesday 07:45 a
 * sleeping-job claim (mark + 2 s), a `sent` ledger row (mark + 3 s) and a shadow row in the
 * transaction of the first pass at or after the mark; each heartbeat's counts equal its rows, and
 * each records 5 visits left out. The full days each carry 2 marks of each reminder; Sunday's 4
 * marks (10:00 and 15:00) fall before t0. Three appointment foreign keys to people and clinics are
 * dropped in the throwaway: no synthetic person or clinic is made, and the read reads none of
 * those tables.
 */
const SEED = `
alter table public.appointments
  drop constraint appointments_patient_id_patients_id_fk,
  drop constraint appointments_practitioner_id_users_id_fk,
  drop constraint appointments_location_id_locations_id_fk;
insert into public.tenants (id, name, slug) values ('${TENANT}', 'Synthetic tenant', 'synthetic-1106'),
                                                  ('${OTHER_TENANT}', 'Synthetic other tenant', 'synthetic-1106-other');
create table seed_appt as
  select ('00000000-0000-4000-8000-' || lpad(to_hex(row_number() over (order by z.ts)::int), 12, '0'))::uuid as id, z.ts as starts_at
    from (select (d::date + t) at time zone 'Europe/Lisbon' as ts
            from generate_series(date '2026-11-02', date '2026-11-06', interval '1 day') d,
                 (values (time '10:00'), (time '15:00')) v(t)) z;
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  select id, '${TENANT}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
         starts_at, starts_at + interval '1 hour', 'scheduled', 'staff', ${at("2026-10-01 09:00")}, ${at("2026-10-01 09:00")}
    from seed_appt;
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  select '${TENANT}', 'appointment.create', 'appointment', id,
         jsonb_build_object('startsAt', to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'status', 'scheduled'), ${at("2026-10-01 09:00")}
    from seed_appt;
create table seed_pass as
  select z.p as pass_at, z.p + interval '150 milliseconds' as created_at,
         'run-' || to_char(z.p at time zone 'UTC', 'YYYYMMDDHH24MI') as pass_id,
         case when (z.p at time zone 'Europe/Lisbon')::time >= time '21:45'
              then ((z.p at time zone 'Europe/Lisbon')::date + time '23:00') at time zone 'Europe/Lisbon' end as look_ahead_before
    from (select ((d::date + time '07:00') + make_interval(mins => 15 * n)) at time zone 'Europe/Lisbon' + interval '3 seconds' as p
            from generate_series(date '2026-11-01', date '2026-11-04', interval '1 day') d,
                 generate_series(0, 59) n) z
   where z.p <= ${at("2026-11-04 07:50:00")};
create table seed_mark as
  select a.id as appointment_id, rm.offset_id, rm.channel, a.starts_at, a.starts_at - make_interval(mins => rm.minutes) as due_at
    from seed_appt a cross join (values ('48h', 'email', 2880), ('24h', 'sms', 1440)) rm(offset_id, channel, minutes)
   where a.starts_at - make_interval(mins => rm.minutes) >= ${at("2026-11-01 00:00:00")}
     and a.starts_at - make_interval(mins => rm.minutes) <= ${at("2026-11-04 07:45:00")};
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  select '${TENANT}', appointment_id, 'claim', offset_id, channel, starts_at, due_at, 'run', false, 1, due_at + interval '2 seconds'
    from seed_mark;
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  select '${TENANT}', appointment_id, channel, 'reminder.' || offset_id || '.' || channel, 'sent', due_at + interval '3 seconds'
    from seed_mark;
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  select '${TENANT}', m.appointment_id, 'shadow', m.offset_id, m.channel, m.starts_at, m.due_at,
         floor(extract(epoch from (p.pass_at - m.due_at)) / 60)::int, false, p.pass_id, p.created_at
    from seed_mark m
    cross join lateral (select * from seed_pass sp where sp.pass_at >= m.due_at order by sp.pass_at limit 1) p;
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  select '${TENANT}', p.pass_id, 'shadow', p.pass_at, p.look_ahead_before,
         (select count(*) from public.reminder_claims c where c.kind = 'shadow' and c.created_at = p.created_at),
         (select count(*) from public.reminder_claims c where c.kind = 'shadow' and c.created_at = p.created_at),
         false, 5, p.created_at
    from seed_pass p;
-- The sweep heartbeats every tenant: the second tenant's passes, with nothing due.
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  select '${OTHER_TENANT}', p.pass_id, 'shadow', p.pass_at, p.look_ahead_before, 0, 0, false, 0, p.created_at + interval '50 milliseconds'
    from seed_pass p;
`;

/**
 * A visit of the case's own. `saved` writes its `appointment.create` row (with startsAt `bookedAt`
 * and the status `bookedStatus`, left out when null) at `created`.
 */
const visit = (id, start, { tenant = TENANT, status = "scheduled", saved = true, created = "2026-10-01 09:00", updated = created, bookedAt = start, bookedStatus = "scheduled", saveTenant = tenant, origin = "staff", patient = null } = {}) => `
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  values ('${id}', '${tenant}', ${patient ? `'${patient}'` : "gen_random_uuid()"}, gen_random_uuid(), gen_random_uuid(), ${at(start)}, ${at(start)} + interval '1 hour',
          '${status}', '${origin}', ${at(created)}, ${at(updated)});
${saved ? `insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${saveTenant}', 'appointment.create', 'appointment', '${id}', '${JSON.stringify({ startsAt: iso(bookedAt), ...(bookedStatus === null ? {} : { status: bookedStatus }) })}', ${at(created)});` : ""}`;
/** The sleeping job's claim at the mark and its ledger row. No shadow row. */
const runClaim = (id, offset, start, due = dueOf(start, offset), outcome = "sent", reason = null) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${id}', 'claim', '${offset}', '${channelOf(offset)}', ${at(start)}, ${at(due)}, 'run', false, 1, ${at(due)} + interval '2 seconds');
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason, created_at)
  values ('${TENANT}', '${id}', '${channelOf(offset)}', 'reminder.${offset}.${channelOf(offset)}', '${outcome}', ${reason ? `'${reason}'` : "null"}, ${at(due)} + interval '3 seconds');`;
/** An audit row on a visit (no person, metadata of labels only). */
const audit = (id, action, when, metadata = "{}", tenant = TENANT) => `
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${tenant}', '${action}', 'appointment', '${id}', '${metadata}', ${at(when)});`;
/** A move as #1678 writes it: the start it left (`fromStartsAt`; null writes JSON null, undefined leaves the key out) and the new one. */
const moved = (id, when, toStart, fromStart) => audit(id, "appointment.reschedule", when, JSON.stringify({
  ...(fromStart === undefined ? {} : { fromStartsAt: fromStart === null ? null : iso(fromStart) }),
  startsAt: iso(toStart),
}));
/** A reminder ledger row of its own (no claim beside it). */
const ledger = (id, offset, when) => `
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  values ('${TENANT}', '${id}', '${channelOf(offset)}', 'reminder.${offset}.${channelOf(offset)}', 'sent', ${at(when)});`;
/** A shadow row in the transaction of the pass at `pass` (a 15-minute slot), and that heartbeat's counts raised by one. */
const shadowRow = (id, offset, start, pass, saved = false, due = dueOf(start, offset)) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  select '${TENANT}', '${id}', 'shadow', '${offset}', '${channelOf(offset)}', ${at(start)}, ${at(due)}, 0, ${saved}, p.pass_id, p.created_at
    from public.reminder_sweep_passes p where p.tenant_id = '${TENANT}' and p.pass_at = ${at(pass)} + interval '3 seconds';
update public.reminder_sweep_passes set due_count = due_count + 1, recorded_count = recorded_count + 1
 where tenant_id = '${TENANT}' and pass_at = ${at(pass)} + interval '3 seconds';`;
/** Both sides took this offset: the claim at the mark, the shadow row at the pass `pass` (the mark's own slot by default). */
const both = (id, offset, start, pass = dueOf(start, offset)) => runClaim(id, offset, start) + shadowRow(id, offset, start, pass);
/** Remove a base shadow row and lower its heartbeat's counts. */
const dropShadow = (n, offset) => `
with d as (delete from public.reminder_claims where appointment_id = '${appt(n)}' and kind = 'shadow' and offset_id = '${offset}' returning created_at)
update public.reminder_sweep_passes p set due_count = due_count - 1, recorded_count = recorded_count - 1 from d where p.tenant_id = '${TENANT}' and p.created_at = d.created_at;`;

/**
 * R24's S5 shape under #1678 (R24 held): a visit booked for Wednesday 12:00 whose 48h mark (Monday
 * 12:00) both sides took, moved at Monday 13:00 to Wednesday 11:00. The new start's 48h mark
 * (Monday 11:00) is past at the move: the sleeping job's re-plan drops it, and the sweep must not
 * take it. The new start's 24h mark (Tuesday 11:00) both take.
 */
const R24_HELD = [
  visit(appt(0xa1), "2026-11-04 11:00", { bookedAt: "2026-11-04 12:00" }),
  both(appt(0xa1), "48h", "2026-11-04 12:00"),
  moved(appt(0xa1), "2026-11-02 13:00", "2026-11-04 11:00", "2026-11-04 12:00"),
  both(appt(0xa1), "24h", "2026-11-04 11:00"),
].join("\n");

/**
 * A move written after the mark that KEEPS the start (another therapist): written at 12:30:01, after
 * the mark at 12:30 and before the 12:30 pass (12:30:03). Under R33 it does not count, so the shadow
 * takes the mark and the pair reads `both`.
 */
const KEPT = (shadowTook = true) => [
  visit(appt(0xb1), "2026-11-04 12:30"),
  runClaim(appt(0xb1), "48h", "2026-11-04 12:30"),
  moved(appt(0xb1), "2026-11-02 12:30:01", "2026-11-04 12:30", "2026-11-04 12:30"),
  shadowTook ? shadowRow(appt(0xb1), "48h", "2026-11-04 12:30", "2026-11-02 12:30", true) : "",
  both(appt(0xb1), "24h", "2026-11-04 12:30"),
].join("\n");

/**
 * RK's shape: a staff visit for Tuesday 13:00 cancelled on Sunday after t0, so at its 24h mark
 * (Monday 13:00) the sleeping job claimed and suppressed it (status); brought back at Monday 13:20
 * (cancelled to scheduled, a re-arming save after the mark). Under #1678 the sweep never takes it.
 */
const RK_SHAPE = ({ origin = "staff", extra = "" } = {}) => [
  visit(appt(0xc1), "2026-11-03 13:00", { origin, updated: "2026-11-02 13:20" }),
  audit(appt(0xc1), "appointment.update", "2026-11-01 18:00", '{"fromStatus":"scheduled","toStatus":"cancelled"}'),
  runClaim(appt(0xc1), "24h", "2026-11-03 13:00", undefined, "suppressed", "status"),
  extra,
  audit(appt(0xc1), "appointment.update", "2026-11-02 13:20", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
].join("\n");

/** One clause of RE_ARMING_SAVES on a visit both sides took, written between the mark (Monday 16:30) and the pass (16:30:03). */
const CLAUSE_CASE = ({ origin = "staff", action, metadata, tenant = TENANT, when = "2026-11-02 16:30:01" }) => [
  visit(appt(0xd1), "2026-11-04 16:30", { origin }),
  runClaim(appt(0xd1), "48h", "2026-11-04 16:30"),
  audit(appt(0xd1), action, when, metadata, tenant),
  shadowRow(appt(0xd1), "48h", "2026-11-04 16:30", "2026-11-02 16:30", true),
  both(appt(0xd1), "24h", "2026-11-04 16:30"),
].join("\n");

/**
 * Send-mode rows on Sunday after t0 for R34's predicate (no full day is touched): three visits,
 * each with a re-arming save (an online request accepted in Pedidos) after its 24h mark, and one
 * plain send. e1: handed over at the mark and held back (claim, release), saved at +30 min, sent
 * by a pass at +1 h: R34. e2: the same, sent by a pass at +4 h: past R34's cap. e3: saved at
 * +10 min, first handed over at +20 min, sent at +45 min: no claim before the save. e4: sent at its
 * mark, no save.
 */
const sweepClaim = (cidN, id, start, when, attempt) => `
insert into public.reminder_claims (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${cid(cidN)}', '${TENANT}', '${id}', 'claim', '24h', 'sms', ${at(start)}, ${at(dueOf(start, "24h"))}, 'sweep', false, ${attempt}, ${at(when)});`;
const release = (cidN, id, when) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id, created_at)
  values ('${TENANT}', '${id}', 'release', '24h', 'sms', '${cid(cidN)}', ${at(when)});`;
const sendBeat = (when) => `
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  values ('${TENANT}', 'send-${when.replace(/\D/g, "")}', 'send', ${at(when)}, 1, 1, false, 0, ${at(when)});`;
const R34_ROWS = [
  visit(appt(0xe1), "2026-11-02 18:00", { origin: "patient_portal" }),
  sweepClaim(1, appt(0xe1), "2026-11-02 18:00", "2026-11-01 18:00:02", 1), release(1, appt(0xe1), "2026-11-01 18:00:05"),
  audit(appt(0xe1), "appointment.update", "2026-11-01 18:30", '{"via":"portal_request_confirm"}'),
  sweepClaim(2, appt(0xe1), "2026-11-02 18:00", "2026-11-01 19:00:05", 2), ledger(appt(0xe1), "24h", "2026-11-01 19:00:06"),
  visit(appt(0xe2), "2026-11-02 16:00", { origin: "patient_portal" }),
  sweepClaim(3, appt(0xe2), "2026-11-02 16:00", "2026-11-01 16:00:02", 1), release(3, appt(0xe2), "2026-11-01 16:00:05"),
  audit(appt(0xe2), "appointment.update", "2026-11-01 16:30", '{"via":"portal_request_confirm"}'),
  sweepClaim(4, appt(0xe2), "2026-11-02 16:00", "2026-11-01 20:00:05", 2), ledger(appt(0xe2), "24h", "2026-11-01 20:00:06"),
  visit(appt(0xe3), "2026-11-02 17:00", { origin: "patient_portal" }),
  audit(appt(0xe3), "appointment.update", "2026-11-01 17:10", '{"via":"portal_request_confirm"}'),
  sweepClaim(5, appt(0xe3), "2026-11-02 17:00", "2026-11-01 17:20:02", 1), release(5, appt(0xe3), "2026-11-01 17:20:05"),
  sweepClaim(6, appt(0xe3), "2026-11-02 17:00", "2026-11-01 17:45:05", 2), ledger(appt(0xe3), "24h", "2026-11-01 17:45:06"),
  visit(appt(0xe4), "2026-11-02 19:30"),
  sweepClaim(7, appt(0xe4), "2026-11-02 19:30", "2026-11-01 19:30:05", 1), ledger(appt(0xe4), "24h", "2026-11-01 19:30:06"),
  sendBeat("2026-11-01 17:45:04"), sendBeat("2026-11-01 19:00:04"), sendBeat("2026-11-01 19:30:04"), sendBeat("2026-11-01 20:00:04"),
].join("\n");

/**
 * Every verdict OK except the ones named. Keys: "n" for a single verdict; "n d" for the per-day
 * verdicts 3, 11 and 12 (d the Lisbon day in the check text). Verdict 15 reads VACUOUS wherever no
 * mark had to be kept out by R24: that is its control.
 */
const KEYS = ["0", "1", "2", ...FULL_DAYS.map((d) => `3 ${d}`), "6", "7", "8", "9", "10",
  ...FULL_DAYS.map((d) => `11 ${d}`), ...FULL_DAYS.map((d) => `12 ${d}`), "13", "15", "16"];
const only = (faults) => Object.fromEntries(KEYS.map((k) => [k, faults[k] ?? (k === "15" ? "VACUOUS" : "OK")]));
const allDays = (n, v) => Object.fromEntries(FULL_DAYS.map((d) => [`${n} ${d}`, v]));
const keyOf = (r) => {
  const n = Number(r[0]);
  if (n === 3 || n === 11 || n === 12) return `${n} ${(r[1].match(/\d{4}-\d{2}-\d{2}/) || ["?"])[0]}`;
  return String(n);
};
const MON = "2026-11-02";
const TUE = "2026-11-03";
const EMPTY_WANT = { 0: "OK", 1: "OK", 2: "VACUOUS", ...allDays(3, "FAIL"), ...Object.fromEntries(["6", "7", "8", "9", "10", "13", "15", "16"].map((k) => [k, "VACUOUS"])), ...allDays(11, "VACUOUS"), ...allDays(12, "VACUOUS") };
const re = (s) => s.replace(/[()]/g, "\\$&");
/**
 * Row 27's words for rule 1b (R4 round 3), as a RegExp source: the patient could have moved the
 * visit in the portal after its planning save (`planner`, "<clause> at <Lisbon time>").
 */
const PORTAL_4 = (planner) => `4 the patient could have moved it in the portal after the planning save \\(${planner}\\) and at or before the mark, and that move writes no audit row`;
const NOTIFIED_4 = "4 a move by the patient in the portal at or before the mark, recorded only by a staff notification that cannot be ordered against the audit rows";
const IMPORTED_4 = "4 the importer wrote this visit \\(a staging row names it\\), and it writes the start with no audit row";
/**
 * Rule 1b turned off, for the cases that isolate LR's other predicates: with it on, every mark whose
 * planning save is before it fails condition 4, so no other predicate could be seen to decide.
 * The read as it ships is what every other case runs.
 */
const RULE_1B = "          and not ps.portal_window) as c4";
const RULE_1B_DEF = "             pl.plan_at < m.due_at as portal_window) ps on true";
const RULE_1B_OFF = (s) => {
  assert.equal(s.split(RULE_1B_DEF).length, 2, "rule 1b is not defined exactly once");
  return s.replace(RULE_1B_DEF, "             false as portal_window) ps on true");
};

/** A claim of the sleeping job, created Monday, with its ledger row; its start's mark on the case's day. */
const earlyClaim = (id, start, { early = true, sent = true, released = false } = {}) => `
insert into public.reminder_claims (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${id}', '${TENANT}', '${id}', 'claim', '24h', 'sms', ${at(start)}, ${at(dueOf(start, "24h"))}, 'run', ${early}, 1, ${at("2026-11-02 12:00")});
${sent ? ledger(id, "24h", "2026-11-02 12:00:01") : ""}
${released ? `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id, created_at)
  values ('${TENANT}', '${id}', 'release', '24h', 'sms', '${id}', ${at("2026-11-02 12:00:02")});` : ""}`;
const EARLY_TO_COME = [
  visit(appt(0xe5), "2026-11-06 07:05"), earlyClaim(appt(0xe5), "2026-11-06 07:05"),
  visit(appt(0xe6), "2026-11-06 07:10"), earlyClaim(appt(0xe6), "2026-11-06 07:10", { early: false }),
  visit(appt(0xe7), "2026-11-06 07:15"), earlyClaim(appt(0xe7), "2026-11-06 07:15", { released: true }),
  visit(appt(0xe8), "2026-11-06 07:20"), earlyClaim(appt(0xe8), "2026-11-06 07:20", { sent: false }),
  visit(appt(0xe9), "2026-11-06 06:55"), earlyClaim(appt(0xe9), "2026-11-06 06:55"),
].join("\n");

const CASES = [
  { name: "row 37: of five sleeping-job claims, one is live, early, sent and marked at or after Thursday 07:00: counted, no verdict moves", seed: EARLY_TO_COME, want: only({}), info: [[37, /\| 1 \|/]] },
  {
    name: "clean",
    seed: "",
    want: only({}),
    info: [
      [20, /^window: .* \| 2026-11-01 15:20:00 \| 2026-11-01 15:30:03 \| 2026-11-04 08:00:00 \| 2026-11-04 07:45:03 \| 2026-11-02 to 2026-11-03 \(2\)/],
      [2, /Lisbon 2026-11-01 15:30:03; Monday marks due before it 0, on one side only 0; moves since the deploy 0, without fromStartsAt from DEPLOYED_AT \+ 13 hours 0;/],
      [23, /\| 4, 0, 0 \|/],
      [36, /\| 0, 0, 0, 0: 0 sweep-sent rows, as shadow sends nothing \|/],
      [40, /full days 2026-11-02 to 2026-11-03: both=8 shadow_only=0 .* run_r8=0 run_rk=0 /],
      [11, /both 2; .*visits starting 2026-11-04 \|/],
    ],
  },
  { name: "empty: no heartbeat and no claim at all", seed: "delete from public.reminder_sweep_passes; delete from public.reminder_claims;", want: EMPTY_WANT },
  { name: "null window: every heartbeat removed, the claims and shadow rows left in place", seed: "delete from public.reminder_sweep_passes;", want: EMPTY_WANT },
  {
    name: "the deploy after Monday's 07:00 slot (08:00): verdict 2 FAILs, and Monday's heartbeats since the deploy are short",
    seed: "", deployed: "2026-11-02T08:00:00Z",
    want: only({ 2: "FAIL", [`3 ${MON}`]: "FAIL" }),
  },
  { name: "the deploy at Monday 06:50: t0 is the 07:00 pass, in the first slot, OK", seed: "", deployed: "2026-11-02T06:50:00Z", want: only({}), info: [[2, /Lisbon 2026-11-02 07:00:03; Monday marks due before it 0,/]] },
  { name: "the production deploy, Sunday 23:07, after Sunday's last pass: t0 is Monday's 07:00 pass, OK", seed: "", deployed: "2026-11-01T23:07:00Z", want: only({}), info: [[2, /Lisbon 2026-11-02 07:00:03; Monday marks due before it 0,/], [20, /\| 2026-11-01 23:07:00 \| 2026-11-02 07:00:03 \|/]] },
  {
    name: "the deploy at Monday 06:50 and a Monday mark due before t0, on both sides: harmless, printed, verdict 2 OK",
    seed: [visit(appt(0x90), "2026-11-03 07:00"), runClaim(appt(0x90), "24h", "2026-11-03 07:00"), shadowRow(appt(0x90), "24h", "2026-11-03 07:00", "2026-11-02 07:00")].join("\n"),
    deployed: "2026-11-02T06:50:00Z",
    want: only({}),
    info: [[2, /Monday marks due before it 1, on one side only 0;/]],
  },
  {
    name: "the deploy at Monday 06:50 and a Monday mark due before t0, the sleeping job's alone: verdict 2 FAILs",
    seed: [visit(appt(0x90), "2026-11-03 03:00"), runClaim(appt(0x90), "24h", "2026-11-03 03:00")].join("\n"),
    deployed: "2026-11-02T06:50:00Z",
    want: only({ 2: "FAIL" }),
    info: [[2, /Monday marks due before it 1, on one side only 1;/]],
  },
  {
    name: "the deploy at Monday 06:50 and a Monday mark due before t0, the shadow's alone: verdict 2 FAILs",
    seed: [visit(appt(0x90), "2026-11-03 03:00"), shadowRow(appt(0x90), "24h", "2026-11-03 03:00", "2026-11-02 07:00")].join("\n"),
    deployed: "2026-11-02T06:50:00Z",
    want: only({ 2: "FAIL" }),
    info: [[2, /Monday marks due before it 1, on one side only 1;/]],
  },
  {
    name: "a move without fromStartsAt at DEPLOYED_AT + 13 hours exactly: the old code past Skew Protection's age, verdict 2 FAILs",
    seed: moved(appt(3), "2026-11-02 04:20:00", "2026-11-03 10:00"),
    want: only({ 2: "FAIL" }),
    info: [[2, /moves since the deploy 1, without fromStartsAt from DEPLOYED_AT \+ 13 hours 1; information: without it before that \(Skew Protection\) 0,/]],
  },
  {
    name: "a move without fromStartsAt one second before DEPLOYED_AT + 13 hours: Skew Protection's stale tab, printed, verdict 2 OK",
    seed: moved(appt(3), "2026-11-02 04:19:59", "2026-11-03 10:00"),
    want: only({}),
    info: [[2, /moves since the deploy 1, without fromStartsAt from DEPLOYED_AT \+ 13 hours 0; information: without it before that \(Skew Protection\) 1,/]],
  },
  {
    name: "R24 held: a visit moved after its 48h mark to a start whose mark is past; neither side takes it, the control counts it, verdict 15 OK",
    seed: R24_HELD,
    want: only({ 15: "OK" }),
    info: [[15, /S5 shadow-only rows 0, with no re-arming save \(verdict 16\) 0; shadow rows taken after a re-arming save 0; marks saved after their mark by a re-arming save before the shadow took them 1 over visits 1/]],
  },
  {
    name: "R24 violated: the same, and the shadow took the new start's past mark after the move: S5, verdict 15 FAILs, verdict 16 OK",
    seed: [R24_HELD, shadowRow(appt(0xa1), "48h", "2026-11-04 11:00", "2026-11-02 13:15", true)].join("\n"),
    want: only({ [`11 ${MON}`]: "REVIEW", 15: "FAIL" }),
    info: [[15, /S5 shadow-only rows 1, with no re-arming save \(verdict 16\) 0; shadow rows taken after a re-arming save 1;/], [31, /marks due 2026-11-02, 48h email, shadow_only: S5 saved after its mark, before the pass \| 1 \|/]],
  },
  {
    name: "S5K: an unaccepted request given a move that keeps the start: shadow only, S5, R24 held, so verdict 15 does not FAIL and verdict 16 reads REVIEW",
    seed: [
      visit(appt(0xb4), "2026-11-04 12:45", { origin: "patient_portal" }),
      moved(appt(0xb4), "2026-11-02 12:45:01", "2026-11-04 12:45", "2026-11-04 12:45"),
      shadowRow(appt(0xb4), "48h", "2026-11-04 12:45", "2026-11-02 12:45", true),
    ].join("\n"),
    want: only({ [`11 ${MON}`]: "REVIEW", 16: "REVIEW" }),
    info: [
      [15, /S5 shadow-only rows 1, with no re-arming save \(verdict 16\) 1; shadow rows taken after a re-arming save 0;/],
      [16, /with a label outside the set 1 \(S5K 1\)/],
      [31, /shadow_only: S5 saved after its mark, before the pass \| 1 \|/],
    ],
  },
  {
    name: "a shadow row written since t0 for a mark due before it, after a re-arming save: the new code took it, verdict 15 FAILs",
    seed: [
      visit(appt(0xb5), "2026-11-02 12:00", { bookedAt: "2026-11-02 13:00" }),
      moved(appt(0xb5), "2026-11-01 14:00", "2026-11-02 12:00", "2026-11-02 13:00"),
      shadowRow(appt(0xb5), "24h", "2026-11-02 12:00", "2026-11-01 15:30", true),
    ].join("\n"),
    want: only({ 15: "FAIL" }),
    info: [[15, /shadow rows taken after a re-arming save 1;/]],
  },
  {
    name: "S8: a move to this start 10 seconds before its mark, the sleeping job dropped it, the shadow took it: its day REVIEW, verdict 16 REVIEW",
    seed: [
      visit(appt(0xb6), "2026-11-04 12:45", { bookedAt: "2026-11-04 13:00" }),
      moved(appt(0xb6), "2026-11-02 12:44:50", "2026-11-04 12:45", "2026-11-04 13:00"),
      shadowRow(appt(0xb6), "48h", "2026-11-04 12:45", "2026-11-02 12:45"),
    ].join("\n"),
    want: only({ [`11 ${MON}`]: "REVIEW", 16: "REVIEW" }),
    info: [[50, new RegExp(`${appt(0xb6)} \\| ${re(S8_LABEL)}`)], [16, /\(S8 1\)/]],
  },
  {
    name: "S8 negative: the same move 31 seconds before the mark: not S8; no claim, no ledger row, planned by that move, but the patient could have moved it in the portal in those 31 seconds (rule 1b): UNEXPLAINED",
    seed: [
      visit(appt(0xb6), "2026-11-04 12:45", { bookedAt: "2026-11-04 13:00" }),
      moved(appt(0xb6), "2026-11-02 12:44:29", "2026-11-04 12:45", "2026-11-04 13:00"),
      shadowRow(appt(0xb6), "48h", "2026-11-04 12:45", "2026-11-02 12:45"),
    ].join("\n"),
    want: only({ [`11 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xb6)} \\| UNEXPLAINED`)], [27, new RegExp(`${appt(0xb6)} \\| LR failed on: ${PORTAL_4("moved at 2026-11-02 12:44:29")} \\| `)]],
  },
  {
    name: "S8 negative: a status-only save 10 seconds before the mark re-arms nothing: not S8; it sends nothing either, so the run was planned by the booking, and rule 1b reads the window after the booking: UNEXPLAINED",
    seed: [
      visit(appt(0xb6), "2026-11-04 12:45"),
      audit(appt(0xb6), "appointment.update", "2026-11-02 12:44:50", '{"fromStatus":"scheduled","toStatus":"confirmed"}'),
      shadowRow(appt(0xb6), "48h", "2026-11-04 12:45", "2026-11-02 12:45"),
    ].join("\n"),
    want: only({ [`11 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xb6)} \\| UNEXPLAINED`)], [27, new RegExp(`${appt(0xb6)} \\| LR failed on: ${PORTAL_4("booked at 2026-10-01 09:00:00")} \\| `)]],
  },
  { name: "a move that keeps the start, after the mark and before the pass: it does not count (R33), the shadow takes it, `both`", seed: KEPT(true), want: only({}) },
  {
    name: "a move that keeps the start, after the mark, and NO shadow row: run only, UNEXPLAINED (no kept-start label, not RK)",
    seed: KEPT(false),
    want: only({ [`11 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "moved away and back after the mark: the start at the mark is the earliest move's fromStartsAt, kept, the shadow takes it",
    seed: [
      visit(appt(0xb2), "2026-11-04 13:30"),
      runClaim(appt(0xb2), "48h", "2026-11-04 13:30"),
      moved(appt(0xb2), "2026-11-02 13:30:01", "2026-11-04 14:30", "2026-11-04 13:30"),
      moved(appt(0xb2), "2026-11-02 13:30:02", "2026-11-04 13:30", "2026-11-04 14:30"),
      shadowRow(appt(0xb2), "48h", "2026-11-04 13:30", "2026-11-02 13:30", true),
      both(appt(0xb2), "24h", "2026-11-04 13:30"),
    ].join("\n"),
    want: only({}),
  },
  {
    name: "a kept-start move whose fromStartsAt is null: the start at the mark falls to the booking row's startsAt (rule 2), kept",
    seed: [
      visit(appt(0xb3), "2026-11-04 14:00"),
      runClaim(appt(0xb3), "48h", "2026-11-04 14:00"),
      moved(appt(0xb3), "2026-11-02 14:00:01", "2026-11-04 14:00", null),
      shadowRow(appt(0xb3), "48h", "2026-11-04 14:00", "2026-11-02 14:00", true),
      both(appt(0xb3), "24h", "2026-11-04 14:00"),
    ].join("\n"),
    want: only({}),
  },
  {
    name: "a re-arming save written AT the mark exactly does not count (strictly after): the shadow takes it",
    seed: CLAUSE_CASE({ action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"confirmed"}', when: "2026-11-02 16:30:00" }),
    want: only({}),
  },
  {
    name: "RK: cancelled at its mark (the sleeping job suppressed it), brought back after the mark; under R24 the sweep never takes it",
    seed: RK_SHAPE(),
    want: only({ [`12 ${MON}`]: "REVIEW", 15: "OK", 16: "REVIEW" }),
    info: [
      [51, new RegExp(`${appt(0xc1)} \\| ${re(RK_LABEL)}`)],
      [16, /with a label outside the set 1 \(RK 1\)/],
      [35, /RK 2026-11-02 24h sms: 1/],
      [40, /run_rk=1 /],
    ],
  },
  {
    name: "RK negative: brought back to scheduled on an online request (not a re-arming save): UNEXPLAINED",
    seed: RK_SHAPE({ origin: "patient_portal" }),
    want: only({ [`12 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xc1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "RK negative: a pass with every old predicate true before any re-arming save (cancelled at 13:05, after the 13:00 pass; brought back at 13:20): UNEXPLAINED",
    seed: [
      visit(appt(0xc2), "2026-11-03 13:00", { updated: "2026-11-02 13:20" }),
      runClaim(appt(0xc2), "24h", "2026-11-03 13:00"),
      audit(appt(0xc2), "appointment.update", "2026-11-02 13:05", '{"fromStatus":"scheduled","toStatus":"cancelled"}'),
      audit(appt(0xc2), "appointment.update", "2026-11-02 13:20", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
    ].join("\n"),
    want: only({ [`12 ${MON}`]: "FAIL", 13: "FAIL", 15: "OK" }),
    info: [[51, new RegExp(`${appt(0xc2)} \\| UNEXPLAINED`)]],
  },
  {
    name: "RK negative: an unknown status at a pass before the bring-back, with no save yet: UNEXPLAINED",
    seed: RK_SHAPE({ extra: audit(appt(0xc1), "appointment.update", "2026-11-02 13:10", '{"toStatus":"cancelled"}') }),
    want: only({ [`12 ${MON}`]: "FAIL", 13: "FAIL", 15: "OK" }),
    info: [[51, new RegExp(`${appt(0xc1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "RK negative: no pass had every old predicate true (a live sweep claim of the key before the mark): UNEXPLAINED",
    seed: [
      RK_SHAPE(),
      `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
         values ('${TENANT}', '${appt(0xc1)}', 'claim', '24h', 'sms', ${at("2026-11-03 13:00")}, ${at("2026-11-02 13:00")}, 'sweep', false, 2, ${at("2026-11-02 12:00")});`,
    ].join("\n"),
    want: only({ 6: "FAIL", [`12 ${MON}`]: "FAIL", 13: "FAIL", 15: "OK" }),
    info: [[51, new RegExp(`${appt(0xc1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 is unchanged: a visit with no scheduling save before any pass; its day REVIEW, verdict 16 OK (R8 is in R32's set)",
    seed: [
      visit(appt(0xc5), "2026-11-03 13:00", { saved: false }),
      audit(appt(0xc5), "appointment.update", "2026-11-03 13:30", '{"fromStatus":"scheduled","toStatus":"confirmed"}'),
      runClaim(appt(0xc5), "24h", "2026-11-03 13:00"),
    ].join("\n"),
    want: only({ [`12 ${MON}`]: "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xc5)} \\| ${re(R8_LABEL)}`)], [16, /with a label outside the set 0;/]],
  },
  {
    name: "R2 is unchanged: cancelled at its mark, never brought back; its day REVIEW, verdict 16 OK",
    seed: [visit(appt(0xc6), "2026-11-03 13:00", { status: "cancelled" }), runClaim(appt(0xc6), "24h", "2026-11-03 13:00", undefined, "suppressed", "status")].join("\n"),
    want: only({ [`12 ${MON}`]: "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xc6)} \\| R2 suppressed by the sleeping job as not remindable`)]],
  },
  {
    name: "R1 on a full day is outside R32's set: its day REVIEW, verdict 16 REVIEW naming it",
    seed: [
      visit(appt(0xc7), "2026-11-03 17:00", { bookedAt: "2026-11-03 16:05" }),
      runClaim(appt(0xc7), "24h", "2026-11-03 16:05"),
      moved(appt(0xc7), "2026-11-02 16:10", "2026-11-03 17:00", "2026-11-03 16:05"),
      both(appt(0xc7), "24h", "2026-11-03 17:00"),
    ].join("\n"),
    want: only({ [`12 ${MON}`]: "REVIEW", 15: "OK", 16: "REVIEW" }),
    info: [[16, /\(R1 1\)/], [31, /run_only: R1 moved after the claim, before the next pass \| 1 \|/]],
  },
  {
    name: "R5 on the partial Wednesday (a mark at 07:50, no pass since): printed, not judged by verdict 16",
    seed: [visit(appt(0xc8), "2026-11-05 07:50"), runClaim(appt(0xc8), "24h", "2026-11-05 07:50")].join("\n"),
    want: only({}),
    info: [[16, /with a label outside the set 0; window-edge labels on a partial day, not judged 1/]],
  },
  {
    name: "shadow only: the sleeping job's claim and ledger row for Tuesday's 24h SMS at 10:00 removed: a booked visit with neither is LR's shape, and rule 1b keeps it UNEXPLAINED",
    seed: `delete from public.reminder_dispatches where appointment_id = '${appt(5)}' and channel = 'sms';
           delete from public.reminder_claims where appointment_id = '${appt(5)}' and kind = 'claim' and offset_id = '24h';`,
    want: only({ [`12 ${TUE}`]: "FAIL", 13: "FAIL" }),
    info: [[50, new RegExp(`${appt(5)} \\| UNEXPLAINED`)], [27, new RegExp(`^shadow-only UNEXPLAINED, not LR, mark due 2026-11-03 10:00 24h sms \\| ${appt(5)} \\| LR failed on: ${PORTAL_4("booked at 2026-10-01 09:00:00")} \\| `)]],
  },
  {
    name: "shadow only, the claim alone removed: the ledger row stays, so S4 (a ledger row with no claim), not LR",
    seed: `delete from public.reminder_claims where appointment_id = '${appt(5)}' and kind = 'claim' and offset_id = '24h';`,
    want: only({ [`12 ${TUE}`]: "REVIEW", 16: "REVIEW" }),
    info: [[50, new RegExp(`${appt(5)} \\| S4 a ledger row with no claim`)], [16, /\(S4 1\)/]],
  },
  {
    name: "run only: the shadow row for Monday's 48h email at 10:00 removed (a booked visit, no save after the mark: not R8, not RK)",
    seed: dropShadow(5, "48h"),
    want: only({ [`11 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(5)} \\| UNEXPLAINED`)]],
  },
  {
    name: "sent with neither: a reminder send with no claim and no shadow row FAILs verdict 10, its day and 13",
    seed: [visit(appt(0xd2), "2026-11-04 15:30"), ledger(appt(0xd2), "24h", "2026-11-03 15:30:03")].join("\n"),
    want: only({ 10: "FAIL", [`12 ${TUE}`]: "FAIL", 13: "FAIL" }),
    info: [[52, new RegExp(`${appt(0xd2)} \\| UNEXPLAINED`)]],
  },
  {
    name: "Tuesday has no 48h mark at all, its visits start on Thursday: VACUOUS, never OK",
    seed: [dropShadow(7, "48h"), dropShadow(8, "48h"),
      `delete from public.reminder_dispatches where appointment_id in ('${appt(7)}', '${appt(8)}') and channel = 'email';
       delete from public.reminder_claims where appointment_id in ('${appt(7)}', '${appt(8)}') and offset_id = '48h';`].join("\n"),
    want: only({ [`11 ${TUE}`]: "VACUOUS" }),
  },
  {
    name: "CALENDAR: the same, with the closed weekday pointed at Thursday: OK by the calendar",
    seed: [dropShadow(7, "48h"), dropShadow(8, "48h"),
      `delete from public.reminder_dispatches where appointment_id in ('${appt(7)}', '${appt(8)}') and channel = 'email';
       delete from public.reminder_claims where appointment_id in ('${appt(7)}', '${appt(8)}') and offset_id = '48h';`].join("\n"),
    mutate: (s) => s.replace("extract(isodow from fd.d + om.minutes / 1440) = 7 as closed_start", "extract(isodow from fd.d + om.minutes / 1440) = 4 as closed_start"),
    want: only({}),
    info: [[11, /both 0; .*visits starting 2026-11-05, a Sunday: the clinics are closed \|/]],
  },
  {
    name: "R34's predicate on seeded send-mode rows (Sunday, after t0): 4 sweep-sent, 3 after a re-arming save, 1 R34, 2 outside",
    seed: R34_ROWS,
    want: only({ 6: "FAIL", 15: "OK" }),
    info: [[36, /\| 4, 3, 1, 2 \|/]],
  },
  { name: "missing heartbeat: Tuesday 12:00", seed: `delete from public.reminder_sweep_passes where pass_at = ${at("2026-11-03 12:00:03")};`, want: only({ [`3 ${TUE}`]: "FAIL" }) },
  {
    name: "a send heartbeat",
    seed: `insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
           values ('${TENANT}', 'run-send', 'send', ${at("2026-11-04 07:50:03")}, 0, 0, false, 0, ${at("2026-11-04 07:50:04")});`,
    want: only({ 6: "FAIL" }),
  },
  {
    name: "a pass over the ceiling on Monday",
    seed: `update public.reminder_sweep_passes set over_ceiling = true, due_count = recorded_count + 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-11-02 12:00:03")};`,
    want: only({ 7: "FAIL" }),
  },
  {
    name: "a heartbeat whose recorded count is one short",
    seed: `update public.reminder_sweep_passes set recorded_count = recorded_count - 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-11-02 10:00:03")};`,
    want: only({ 8: "FAIL" }),
  },
  { name: "a mark taken twice", seed: shadowRow(appt(3), "24h", "2026-11-03 10:00", "2026-11-02 10:15"), want: only({ 9: "FAIL" }) },
  {
    name: "a claim with no mark",
    seed: `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, taker, attempt, created_at)
           values ('${TENANT}', '${appt(6)}', 'claim', '72h', 'sms', ${at("2026-11-04 15:00")}, 'run', 1, ${at("2026-11-02 09:00")});`,
    want: only({ 10: "FAIL" }),
  },
  { name: "the read's clock at Wednesday 07:10: Tuesday is not closed, verdict 1 FAILs", seed: "", clock: "2026-11-04 07:10:00", want: only({ 1: "FAIL" }) },
  {
    name: "MUTANT (R20's): the shadow set is dead",
    seed: "",
    mutate: (s) => s.replace("from c_all where kind = 'shadow'\n", "from c_all where kind = 'shadow-dead'\n"),
    want: only({ ...allDays(11, "FAIL"), ...allDays(12, "FAIL"), 13: "FAIL" }),
  },
  {
    name: "MUTANT (R20's): the slot count is dead",
    seed: "",
    mutate: (s) => s.replace("and x.slot::time >= time '07:00' and x.slot::time <= time '21:45') as slots", "and false) as slots"),
    want: only({ ...allDays(3, "FAIL") }),
  },
];

/**
 * Each clause of RE_ARMING_SAVES, on a visit both sides took, written after the mark and before the
 * pass: a clause that counts makes the shadow's row a violation (verdict 15 FAIL); its near miss,
 * which R33 says re-arms nothing, leaves the base as it was.
 */
const CLAUSE_CASES = [
  ["booked: a booking row after the mark", true, { action: "appointment.create", metadata: `{"startsAt":"${iso("2026-11-04 16:30")}"}` }],
  ["accepted_in_pedidos: an online request accepted in Pedidos", true, { action: "appointment.update", metadata: '{"via":"portal_request_confirm"}' }],
  ["near miss: an update by another way", false, { action: "appointment.update", metadata: '{"via":"agenda"}' }],
  ["accepted_with_estado: an online request set to Confirmada", true, { origin: "patient_portal", action: "appointment.update", metadata: '{"fromStatus":"scheduled","toStatus":"confirmed"}' }],
  ["near miss: a booked visit set to Confirmada by hand (status only)", false, { action: "appointment.update", metadata: '{"fromStatus":"scheduled","toStatus":"confirmed"}' }],
  ["brought_back: Cancelada to Confirmada", true, { action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"confirmed"}' }],
  ["brought_back: Cancelada to Agendada on a booked visit", true, { action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"scheduled"}' }],
  ["near miss: Cancelada to Agendada on an online request", false, { origin: "patient_portal", action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"scheduled"}' }],
  ["accepted_in_sms_review: a review-queue confirmada applied on an online request", true, { origin: "patient_portal", action: "appointment.sms_reply_reviewed", metadata: '{"resolution":"confirmed","applied":true}' }],
  ["near miss: the same on a booked visit", false, { action: "appointment.sms_reply_reviewed", metadata: '{"resolution":"confirmed","applied":true}' }],
  ["near miss: the same on an online request, not applied", false, { origin: "patient_portal", action: "appointment.sms_reply_reviewed", metadata: '{"resolution":"confirmed","applied":false}' }],
  ["accepted_by_sms_reply: the patient's SMS confirmo on an online request", true, { origin: "patient_portal", action: "appointment.patient_sms_reply", metadata: '{"outcome":"confirmed"}' }],
  ["near miss: the patient's SMS confirmo on a booked visit", false, { action: "appointment.patient_sms_reply", metadata: '{"outcome":"confirmed"}' }],
  ["near miss: the patient's SMS cancel on an online request", false, { origin: "patient_portal", action: "appointment.patient_sms_reply", metadata: '{"outcome":"cancelled"}' }],
  ["near miss: a booking row written under another tenant", false, { action: "appointment.create", metadata: `{"startsAt":"${iso("2026-11-04 16:30")}"}`, tenant: OTHER_TENANT }],
];
for (const [name, counts, args] of CLAUSE_CASES) {
  CASES.push({
    name: `CLAUSE ${name}: ${counts ? "counts, the shadow's row after it FAILs verdict 15" : "re-arms nothing, the shadow takes the mark"}`,
    seed: CLAUSE_CASE(args),
    want: only(counts ? { 15: "FAIL" } : {}),
    info: counts ? [[15, /shadow rows taken after a re-arming save 1;/]] : [[15, /shadow rows taken after a re-arming save 0;/]],
  });
}

/**
 * The mutation sweep of this read's own predicates: each condition changed once, run on the case
 * that must kill it. `kills` names the unmutated case; the mutant must not meet its expectation, or
 * (for R34, whose result is a row and not a verdict) must not print its row.
 */

// ---- 2026-11-06: LATE-PASS, HARD-DELETE and LR, on the same base. ----

/** A ULID whose first 10 characters encode this Lisbon instant (WET, so the wall time is UTC). */
const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ulidAt = (lisbon) => {
  let ms = Date.parse(`${lisbon.replace(" ", "T")}Z`);
  let t = "";
  for (let i = 0; i < 10; i++) { t = CROCK[ms % 32] + t; ms = Math.floor(ms / 32); }
  return `${t}0000000000000000`;
};
/** Tuesday's 10:00 pass, both tenants, run late to 10:16:30, its pass id a ULID of `runAt` (or kept when null). */
const LATE = (runAt) => `
update public.reminder_sweep_passes set pass_at = ${at("2026-11-03 10:16:30")}${runAt ? `, pass_id = '${ulidAt(runAt)}'` : ""}
 where pass_at = ${at("2026-11-03 10:00:00")} + interval '3 seconds';`;

/**
 * F3's production shape: a visit starting Wednesday 19:00 whose 48h mark (Monday 19:00) and 24h
 * mark (Tuesday 19:00) both sides took, each in its own pass; hard-deleted Tuesday 20:00:01, after
 * both counts, which takes its claims, ledger rows and shadow rows with it. `record` writes the
 * audit row hardDeleteAppointment writes; `start` is the start that row records.
 */
const HD_ID = appt(0xf1);
const HD_SHAPE = ({ record = true, start = "2026-11-04 19:00", meta = null, extra = "" } = {}) => [
  visit(HD_ID, "2026-11-04 19:00"),
  both(HD_ID, "48h", "2026-11-04 19:00"),
  both(HD_ID, "24h", "2026-11-04 19:00"),
  extra,
  `delete from public.appointments where id = '${HD_ID}';`,
  record ? audit(HD_ID, "appointment.hard_delete", "2026-11-03 20:00:01", meta ?? JSON.stringify({ startsAt: iso(start), status: "scheduled" })) : "",
].join("\n");

/**
 * LR's shape (F4, re-ruled 2026-11-06 14:20): a visit booked on 10-01 (status scheduled) for
 * Wednesday 11:00 whose 48h mark (Monday 11:00) the shadow took in the 11:00 pass, with no claim
 * and no ledger row. `start` is the visit's start now, `booked` its booking row's start, `extra`
 * the case's own rows.
 */
const LR_APPT = appt(0xf8);
const LR_SHAPE = ({ start = "2026-11-04 11:00", visitOpts = {}, extra = [] } = {}) => [
  visit(LR_APPT, start, { bookedAt: "2026-11-04 11:00", ...visitOpts }),
  shadowRow(LR_APPT, "48h", "2026-11-04 11:00", "2026-11-02 11:00"),
  ...extra,
].join("\n");
const NOT_LR = (cond) => [[50, new RegExp(`${LR_APPT} \\| UNEXPLAINED`)], [27, new RegExp(`^shadow-only UNEXPLAINED, not LR, mark due 2026-11-02 11:00 48h email \\| ${LR_APPT} \\| LR failed on: ${cond} \\| information: verdict 13 FAILs on it \\| INFO$`)]];
const LR_UNEXPLAINED = only({ [`11 ${MON}`]: "FAIL", 13: "FAIL" });
/** confirmAppointmentRequest's row (actions.ts:3018 to 3028): snake-case keys, via portal_request_confirm. */
const PEDIDOS_ACCEPT = '{"changed":["status"],"scope":"one","from_status":"scheduled","to_status":"confirmed","via":"portal_request_confirm"}';
const COMPLETED = '{"fromStatus":"confirmed","toStatus":"completed"}';
/** The confirm code's rows (confirm-redeem.ts:373): a confirmation, and a refusal with its reason. */
const CODE_CONFIRMED = '{"via":"confirm_code"}';
const CODE_REFUSED = '{"via":"confirm_code","reason":"double_confirmed_refused"}';
/** A claim of the sleeping job for appt(0xf8), 48h email; `start` its start, `early` whether early. */
const lrClaim = (start, created, early) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${LR_APPT}', 'claim', '48h', 'email', ${at(start)}, ${at(dueOf(start, "48h"))}, 'run', ${early}, 1, ${at(created)});`;

CASES.push(
  {
    name: "LR: a booked visit's 48h mark the shadow took, with no claim and no ledger row, sendable, its start unchanged: LR, in R32's set, printed in row 26",
    seed: LR_SHAPE(),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [
      [50, new RegExp(`${LR_APPT} \\| ${re(LR_LABEL)}`)],
      [26, new RegExp(`^LR \\(lost run\\), mark due 2026-11-02 11:00 48h email \\| ${LR_APPT} \\| no claim, no ledger row; estado at the mark scheduled; start at the mark is the start now; planned by a save that sends appointment\\/scheduled \\(booked\\) at 2026-10-01 09:00:00 \\| information: in R32's accepted set, SOLO reads every one \\| INFO$`)],
      [16, /with a label outside the set 0; .*LR rows \(in the set, each in row 26\) 1 \| /],
      [11, /both 2; shadow only 1 \(unexplained 0\)/],
    ],
  },
  {
    name: "LR: confirmed by hand before the mark: the estado at the mark is confirmed; that save sends nothing, so the booking planned the run: LR",
    seed: LR_SHAPE({ extra: [audit(LR_APPT, "appointment.update", "2026-11-01 18:00", '{"fromStatus":"scheduled","toStatus":"confirmed"}')] }),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, /estado at the mark confirmed; start at the mark is the start now; planned by a save that sends appointment\/scheduled \(booked\) at 2026-10-01 09:00:00 \| /]],
  },
  {
    name: "LR: moved away and back after the mark: the start at the mark (the first move's fromStartsAt) is the start now (R33): LR",
    seed: LR_SHAPE({ extra: [moved(LR_APPT, "2026-11-02 12:00", "2026-11-04 14:00", "2026-11-04 11:00"), moved(LR_APPT, "2026-11-02 12:05", "2026-11-04 11:00", "2026-11-04 14:00")] }),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[50, new RegExp(`${LR_APPT} \\| ${re(LR_LABEL)}`)]],
  },
  {
    name: "LR negative 1: an early claim of the sleeping job for this mark and start: not LR, UNEXPLAINED",
    seed: LR_SHAPE({ extra: [lrClaim("2026-11-04 11:00", "2026-11-02 10:00", true)] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("1 a claim or a reminder ledger row of this mark exists"),
  },
  {
    name: "LR negative 1: a reminder ledger row of this mark (its claim was for another start, before t0, so not S4): not LR, UNEXPLAINED",
    seed: LR_SHAPE({ extra: [lrClaim("2026-11-03 09:00", "2026-11-01 09:00:02", false), ledger(LR_APPT, "48h", "2026-11-02 11:00:03")] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("1 a claim or a reminder ledger row of this mark exists"),
  },
  {
    name: "LR negative 2: cancelled before the mark, brought back after it: the estado at the mark (the status the next change left) is cancelled: not LR",
    seed: LR_SHAPE({ extra: [
      audit(LR_APPT, "appointment.update", "2026-11-01 18:00", '{"fromStatus":"scheduled","toStatus":"cancelled"}'),
      audit(LR_APPT, "appointment.update", "2026-11-02 12:00", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: cancelled\\)"),
  },
  {
    name: "LR negative 2: a booking row that records no status and no status change: the estado cannot be established: not LR",
    seed: LR_SHAPE({ visitOpts: { bookedStatus: null } }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: unknown\\)"),
  },
  {
    name: "LR negative 2: an online request not yet accepted at the mark (scheduled, origin patient_portal): not LR",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal" } }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: scheduled, an online request not accepted at the mark by the recorded rows\\)"),
  },
  {
    name: "LR negative 3: moved after the mark to another start: the start at the mark is not the start now: not LR",
    seed: LR_SHAPE({ start: "2026-11-04 14:00", extra: [moved(LR_APPT, "2026-11-02 12:00", "2026-11-04 14:00", "2026-11-04 11:00")] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("3 the start at the mark is not the start now, or cannot be read"),
  },
  {
    name: "LR negative 4: no save that sends appointment/scheduled at or before the mark (no booking row; an edit that re-arms nothing before it; a kept-start move and a confirmation after it): not LR",
    seed: LR_SHAPE({ visitOpts: { saved: false }, extra: [
      audit(LR_APPT, "appointment.update", "2026-11-01 18:00", '{"via":"agenda"}'),
      moved(LR_APPT, "2026-11-02 12:00", "2026-11-04 11:00", "2026-11-04 11:00"),
      audit(LR_APPT, "appointment.update", "2026-11-02 12:10", '{"fromStatus":"scheduled","toStatus":"confirmed"}'),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("4 no save that sends appointment\\/scheduled at or before the mark"),
  },
  // ---- The R4 review of 2026-11-06 (BLOCKER 1, MAJOR 2, MINOR): the request's acceptance, and the planner is a SENDING save. ----
  {
    name: "LR negative 2b (the review's seed): an online request moved by staff before the mark, accepted in Pedidos (snake-case keys) after it, completed later: not LR, conditions 2 and 4",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false, status: "completed" }, extra: [
      moved(LR_APPT, "2026-11-01 17:00", "2026-11-04 11:00", "2026-11-04 10:00"),
      audit(LR_APPT, "appointment.update", "2026-11-02 12:00", PEDIDOS_ACCEPT),
      audit(LR_APPT, "appointment.update", "2026-11-03 18:00", COMPLETED),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: scheduled, an online request not accepted at the mark by the recorded rows\\); 4 no save that sends appointment\\/scheduled at or before the mark"),
  },
  {
    name: "LR: the review's seed accepted in Pedidos BEFORE the mark (after the staff move, which sent nothing): accepted at the mark, planned by the acceptance: LR",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false, status: "completed" }, extra: [
      moved(LR_APPT, "2026-11-01 17:00", "2026-11-04 11:00", "2026-11-04 10:00"),
      audit(LR_APPT, "appointment.update", "2026-11-01 18:00", PEDIDOS_ACCEPT),
      audit(LR_APPT, "appointment.update", "2026-11-03 18:00", COMPLETED),
    ] }),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, /estado at the mark confirmed; start at the mark is the start now; planned by a save that sends appointment\/scheduled \(accepted_in_pedidos\) at 2026-11-01 18:00:00 \| /]],
  },
  {
    name: "LR: a booked visit accepted in Pedidos after the mark (a request known by its notification, origin staff): the estado at the mark is the snake-case from_status, scheduled: LR",
    seed: LR_SHAPE({ extra: [audit(LR_APPT, "appointment.update", "2026-11-02 12:00", PEDIDOS_ACCEPT)] }),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, /estado at the mark scheduled; start at the mark is the start now; planned by a save that sends appointment\/scheduled \(booked\) at 2026-10-01 09:00:00 \| /]],
  },
  {
    name: "LR negative 2c: an online request booked as scheduled whose next change, after the mark, leaves confirmed: no recorded acceptance at or before the mark: not LR, condition 2",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal" }, extra: [audit(LR_APPT, "appointment.update", "2026-11-03 18:00", COMPLETED)] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: confirmed, an online request not accepted at the mark by the recorded rows\\)"),
  },
  {
    name: "LR negative 2e: an online request whose only row is a booking row recording confirmed: a booking is not an acceptance: not LR, condition 2",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", bookedStatus: "confirmed" } }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: confirmed, an online request not accepted at the mark by the recorded rows\\)"),
  },
  {
    name: "LR negative 4b (the review's seed): no booking row, a hand-set Confirmada before the mark (sends nothing), a kept-start move after it: not LR, condition 4",
    seed: LR_SHAPE({ visitOpts: { saved: false }, extra: [
      audit(LR_APPT, "appointment.update", "2026-11-01 18:00", '{"fromStatus":"scheduled","toStatus":"confirmed"}'),
      moved(LR_APPT, "2026-11-02 12:00", "2026-11-04 11:00", "2026-11-04 11:00"),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("4 no save that sends appointment\\/scheduled at or before the mark"),
  },
  {
    name: "LR negative 4c: an online request moved while unaccepted, then accepted by a confirm code before the mark (neither sends): not LR, condition 4",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false }, extra: [
      moved(LR_APPT, "2026-11-01 17:00", "2026-11-04 11:00", "2026-11-04 10:00"),
      audit(LR_APPT, "appointment.confirm.sms_code", "2026-11-01 18:00", CODE_CONFIRMED),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("4 no save that sends appointment\\/scheduled at or before the mark"),
  },
  {
    name: "LR: an online request accepted by a confirm code, then moved before the mark (accepted at the move, so the move sends): LR, planned by the move",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false }, extra: [
      audit(LR_APPT, "appointment.confirm.sms_code", "2026-11-01 17:00", CODE_CONFIRMED),
      moved(LR_APPT, "2026-11-01 18:00", "2026-11-04 11:00", "2026-11-04 10:00"),
    ] }),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, /estado at the mark confirmed; start at the mark is the start now; planned by a save that sends appointment\/scheduled \(moved\) at 2026-11-01 18:00:00 \| /]],
  },
  {
    name: "LR negative 2d: a refused confirm code is no acceptance, and the move after it moves an unaccepted request: not LR, conditions 2 and 4",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false }, extra: [
      audit(LR_APPT, "appointment.confirm.sms_code", "2026-11-01 17:00", CODE_REFUSED),
      moved(LR_APPT, "2026-11-01 18:00", "2026-11-04 11:00", "2026-11-04 10:00"),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: no recorded row\\); 4 no save that sends appointment\\/scheduled at or before the mark"),
  },
  {
    name: "LR negative 2f: an online request accepted in Pedidos before the mark, moved (it sends), and accepted again after the mark from scheduled: the estado at the mark is scheduled, not LR, condition 2",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false }, extra: [
      audit(LR_APPT, "appointment.update", "2026-11-01 18:00", PEDIDOS_ACCEPT),
      moved(LR_APPT, "2026-11-01 19:00", "2026-11-04 11:00", "2026-11-04 10:00"),
      audit(LR_APPT, "appointment.update", "2026-11-02 12:00", PEDIDOS_ACCEPT),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("2 the estado at the mark is not sendable or not established \\(read: scheduled, an online request not accepted at the mark by the recorded rows\\)"),
  },
  {
    name: "LR negative 4d: an online request whose estado at its move is a word the read does not know (not established), accepted by a confirm code before the mark: the move sends nothing, not LR, condition 4",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false }, extra: [
      audit(LR_APPT, "appointment.update", "2026-11-01 16:00", '{"fromStatus":"scheduled","toStatus":"tentative"}'),
      moved(LR_APPT, "2026-11-01 17:00", "2026-11-04 11:00", "2026-11-04 10:00"),
      audit(LR_APPT, "appointment.confirm.sms_code", "2026-11-01 18:00", CODE_CONFIRMED),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("4 no save that sends appointment\\/scheduled at or before the mark"),
  },
  // ---- The R4 review of 2026-11-06, round 2 (MAJOR): the planning save must have planned the run FOR THE MARK'S START. ----
  {
    name: "LR negative 4e (round 2, the reviewer's seed): a request booked for 11-20, accepted in Pedidos (sends, plans for 11-20), cancelled, brought back to Agendada (a request again, sends nothing), moved while unaccepted to the mark's start (sends nothing), accepted by a confirm code (sends nothing): no run planned for that start: not LR, condition 4",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", status: "confirmed", bookedAt: "2026-11-20 11:00" }, extra: [
      audit(LR_APPT, "appointment.update", "2026-10-10 09:00", PEDIDOS_ACCEPT),
      audit(LR_APPT, "appointment.cancel", "2026-10-12 09:00", '{"fromStatus":"confirmed","toStatus":"cancelled"}'),
      audit(LR_APPT, "appointment.update", "2026-10-13 09:00", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
      moved(LR_APPT, "2026-10-14 09:00", "2026-11-04 11:00", "2026-11-20 11:00"),
      audit(LR_APPT, "appointment.confirm.sms_code", "2026-10-15 09:00", CODE_CONFIRMED),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("4 the last save that sends appointment\\/scheduled at or before the mark \\(accepted_in_pedidos at 2026-10-10 09:00:00\\) did not plan the run for the mark's start: the start in effect after it is another or cannot be read and a recorded start change after it, at or before the mark"),
  },
  {
    name: "LR (round 2's twin): the same history, but the request moved to the mark's start is accepted in Pedidos (it sends) before the mark: the acceptance planned the run for the new start: LR",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal", status: "confirmed", bookedAt: "2026-11-20 11:00" }, extra: [
      audit(LR_APPT, "appointment.update", "2026-10-10 09:00", PEDIDOS_ACCEPT),
      audit(LR_APPT, "appointment.cancel", "2026-10-12 09:00", '{"fromStatus":"confirmed","toStatus":"cancelled"}'),
      audit(LR_APPT, "appointment.update", "2026-10-13 09:00", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
      moved(LR_APPT, "2026-10-14 09:00", "2026-11-04 11:00", "2026-11-20 11:00"),
      audit(LR_APPT, "appointment.update", "2026-10-15 09:00", PEDIDOS_ACCEPT),
    ] }),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, /estado at the mark confirmed; start at the mark is the start now; planned by a save that sends appointment\/scheduled \(accepted_in_pedidos\) at 2026-10-15 09:00:00 \| /]],
  },
  {
    name: "LR negative 4f: the booking row records another start, and no recorded move brought the visit to the mark's start before the mark (it was moved away and back after it): the booking planned the run for another start: not LR, condition 4",
    seed: LR_SHAPE({ visitOpts: { bookedAt: "2026-11-20 11:00" }, extra: [moved(LR_APPT, "2026-11-02 12:00", "2026-11-04 14:00", "2026-11-04 11:00"), moved(LR_APPT, "2026-11-02 12:05", "2026-11-04 11:00", "2026-11-04 14:00")] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("4 the last save that sends appointment\\/scheduled at or before the mark \\(booked at 2026-10-01 09:00:00\\) did not plan the run for the mark's start: the start in effect after it is another or cannot be read"),
  },
  {
    name: "LR negative 4g: a request booked for the mark's start (the booking plans for it), moved away and back while unaccepted before the mark (neither move sends), accepted by a confirm code: a recorded start change after the planning save: not LR, condition 4",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal" }, extra: [
      moved(LR_APPT, "2026-10-20 09:00", "2026-11-04 14:00", "2026-11-04 11:00"),
      moved(LR_APPT, "2026-10-21 09:00", "2026-11-04 11:00", "2026-11-04 14:00"),
      audit(LR_APPT, "appointment.confirm.sms_code", "2026-10-22 09:00", CODE_CONFIRMED),
    ] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR("4 the last save that sends appointment\\/scheduled at or before the mark \\(booked at 2026-10-01 09:00:00\\) did not plan the run for the mark's start: a recorded start change after it, at or before the mark"),
  },
  {
    name: "LR: a request booked for the mark's start, a move that keeps the start while unaccepted (it sends nothing and changes no start), accepted by a confirm code before the mark: planned by the booking: LR",
    seed: LR_SHAPE({ visitOpts: { origin: "patient_portal" }, extra: [
      moved(LR_APPT, "2026-10-20 09:00", "2026-11-04 11:00", "2026-11-04 11:00"),
      audit(LR_APPT, "appointment.confirm.sms_code", "2026-10-22 09:00", CODE_CONFIRMED),
    ] }),
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, /estado at the mark confirmed; start at the mark is the start now; planned by a save that sends appointment\/scheduled \(booked\) at 2026-10-01 09:00:00 \| /]],
  },
  {
    name: "LATE-PASS: Tuesday's 10:00 pass ran at 10:16:30, its run time in slot 10:00: verdict 3 REVIEW on Tuesday",
    seed: LATE("2026-11-03 10:00:00.500"),
    want: only({ [`3 ${TUE}`]: "REVIEW" }),
    info: [[24, /^LATE-PASS on 2026-11-03, tenant 1: slot 10:00 has no heartbeat/], [24, /^LATE-PASS on 2026-11-03, tenant 2: slot 10:00 has no heartbeat/], [3, /of them complete but for LATE-PASS 2; .*late passes \(LATE-PASS, row 24\) 2/]],
  },
  { name: "LATE-PASS negative: the late pass's run time in slot 10:15 (a run created late): FAIL", seed: LATE("2026-11-03 10:16:00.000"), want: only({ [`3 ${TUE}`]: "FAIL" }) },
  { name: "LATE-PASS negative: a pass id that is not a ULID: FAIL", seed: LATE(null), want: only({ [`3 ${TUE}`]: "FAIL" }) },
  {
    name: "LATE-PASS negative: a failed pass, the other tenant's Tuesday 10:00 heartbeat gone, nothing doubled: FAIL",
    seed: `delete from public.reminder_sweep_passes where tenant_id = '${OTHER_TENANT}' and pass_at = ${at("2026-11-03 10:00:00")} + interval '3 seconds';`,
    want: only({ [`3 ${TUE}`]: "FAIL" }),
  },
  {
    name: "LATE-PASS negative: a third heartbeat in the doubled slot: FAIL",
    seed: LATE("2026-11-03 10:00:00.500") + `
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  values ('${OTHER_TENANT}', 'extra-1020', 'shadow', ${at("2026-11-03 10:20:00")}, 0, 0, false, 0, ${at("2026-11-03 10:20:00")});`,
    want: only({ [`3 ${TUE}`]: "FAIL" }),
  },
  {
    name: "HARD-DELETE: two heartbeats short by one, the visit's recorded hard delete after both counts: verdict 8 REVIEW",
    seed: HD_SHAPE(),
    want: only({ 8: "REVIEW" }),
    info: [
      [8, /HARD-DELETE \(row 25\): heartbeats short 2, of them short by exactly their tied marks 2, holding more rows than they count 0, rows short 2, marks tied 2; hard deletes recorded since t0 1, with a start that cannot be read 0/],
      [25, /^HARD-DELETE: heartbeat 2026-11-02 19:00:03, tenant 1, short 1, tied 1 \| 48h email mark 2026-11-02 19:00 of a visit starting 2026-11-04 19:00, deleted 2026-11-03 20:00:01, recorded in public\.audit_log row [0-9a-f-]{36} \(action appointment\.hard_delete; tenant_id, entity_type, entity_id, created_at, metadata startsAt\) \| information: short by exactly its tied marks/],
      [25, /^HARD-DELETE: heartbeat 2026-11-03 19:00:03, tenant 1, short 1, tied 1 \| 24h sms mark 2026-11-03 19:00 /],
    ],
  },
  { name: "HARD-DELETE negative: the same delete with no audit row (inferred, not recorded): FAIL", seed: HD_SHAPE({ record: false }), want: only({ 8: "FAIL" }) },
  { name: "HARD-DELETE negative: a recorded start that cannot be read: FAIL", seed: HD_SHAPE({ meta: '{"startsAt":"2026-11-04 19:00"}' }), want: only({ 8: "FAIL" }), info: [[8, /with a start that cannot be read 1/]] },
  { name: "HARD-DELETE negative: the recorded start an hour off (moved before the delete): FAIL", seed: HD_SHAPE({ start: "2026-11-04 18:00" }), want: only({ 8: "FAIL" }) },
  {
    name: "HARD-DELETE negative: a heartbeat short by 2 with one recorded delete: FAIL",
    seed: HD_SHAPE({ extra: [visit(appt(0xf2), "2026-11-04 19:00"), both(appt(0xf2), "48h", "2026-11-04 19:00"), `delete from public.appointments where id = '${appt(0xf2)}';`].join("\n") }),
    want: only({ 8: "FAIL" }),
  },
  {
    name: "HARD-DELETE negative: and a heartbeat holding more rows than it counts: FAIL",
    seed: HD_SHAPE() + `
update public.reminder_sweep_passes set recorded_count = recorded_count - 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-11-02 10:00:00")} + interval '3 seconds';`,
    want: only({ 8: "FAIL" }),
  },
  {
    name: "END_DAY 2026-11-04 read on Thursday 08:00: three full days, Wednesday's heartbeats short, its agreement VACUOUS",
    seed: "", end: "2026-11-04", clock: "2026-11-05 08:00:00",
    want: { ...only({}), "3 2026-11-04": "FAIL", "11 2026-11-04": "VACUOUS", "12 2026-11-04": "VACUOUS" },
    info: [[1, /at or after 2026-11-05 07:15:00/], [20, /\| 2026-11-02 to 2026-11-04 \(3\) \|/]],
  },
  { name: "END_DAY 2026-11-04 read on Wednesday 08:00: the end day is not closed, verdict 1 FAILs", seed: "", end: "2026-11-04", want: { ...only({ 1: "FAIL" }), "3 2026-11-04": "FAIL", "11 2026-11-04": "VACUOUS", "12 2026-11-04": "VACUOUS" } },
);

// Every case above on LR's shape isolates one of LR's other predicates, so it runs with rule 1b off.
for (const c of CASES) {
  if (!c.mutate && typeof c.seed === "string" && c.seed.includes(LR_APPT)) {
    c.rewrite = RULE_1B_OFF;
    c.name += " (rule 1b off)";
  }
}

// ---- The R4 review of 2026-11-06, round 3 (MAJOR): a start change no audit row records. Closed as a class: rule 1. ----

/**
 * A staff notification as persistingConsumer writes it (apps/api/lib/notifications/centre.ts:176 to
 * 195): `kind`, the two starts and the instant the patient acted. The throwaway drops the table's
 * foreign keys to people first (no synthetic person is made).
 */
const staffNote = (when, from, to, { kind = "rescheduled", id = LR_APPT } = {}) => `
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.staff_notifications'::regclass and contype = 'f' loop
    execute format('alter table public.staff_notifications drop constraint %I', c);
  end loop;
end $$;
insert into public.staff_notifications (tenant_id, recipient_user_id, kind, appointment_id, patient_id, previous_starts_at, new_starts_at, occurred_at)
  values ('${TENANT}', gen_random_uuid(), '${kind}', '${id}', gen_random_uuid(), ${at(from)}, ${at(to)}, ${at(when)});`;
/** The importer's ledger row naming a visit it wrote (upsert.ts, markImported). */
const stagingRow = (id, source = "synthetic-1") => `
insert into public.migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id, status, imported_entity_id)
  values ('${TENANT}', gen_random_uuid(), 'synthetic', 'appointment', '${source}', 'imported', '${id}');`;
/**
 * The reviewer's seed (round 3): an online request booked for 11-20 11:00 (the portal writes no
 * booking row); moved by staff while unaccepted to A, the mark's start (it sends nothing); moved by
 * the patient in the portal to B (no audit row, no event); accepted in Pedidos (it sends B: the run
 * is planned for B); B's 48h mark taken by the run and by the shadow; moved by the patient back to
 * A before A's mark. The recorded rows read the acceptance as planning A, and A is the start now:
 * the old condition 4 accepted it. `notes` writes the two portal moves' staff notifications.
 */
const LR_A = "2026-11-04 11:00";
const LR_B = "2026-11-04 09:00";
const ROUND3 = ({ notes = true } = {}) => LR_SHAPE({ visitOpts: { origin: "patient_portal", saved: false, status: "confirmed" }, extra: [
  moved(LR_APPT, "2026-10-20 09:00", LR_A, "2026-11-20 11:00"),
  notes ? staffNote("2026-10-21 09:00", LR_A, LR_B) : "",
  audit(LR_APPT, "appointment.update", "2026-10-22 09:00", PEDIDOS_ACCEPT),
  both(LR_APPT, "48h", LR_B),
  notes ? staffNote("2026-11-02 10:00", LR_B, LR_A) : "",
] });
const ROUND3_PLANNER = "accepted_in_pedidos at 2026-10-22 09:00:00";
const BOOKED_PLANNER = "booked at 2026-10-01 09:00:00";

CASES.push(
  {
    name: "LR rule 1b: a booked visit's 48h mark the shadow took, with no claim and no ledger row, sendable, its start unchanged, under the read as it ships: the patient could have moved it in the portal after its booking, so UNEXPLAINED, condition 4",
    seed: LR_SHAPE(),
    want: LR_UNEXPLAINED,
    info: NOT_LR(PORTAL_4(BOOKED_PLANNER)),
  },
  {
    name: "LR negative 4h (round 3, the reviewer's seed): a request moved by staff to A while unaccepted, by the patient to B, accepted in Pedidos (sends B), B's run sent, moved by the patient back to A: not LR, condition 4, rules 1a and 1b",
    seed: ROUND3(),
    want: LR_UNEXPLAINED,
    info: NOT_LR(`${NOTIFIED_4}; ${PORTAL_4(ROUND3_PLANNER)}`),
  },
  {
    name: "LR negative 4h, rule 1a alone (rule 1b off): the portal moves' staff notifications keep it out",
    seed: ROUND3(),
    rewrite: RULE_1B_OFF,
    want: LR_UNEXPLAINED,
    info: NOT_LR(NOTIFIED_4),
  },
  {
    name: "LR negative 4i (round 3, the reviewer's seed with no staff notification, as when the notification resolves no recipient): not LR, condition 4, rule 1b",
    seed: ROUND3({ notes: false }),
    want: LR_UNEXPLAINED,
    info: NOT_LR(PORTAL_4(ROUND3_PLANNER)),
  },
  {
    name: "LR 4i with rule 1b off: the old false accept, which rule 1b exists for (no recorded row shows the portal moves)",
    seed: ROUND3({ notes: false }),
    rewrite: RULE_1B_OFF,
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, new RegExp(`^LR \\(lost run\\), mark due 2026-11-02 11:00 48h email \\| ${LR_APPT} \\| no claim, no ledger row; estado at the mark confirmed; start at the mark is the start now; planned by a save that sends appointment\\/scheduled \\(accepted_in_pedidos\\) at 2026-10-22 09:00:00 \\| `)]],
  },
  {
    name: "LR negative 4j (round 3): a visit the importer wrote (a staging row names it): not LR, condition 4, rules 1c and 1b",
    seed: LR_SHAPE({ extra: [stagingRow(LR_APPT)] }),
    want: LR_UNEXPLAINED,
    info: NOT_LR(`${IMPORTED_4}; ${PORTAL_4(BOOKED_PLANNER)}`),
  },
  {
    name: "LR negative 4j, rule 1c alone (rule 1b off): the importer's row keeps it out",
    seed: LR_SHAPE({ extra: [stagingRow(LR_APPT)] }),
    rewrite: RULE_1B_OFF,
    want: LR_UNEXPLAINED,
    info: NOT_LR(IMPORTED_4),
  },
  {
    name: "LR (round 3, rule 1b off): a staff notification of another kind before the mark, portal moves away and back only after it, another visit's portal move before it, and a staging row of another visit: none is this mark's unrecorded start change: LR",
    seed: LR_SHAPE({ extra: [
      staffNote("2026-11-01 18:00", LR_A, LR_A, { kind: "confirmed" }),
      staffNote("2026-11-02 12:00", LR_A, "2026-11-04 14:00"),
      staffNote("2026-11-02 12:05", "2026-11-04 14:00", LR_A),
      staffNote("2026-11-01 18:00", "2026-11-02 10:00", "2026-11-02 15:00", { id: appt(1) }),
      stagingRow(appt(1)),
    ] }),
    rewrite: RULE_1B_OFF,
    want: only({ [`11 ${MON}`]: "REVIEW" }),
    info: [[26, new RegExp(`\\| ${LR_APPT} \\| no claim, no ledger row; estado at the mark scheduled; .*\\(booked\\) at 2026-10-01 09:00:00 \\| `)]],
  },
);

// ---- THE F4 EXCEPTION (strategy, 2026-11-06 16:30, option A): one named shadow-only mark accepted; row 29. ----

/**
 * F4X OFF, for every case that sets no exception (every case above): the read as it ships REFUSES
 * without exactly one entry naming an UNEXPLAINED shadow-only mark, so those cases run with the
 * setting read replaced by an empty text and row 28's refusal by its count. Every F4 exception case
 * below sets the setting and runs the read as it ships (rule 1b on).
 */
const F4X_READ = "current_setting('osteojp.r47_f4x')";
const F4X_REFUSAL = "case when f.problem is null then f.accepted else ('F4XSTOP ' || f.problem)::int end";
const F4X_OFF = (s) => {
  for (const t of [F4X_READ, F4X_REFUSAL]) assert.equal(s.split(t).length, 2, `F4X off: not written exactly once: ${t}`);
  return s.replace(F4X_READ, "''::text").replace(F4X_REFUSAL, "f.accepted");
};
/** The named mark: a booked visit for Thursday 11-05 10:00 whose 48h email mark (Tuesday 11-03 10:00) only the shadow took. */
const F4X_APPT = appt(0xf4);
const F4X_OTHER = appt(0xf5);
const F4X_START = "2026-11-05 10:00";
const F4X_SHAPE = (start = F4X_START) => [
  visit(F4X_APPT, start, { bookedAt: start }),
  shadowRow(F4X_APPT, "48h", start, dueOf(start, "48h")),
].join("\n");
const F4X_OK = `${F4X_APPT},48h,email,2026-11-03 10:00`;
const F4X_WANT = only({ [`11 ${TUE}`]: "REVIEW" });
/** Row 28 as the read prints it: the count only, never an id; `cand` is row 29's count. */
const ROW28 = (cand, accepted = 1) => [28, new RegExp(`^F4 EXCEPTION ${accepted} \\(ruling 11-06\\) \\| the shadow-only mark the exception file names, accepted under F4X \\(rows 16, 31 and 50\\); shadow-only marks that fail rule 1b alone \\(row 29, UNEXPLAINED\\) ${cand} \\| information: the count only, never the id \\| INFO$`)];
const ROW29 = (id, mark, planner) => [29, new RegExp(`^shadow-only UNEXPLAINED, rule 1b alone, mark due ${mark} 48h email \\| ${id} \\| passes conditions 1, 2 and 3 and every part of condition 4 but rule 1b; planned by a save that sends appointment\\/scheduled \\(${re(planner).replace(" at ", "\\) at ")} \\| information: UNEXPLAINED, verdict 13 FAILs on it; strategy rules on each by name \\| INFO$`)];
const REFUSE_LINES = (n) => new RegExp(`F4XSTOP the exception file holds ${n} lines, not exactly one entry`);
const REFUSE_FORM = /F4XSTOP the entry is not of the form <appointment id>,48h,email,2026-11-03 10:00/;
const REFUSE_STALE = /F4XSTOP the entry names no shadow-only mark this read leaves UNEXPLAINED in the window \(a stale exception\): 0 accepted/;
/** A case of LR's shape that fails one predicate AND rule 1b, with the exception set: not in row 29. */
const NEAR = (caseName, what) => {
  const base = CASES.find((c) => c.name.startsWith(caseName) && !c.mutate);
  assert.ok(base, `no case named ${caseName}`);
  assert.deepEqual(base.want, LR_UNEXPLAINED, `${caseName} is not an UNEXPLAINED LR shape`);
  return { name: `F4X row 29 near miss, ${what} and rule 1b: not in row 29`, seed: `${base.seed}\n${F4X_SHAPE()}`, f4x: F4X_OK, want: { ...LR_UNEXPLAINED, [`11 ${TUE}`]: "REVIEW" }, info: [ROW28(0)] };
};

CASES.push(
  {
    name: "F4X: the exception names the one shadow-only mark (11-03 10:00, 48h email, a booked visit that fails rule 1b alone): F4X, its day REVIEW, verdicts 13 and 16 OK, row 28 prints the count 1 and no id",
    seed: F4X_SHAPE(),
    f4x: F4X_OK,
    want: F4X_WANT,
    info: [
      ROW28(0),
      [50, new RegExp(`^shadow_only 2026-11-03 10:00 48h email \\| ${F4X_APPT} \\| ${re(F4X_LABEL)} \\| `)],
      [16, /with a label outside the set 0; .*F4X \(in the set by the F4 exception only, row 28\) 1; LR rows \(in the set, each in row 26\) 0 \| /],
      [11, /^11\. agreement, marks due 2026-11-03, 48h email.*\| both 2; shadow only 1 \(unexplained 0\)/],
      [31, new RegExp(`^mismatch label, marks due 2026-11-03, 48h email, shadow_only: ${re(F4X_LABEL)} \\| 1 \\| `)],
    ],
  },
  {
    name: "F4X: the same mark with no exception (F4X off): UNEXPLAINED, verdict 13 FAILs, and row 29 prints it (rule 1b alone)",
    seed: F4X_SHAPE(),
    want: only({ [`11 ${TUE}`]: "FAIL", 13: "FAIL" }),
    info: [ROW29(F4X_APPT, "2026-11-03 10:00", BOOKED_PLANNER), ROW28(1, 0)],
  },
  {
    name: "F4X with a mark that fails rule 1b alone: the exception accepts its one mark, row 29 prints the other with its id, mark and planning save, and verdict 13 still FAILs",
    seed: `${F4X_SHAPE()}\n${LR_SHAPE()}`,
    f4x: F4X_OK,
    want: only({ [`11 ${TUE}`]: "REVIEW", [`11 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [ROW28(1), ROW29(LR_APPT, "2026-11-02 11:00", BOOKED_PLANNER), NOT_LR(PORTAL_4(BOOKED_PLANNER))[1], [50, new RegExp(`${F4X_APPT} \\| ${re(F4X_LABEL)}`)]],
  },
  { name: "F4X refused: two entries, the named mark's and another id's", seed: F4X_SHAPE(), f4x: `${F4X_OK}\n${F4X_OTHER},48h,email,2026-11-03 10:00`, refused: REFUSE_LINES(2) },
  { name: "F4X refused: two entries, the same line twice", seed: F4X_SHAPE(), f4x: `${F4X_OK}\n${F4X_OK}`, refused: REFUSE_LINES(2) },
  { name: "F4X refused: the entry and a trailing empty line", seed: F4X_SHAPE(), f4x: `${F4X_OK}\n`, refused: REFUSE_LINES(2) },
  { name: "F4X refused: malformed, semicolons for commas", seed: F4X_SHAPE(), f4x: F4X_OK.replaceAll(",", ";"), refused: REFUSE_FORM },
  { name: "F4X refused: malformed, another offset and channel (24h sms)", seed: F4X_SHAPE(), f4x: F4X_OK.replace("48h,email", "24h,sms"), refused: REFUSE_FORM },
  { name: "F4X refused: malformed, another time (10:15)", seed: F4X_SHAPE(), f4x: F4X_OK.replace("10:00", "10:15"), refused: REFUSE_FORM },
  { name: "F4X refused: malformed, a fifth field after the time", seed: F4X_SHAPE(), f4x: `${F4X_OK},more`, refused: REFUSE_FORM },
  { name: "F4X refused: malformed, a character before the id", seed: F4X_SHAPE(), f4x: `x${F4X_OK}`, refused: REFUSE_FORM },
  { name: "F4X refused: malformed, an upper-case id", seed: F4X_SHAPE(), f4x: F4X_OK.toUpperCase().replace("48H,EMAIL", "48h,email"), refused: REFUSE_FORM },
  { name: "F4X refused: malformed, empty", seed: F4X_SHAPE(), f4x: "", refused: REFUSE_FORM },
  { name: "F4X refused: the entry names no shadow-only mark: the named mark is on both sides now (a stale exception)", seed: `${visit(F4X_APPT, F4X_START)}\n${both(F4X_APPT, "48h", F4X_START)}`, f4x: F4X_OK, refused: REFUSE_STALE },
  { name: "F4X refused: the entry names another visit than the shadow-only mark's", seed: F4X_SHAPE(), f4x: F4X_OK.replace(F4X_APPT, F4X_OTHER), refused: REFUSE_STALE },
  { name: "F4X refused: the named visit's shadow-only mark is another mark (its 48h of 11-02 15:30)", seed: F4X_SHAPE("2026-11-04 15:30"), f4x: F4X_OK, refused: REFUSE_STALE },
  { name: "F4X refused: the named mark is shadow-only but R20 labels it (S4: its ledger row kept), not UNEXPLAINED", seed: `${F4X_SHAPE()}\n${ledger(F4X_APPT, "48h", "2026-11-03 10:00:03")}`, f4x: F4X_OK, refused: REFUSE_STALE },
  NEAR("LR negative 1: an early claim", "a claim of this mark (condition 1)"),
  NEAR("LR negative 2: cancelled before the mark", "cancelled at the mark (condition 2)"),
  NEAR("LR negative 3", "moved after the mark (condition 3)"),
  NEAR("LR negative 4:", "no sending save (condition 4)"),
  NEAR("LR negative 4f", "the planned start another (condition 4)"),
  NEAR("LR negative 4g", "a recorded start change after the planning save (condition 4)"),
  NEAR("LR negative 4h (round 3", "a portal move's staff notification (rule 1a)"),
  NEAR("LR negative 4j (round 3)", "an importer row (rule 1c)"),
);

const MUTANTS_1106 = [
  ["LATE-PASS without the run time", "                    and x.run_slot = d.slot)\n),\nhb_day3 as (", "                    and true)\n),\nhb_day3 as (", "LATE-PASS negative: the late pass's run time in slot 10:15"],
  ["verdict 3's REVIEW arm takes any gap", "when v.tenants_ok + v.tenants_late = v.tenants then 'REVIEW'", "when true then 'REVIEW'", "LATE-PASS negative: a failed pass"],
  ["HARD-DELETE ties to the LAST pass", "order by m.audit_id, m.offset_id, h.pass_at, h.created_at", "order by m.audit_id, m.offset_id, h.pass_at desc, h.created_at desc", "HARD-DELETE: two heartbeats short by one"],
  ["HARD-DELETE explains any shortfall with a tie", "(select count(*) from hd_acct where short > 0 and short = tied) as explained", "(select count(*) from hd_acct where short > 0 and tied > 0) as explained", "HARD-DELETE negative: a heartbeat short by 2"],
  ["LR condition 1 without the claim", "and c.kind = 'claim' and c.offset_id = m.offset_id and c.channel = m.channel\n                         and c.starts_at = m.starts_at)", "and false)", "LR negative 1: an early claim"],
  ["LR condition 1 without the ledger row", "and x.created_at >= m.due_at - interval '10 minutes')) as c1,", "and false)) as c1,", "LR negative 1: a reminder ledger row"],
  ["LR condition 2 takes any estado", "and (st.status_at_mark in ('scheduled', 'confirmed')", "and (true or st.status_at_mark in ('scheduled', 'confirmed')", "LR negative 2: cancelled before the mark"],
  ["LR condition 2 reads the status the change after the mark SET", "                 then (select v.from_status from lr_ev v", "                 then (select v.to_status from lr_ev v", "LR negative 2: cancelled before the mark"],
  ["LR condition 2 takes an unknown status as scheduled", "              then z.to_status else 'unknown' end as to_status", "              then z.to_status else 'scheduled' end as to_status", "LR negative 2: a booking row that records no status"],
  ["LR condition 2 without the request gate", "and (not m.pedido_origin\n                       or (st.status_at_mark", "and (true\n                       or (st.status_at_mark", "LR negative 2: an online request"],
  ["LR condition 2 takes a request as accepted with no recorded acceptance", " and rc.kind_rec = 'change' and rc.status_rec = 'confirmed')), false) as c2,", ")), false) as c2,", "LR negative 2c"],
  ["LR condition 2 takes a booking row as the recorded acceptance", "and rc.kind_rec = 'change' and rc.status_rec", "and rc.status_rec", "LR negative 2e"],
  ["LR condition 2 takes a request as accepted when the estado at the mark is not confirmed", "or (st.status_at_mark = 'confirmed' and rc.kind_rec", "or (st.status_at_mark in ('scheduled', 'confirmed') and rc.kind_rec", "LR negative 2f"],
  ["lr_ev reads only the camelCase toStatus", "select coalesce(l.metadata->>'toStatus', l.metadata->>'to_status') as ts,", "select l.metadata->>'toStatus' as ts,", "LR: the review's seed accepted in Pedidos BEFORE the mark"],
  ["lr_ev reads only the camelCase fromStatus", "coalesce(l.metadata->>'fromStatus', l.metadata->>'from_status') as fs) s", "l.metadata->>'fromStatus' as fs) s", "LR: a booked visit accepted in Pedidos after the mark"],
  ["lr_ev without the confirm code", "\n              or (l.action = 'appointment.confirm.sms_code' and l.metadata->>'reason' is null)", "", "LR: an online request accepted by a confirm code"],
  ["lr_ev's confirm code sets no status", "when l.action = 'appointment.confirm.sms_code' then 'confirmed'", "when l.action = 'appointment.confirm.sms_code' then null", "LR: an online request accepted by a confirm code"],
  ["lr_ev reads a refused confirm code as a confirmation", "or (l.action = 'appointment.confirm.sms_code' and l.metadata->>'reason' is null)", "or (l.action = 'appointment.confirm.sms_code')", "LR negative 2d"],
  ["LR condition 3 without the start now", "coalesce(e.start_at_mark = m.iso_start and m.start_now = m.iso_start, false) as c3,", "coalesce(e.start_at_mark = m.iso_start, false) as c3,", "LR negative 3"],
  ["LR condition 4 takes a save after the mark", "         and r.created_at <= m.due_at\n", "         and true\n", "LR negative 4b"],
  ["LR condition 4 takes a save after the mark, on the first negative", "         and r.created_at <= m.due_at\n", "         and true\n", "LR negative 4:"],
  // A status-only save as the planner: on 4b (no booking row) the start check now also keeps it out, so this
  // mutant is killed by what row 27 prints there, and by row 26's planner on the hand-confirmed booked visit.
  ["LR condition 4 counts any audit row (a status-only save plans)", "select r.created_at as plan_at, r.clause as plan_clause, r.to_start as plan_to_start\n        from rearm_rows r\n", "select r.created_at as plan_at, r.clause as plan_clause, r.to_start as plan_to_start\n        from (select l.id, l.tenant_id, l.entity_id as appointment_id, l.created_at, 'any'::text as clause, null::text as to_start from public.audit_log l) r\n", "LR negative 4b", null, NOT_LR("4 no save that sends appointment\\/scheduled at or before the mark")[1]],
  ["LR condition 4 counts any audit row, on the hand-confirmed booked visit", "select r.created_at as plan_at, r.clause as plan_clause, r.to_start as plan_to_start\n        from rearm_rows r\n", "select r.created_at as plan_at, r.clause as plan_clause, r.to_start as plan_to_start\n        from (select l.id, l.tenant_id, l.entity_id as appointment_id, l.created_at, 'any'::text as clause, null::text as to_start from public.audit_log l) r\n", "LR: confirmed by hand before the mark", null, [26, /\(booked\) at 2026-10-01 09:00:00/]],
  // Round 2: the planning save planned the run FOR THE MARK'S START.
  ["LR condition 4 without the start match", "          and coalesce(ps.plan_start = m.iso_start, false)\n", "          and true\n", "LR negative 4f"],
  ["LR condition 4 without the start change after the planning save", "          and not ps.start_changed\n", "          and true\n", "LR negative 4g"],
  ["LR condition 4 reads no start for a status save that sends", "then pl.plan_to_start\n                  else (select b.to_start from rearm_rows b", "then pl.plan_to_start\n                  else (select null::text from rearm_rows b", "LR (round 2's twin)"],
  ["LR condition 4 reads a status save's start at the mark, not at the save", "and b.clause in ('booked', 'moved') and b.created_at <= pl.plan_at", "and b.clause in ('booked', 'moved') and b.created_at <= m.due_at", "LR negative 4e", null, NOT_LR("4 the last save that sends appointment\\/scheduled at or before the mark \\(accepted_in_pedidos at 2026-10-10 09:00:00\\) did not plan the run for the mark's start: the start in effect after it is another or cannot be read and a recorded start change after it, at or before the mark")[1]],
  ["LR condition 4's start change counts a move that keeps the start", "and n.clause = 'moved' and n.from_start is distinct from n.to_start", "and n.clause = 'moved'", "LR: a request booked for the mark's start, a move that keeps"],
  ["LR condition 4's start change counts the planning move itself", "and n.created_at > pl.plan_at and n.created_at <= m.due_at", "and n.created_at >= pl.plan_at and n.created_at <= m.due_at", "LR: an online request accepted by a confirm code, then moved"],
  ["LR condition 4's start change counts a move after the mark", "and n.created_at > pl.plan_at and n.created_at <= m.due_at", "and n.created_at > pl.plan_at", "LR: moved away and back after the mark"],
  ["LR condition 4 counts a move of an unaccepted request", "and (r.clause <> 'moved' or not m.pedido_origin\n", "and (true or not m.pedido_origin\n", "LR negative 4c"],
  ["LR condition 4 reads the estado after the move", "                              and v.created_at <= r.created_at\n", "                              and true\n", "LR negative 4c"],
  ["LR condition 4 counts a move with no recorded estado", "not in ('scheduled', 'unknown'), false))", "not in ('scheduled', 'unknown'), true))", "LR negative 4c"],
  ["LR condition 4 counts a move of a request whose estado was not established", "not in ('scheduled', 'unknown'), false))", "not in ('scheduled'), false))", "LR negative 4d"],
  ["rows 26 and 27 print the EARLIEST sending save, not the planner", "order by r.created_at desc, r.id desc limit 1) pl on true", "order by r.created_at, r.id limit 1) pl on true", "S8 negative: the same move 31 seconds", null, [27, /\(moved at 2026-11-02 12:44:29\)/]],
  ["pcl drops LR condition 2", "and lr.c1 and lr.c2 and lr.c3 and lr.c4)", "and lr.c1 and lr.c3 and lr.c4)", "LR negative 2: cancelled before the mark"],
  ["pcl drops LR condition 4", "and lr.c1 and lr.c2 and lr.c3 and lr.c4)", "and lr.c1 and lr.c2 and lr.c3)", "LR negative 4"],
  // Round 3: rule 1, each arm and each of its bounds.
  ["rule 1b dropped from condition 4", RULE_1B, "          and true) as c4", "LR rule 1b: a booked visit's 48h mark"],
  ["rule 1b dropped from condition 4, on the reviewer's seed with no staff notification", RULE_1B, "          and true) as c4", "LR negative 4i"],
  ["rule 1b reads an empty window", RULE_1B_DEF, "             pl.plan_at > m.due_at as portal_window) ps on true", "LR negative 4i"],
  ["rule 1a dropped", "          and not ux.portal_notified\n", "          and true\n", "LR negative 4h, rule 1a alone"],
  ["rule 1a reads a staff notification of any kind", "and sn.kind = 'rescheduled' and sn.occurred_at <= m.due_at", "and sn.occurred_at <= m.due_at", "LR (round 3, rule 1b off)"],
  ["rule 1a reads a portal move after the mark", "and sn.kind = 'rescheduled' and sn.occurred_at <= m.due_at", "and sn.kind = 'rescheduled'", "LR (round 3, rule 1b off)"],
  ["rule 1a reads another visit's notification", "where sn.tenant_id = m.tenant_id and sn.appointment_id = m.appointment_id", "where sn.tenant_id = m.tenant_id", "LR (round 3, rule 1b off)"],
  ["rule 1c dropped", "          and not ux.importer_touched\n", "          and true\n", "LR negative 4j, rule 1c alone"],
  ["rule 1c reads another visit's staging row", "where s.tenant_id = m.tenant_id and s.imported_entity_id = m.appointment_id", "where s.tenant_id = m.tenant_id", "LR (round 3, rule 1b off)"],
  ["LR outside R32's set", "(select count(*) from lab where letter not in ('R2', 'R4', 'R8', 'S5', 'LR', 'F4X')\n", "(select count(*) from lab where letter not in ('R2', 'R4', 'R8', 'S5', 'F4X')\n", "LR: a booked visit's 48h mark"],
  // THE F4 EXCEPTION. Strategy's two (R4): accept two entries; accept an entry with no matching mark.
  ["F4X accepts two entries", "when c.lines <> 1 then", "when c.lines < 1 then", "F4X refused: two entries, the named mark's and another id's"],
  ["F4X accepts two entries, on the same line twice", "when c.lines <> 1 then", "when c.lines < 1 then", "F4X refused: two entries, the same line twice"],
  ["F4X accepts an entry with no matching mark", "when c.accepted <> 1 then", "when false then", "F4X refused: the entry names no shadow-only mark: the named mark is on both sides"],
  ["F4X accepts an entry with no matching mark, on another visit's id", "when c.accepted <> 1 then", "when false then", "F4X refused: the entry names another visit"],
  ["F4X's match without the appointment id", "where x.appointment_id = p.appointment_id::text\n", "where true\n", "F4X refused: the entry names another visit"],
  ["F4X's match without the mark", "and x.offset_id = p.offset_id and x.channel = p.channel and x.due_at = p.due_at)", ")", "F4X refused: the named visit's shadow-only mark is another mark"],
  ["F4X on a mark R20 labels", "when p.side = 'shadow_only' and p.category = 'UNEXPLAINED'\n                   and exists (select 1 from f4x_entry x", "when p.side = 'shadow_only'\n                   and exists (select 1 from f4x_entry x", "F4X refused: the named mark is shadow-only but R20 labels it"],
  ["F4X's form without its end anchor", ",48h,email,2026-11-03 10:00$'", ",48h,email,2026-11-03 10:00'", "F4X refused: malformed, a fifth field"],
  ["F4X's form takes any offset and channel", ",48h,email,2026-11-03 10:00$'", ",[a-z0-9]+,[a-z]+,2026-11-03 10:00$'", "F4X refused: malformed, another offset"],
  ["F4X's form takes any time", ",48h,email,2026-11-03 10:00$'", ",48h,email,2026-11-03 [0-9:]+$'", "F4X refused: malformed, another time"],
  ["F4X's form takes an upper-case id", "t.f4x_text ~ '^[0-9a-f]{8}", "t.f4x_text ~* '^[0-9a-f]{8}", "F4X refused: malformed, an upper-case id"],
  ["F4X's malformed check dropped", "when c.malformed > 0 then", "when false then", "F4X refused: malformed, a fifth field"],
  ["F4X outside R32's set", "                   where letter not in ('R2', 'R4', 'R8', 'S5', 'LR', 'F4X')\n", "                   where letter not in ('R2', 'R4', 'R8', 'S5', 'LR')\n", "F4X: the exception names the one shadow-only mark", null, [16, /with a label outside the set 0; /]],
  ["F4X outside R32's set, verdict 16's count", "(select count(*) from lab where letter not in ('R2', 'R4', 'R8', 'S5', 'LR', 'F4X')\n", "(select count(*) from lab where letter not in ('R2', 'R4', 'R8', 'S5', 'LR')\n", "F4X: the exception names the one shadow-only mark"],
  // Row 29: every part of LR but rule 1b, on a mark that stays UNEXPLAINED.
  ["row 29 lists nothing", "     and l.c1 and l.c2 and l.c3\n", "     and false\n", "F4X with a mark that fails rule 1b alone", null, ROW28(1)],
  ["row 29 without condition 1", "     and l.c1 and l.c2 and l.c3\n", "     and l.c2 and l.c3\n", "F4X row 29 near miss, a claim of this mark", null, ROW28(0)],
  ["row 29 without condition 2", "     and l.c1 and l.c2 and l.c3\n", "     and l.c1 and l.c3\n", "F4X row 29 near miss, cancelled at the mark", null, ROW28(0)],
  ["row 29 without condition 3", "     and l.c1 and l.c2 and l.c3\n", "     and l.c1 and l.c2\n", "F4X row 29 near miss, moved after the mark", null, ROW28(0)],
  ["row 29 without condition 4's start match", "     and coalesce(l.plan_start = l.iso_start, false)\n", "     and true\n", "F4X row 29 near miss, the planned start another", null, ROW28(0)],
  ["row 29 without condition 4's start match, on no sending save", "     and coalesce(l.plan_start = l.iso_start, false)\n", "     and true\n", "F4X row 29 near miss, no sending save", null, ROW28(0)],
  ["row 29 without condition 4's start change", "     and not l.start_changed\n", "     and true\n", "F4X row 29 near miss, a recorded start change", null, ROW28(0)],
  ["row 29 without rule 1a", "     and not l.portal_notified\n", "     and true\n", "F4X row 29 near miss, a portal move's staff notification", null, ROW28(0)],
  ["row 29 without rule 1c", "     and not l.importer_touched\n", "     and true\n", "F4X row 29 near miss, an importer row", null, ROW28(0)],
  ["row 29 lists a mark that is not UNEXPLAINED (the F4X mark itself)", "   where p.category = 'UNEXPLAINED'\n     and l.c1 and l.c2 and l.c3\n", "   where true\n     and l.c1 and l.c2 and l.c3\n", "F4X: the exception names the one shadow-only mark", null, ROW28(0)],
];

const MUTANTS = [
  ["row 37 without early", "     and c.early = true\n", "", "row 37", null, [37, /\| 1 \|/]],
  ["row 37 without the day-after bound", "     and c.due_at >= (select (((t1 at time zone 'Europe/Lisbon')::date + 1) + time '07:00') at time zone 'Europe/Lisbon' from clock)\n", "", "row 37", null, [37, /\| 1 \|/]],
  ["row 37 counts a released claim", "from clock)\n     and not exists (select 1 from public.reminder_claims rl\n                      where rl.tenant_id = c.tenant_id and rl.appointment_id = c.appointment_id\n                        and rl.kind = 'release' and rl.claim_id = c.id)\n     and (select x.outcome", "from clock)\n     and (select x.outcome", "row 37", null, [37, /\| 1 \|/]],
  ["row 37 counts a claim with no send", "order by x.created_at, x.id limit 1) = 'sent'\n),\npre_t0 as (", "order by x.created_at, x.id limit 1) is distinct from 'x'\n),\npre_t0 as (", "row 37", null, [37, /\| 1 \|/]],
  ["every move counts (the start-at-the-mark rule dead)", "and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)", "and true", "a move that keeps the start, after the mark and before the pass"],
  ["every move counts, on the run-only case: RK would name a kept start", "and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)", "and true", "a move that keeps the start, after the mark, and NO shadow row"],
  ["rule 1 reads the LATEST move after the mark", "order by n.created_at, n.id limit 1", "order by n.created_at desc, n.id desc limit 1", "moved away and back after the mark"],
  ["rule 2 dead", "and b.clause in ('booked', 'moved') and b.created_at <= p.mark", "and false", "a kept-start move whose fromStartsAt is null"],
  ["a save AT the mark counts", "and r.created_at > p.mark and r.created_at <= p.upto\n", "and r.created_at >= p.mark and r.created_at <= p.upto\n", "a re-arming save written AT the mark exactly"],
  ["brought_back without its origin condition", "or (l.metadata->>'toStatus' = 'scheduled' and a.origin <> 'patient_portal'))", "or (l.metadata->>'toStatus' = 'scheduled'))", "RK negative: brought back to scheduled on an online request"],
  ["accepted_with_estado without its origin condition", "and l.metadata->>'toStatus' = 'confirmed' and a.origin = 'patient_portal'\n               then 'accepted_with_estado'", "and l.metadata->>'toStatus' = 'confirmed'\n               then 'accepted_with_estado'", "CLAUSE near miss: a booked visit set to Confirmada by hand"],
  ["accepted_in_sms_review without applied", "and l.metadata->>'applied' = 'true' and a.origin = 'patient_portal'", "and a.origin = 'patient_portal'", "CLAUSE near miss: the same on an online request, not applied"],
  ["accepted_by_sms_reply without its origin condition", "and l.metadata->>'outcome' = 'confirmed'\n                  and a.origin = 'patient_portal'\n", "and l.metadata->>'outcome' = 'confirmed'\n", "CLAUSE near miss: the patient's SMS confirmo on a booked visit"],
  ["the visit's own tenant dropped", "join public.appointments a on a.id = l.entity_id and a.tenant_id = l.tenant_id\n     where l.entity_type = 'appointment'\n       and l.entity_id in (select appointment_id from probe)", "join public.appointments a on a.id = l.entity_id\n     where l.entity_type = 'appointment'\n       and l.entity_id in (select appointment_id from probe)", "CLAUSE near miss: a booking row written under another tenant", (s) => s.replace("where r.tenant_id = p.tenant_id and r.appointment_id = p.appointment_id\n", "where r.appointment_id = p.appointment_id\n")],
  ["RK without a pass where every old predicate held", "where pr.uk = u.uk and pr.in_range and pr.every = 'T' and e.rearmed)", "where pr.uk = u.uk and pr.in_range)", "RK negative: no pass had every old predicate true"],
  ["RK lets a pass with every old predicate true and no save through", "pr.in_range and pr.every <> 'F' and not coalesce(e.rearmed, false))", "pr.in_range and pr.every <> 'F' and false)", "RK negative: a pass with every old predicate true before any re-arming save"],
  ["RK lets an unknown pass with no save through", "pr.in_range and pr.every <> 'F' and not coalesce(e.rearmed, false))", "pr.in_range and pr.every = 'T' and not coalesce(e.rearmed, false))", "RK negative: an unknown status at a pass"],
  ["verdict 2 without the Monday-mark condition, the sleeping job's alone", " or w.monday_one_side > 0 or w.old_moves_late > 0 then 'FAIL'", " or w.old_moves_late > 0 then 'FAIL'", "the deploy at Monday 06:50 and a Monday mark due before t0, the sleeping job's alone"],
  ["verdict 2 without the Monday-mark condition, the shadow's alone", " or w.monday_one_side > 0 or w.old_moves_late > 0 then 'FAIL'", " or w.old_moves_late > 0 then 'FAIL'", "the deploy at Monday 06:50 and a Monday mark due before t0, the shadow's alone"],
  ["verdict 2 FAILs a Monday mark on both sides", " or w.monday_one_side > 0 or w.old_moves_late > 0 then 'FAIL'", " or w.monday_before_t0 > 0 or w.old_moves_late > 0 then 'FAIL'", "the deploy at Monday 06:50 and a Monday mark due before t0, on both sides"],
  ["verdict 2 without the old-code-move condition", " or w.monday_one_side > 0 or w.old_moves_late > 0 then 'FAIL'", " or w.monday_one_side > 0 then 'FAIL'", "a move without fromStartsAt at DEPLOYED_AT + 13 hours exactly"],
  ["the 13 hours exclusive", "l.created_at >= k.resync + interval '13 hours' and not (", "l.created_at > k.resync + interval '13 hours' and not (", "a move without fromStartsAt at DEPLOYED_AT + 13 hours exactly"],
  ["the 13 hours at 12", "l.created_at >= k.resync + interval '13 hours' and not (", "l.created_at >= k.resync + interval '12 hours' and not (", "a move without fromStartsAt one second before DEPLOYED_AT + 13 hours"],
  ["verdict 15 FAILs on any S5 row again", "when taken_after_save > 0 then 'FAIL'", "when s5_rows > 0 or taken_after_save > 0 then 'FAIL'", "S5K: an unaccepted request"],
  ["an S5 row with no re-arming save stays in R32's set", "then 'S5K'", "then 'S5'", "S5K: an unaccepted request"],
  ["the shadow probe reads only marks due since t0", "(c.due_at >= win.t0 or c.created_at >= win.t0c) and c.due_at <= win.t1", "c.due_at >= win.t0 and c.due_at <= win.t1", "a shadow row written since t0 for a mark due before it"],
  ["S8 at 5 minutes", "v.created_at >= p.due_at - interval '30 seconds' and v.created_at <= p.due_at", "v.created_at >= p.due_at - interval '5 minutes' and v.created_at <= p.due_at", "S8 negative: the same move 31 seconds before the mark"],
  ["S8 counts any save", "exists (select 1 from rearm_rows v\n", "exists (select 1 from (select l.tenant_id, l.entity_id as appointment_id, l.created_at from public.audit_log l) v\n", "S8 negative: a status-only save"],
  ["the calendar arm without its Sunday", "when a.closed_start and a.matched = 0 and a.shadow_only = 0 and a.run_only = 0 then 'OK'", "when a.matched = 0 and a.shadow_only = 0 and a.run_only = 0 then 'OK'", "Tuesday has no 48h mark at all"],
  ["verdict 16 judges the window-edge labels of a partial day", "and (full_day or letter not in ('R5', 'S7'))) as outside", "and true) as outside", "R5 on the partial Wednesday"],
  ["verdict 15's FAIL dead", "when taken_after_save > 0 then 'FAIL'", "when false then 'FAIL'", "R24 violated"],
  ["verdict 15's control dead", "(select count(*) from subj) as subjects", "0 as subjects", "R24 held"],
  ["R34's cap at 5 hours", "<= s.due_at + interval '3 hours' as is_r34", "<= s.due_at + interval '5 hours' as is_r34", "R34's predicate", null, [36, /\| 4, 3, 1, 2 \|/]],
  ["R34 without the claim before the first save", "and c0.id <> s.id and c0.created_at <= e.first_rearm_at)", "and c0.id <> s.id)", "R34's predicate", null, [36, /\| 4, 3, 1, 2 \|/]],
];
for (const m of MUTANTS_1106) MUTANTS.push(m);
for (const [what, from, to, caseName, more, infoKill] of MUTANTS) {
  const base = CASES.find((c) => c.name.startsWith(caseName) && !c.mutate);
  assert.ok(base, `no case named ${caseName}`);
  CASES.push({
    name: `MUTANT: ${what}, on "${caseName}"`,
    seed: base.seed,
    f4x: base.f4x,
    rewrite: base.rewrite,
    deployed: base.deployed,
    end: base.end,
    clock: base.clock,
    mutate: (s) => {
      assert.equal(s.split(from).length, 2, `the mutated text is not written exactly once: ${from}`);
      const m = s.replace(from, () => to); // literal: a `$` in a mutant is SQL, not a replacement pattern
      return more ? more(m) : m;
    },
    kills: infoKill ? undefined : base.name,
    killsInfo: infoKill,
  });
}

const PGURL = process.env.SHADOW_COMPARE_1106_TEST_PGURL;

test("the read on a local database: every verdict flips on its own seeded fault, every label names its shape, every mutant dies", { skip: PGURL ? false : "SHADOW_COMPARE_1106_TEST_PGURL is not set" }, () => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: SHADOW_COMPARE_1106_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psql = (target, args, input) => {
    const r = spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
    return r;
  };
  const ok = (r) => { assert.equal(r.status, 0, `psql failed: ${r.stderr}`); return r.stdout; };
  const admin = (statement) => ok(psql(PGURL, ["-c", statement]));
  const BASE = "shadowcompare1106_test_base";
  const CASE_DB = "shadowcompare1106_test_case";
  admin(`drop database if exists ${BASE}`);
  admin(`create database ${BASE}`);
  const work = mkdtempSync(join(tmpdir(), "shadowcompare1106-db-"));
  const results = [];
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    // The schema is loaded leniently (a role or extension the lane has may be missing here); the
    // tables the read and the seed use must then exist, which the seed proves by running strictly.
    spawnSync("psql", [dbUrl(BASE), "-X", "-q"], { encoding: "utf8", input: dump.stdout, maxBuffer: 64 * 1024 * 1024 });
    ok(psql(dbUrl(BASE), [], SEED));
    const runRead = (db, text, deployed, end = "2026-11-03", f4x = null) => {
      const file = join(work, "read.sql");
      writeFileSync(file, text);
      const set = [[GUC, deployed], [GUC_END, end], [GUC_F4X, f4x]].filter(([, v]) => v !== null).flatMap(([g, v]) => ["-c", `set local ${g} = '${v}'`]);
      return psql(dbUrl(db), ["-A", "-t", "-F", "\u001f", "-c", "begin read only", "-c", "set local statement_timeout = '120s'", ...set, "-f", file, "-c", "rollback"]);
    };
    const withClock = (clock) => {
      const t = sql.replace(CLOCK_LINE, `  select timestamptz '${clock} Europe/Lisbon' as t1`);
      assert.notEqual(t, sql, "the clock line was not replaced");
      return t;
    };
    // Without any of its three settings the read, as it ships, stops with an error and prints no table.
    for (const [args, g] of [[[null, "2026-11-03", F4X_OK], GUC], [[DEPLOYED, null, F4X_OK], GUC_END], [[DEPLOYED, "2026-11-03", null], GUC_F4X]]) {
      const r = runRead(BASE, withClock(READ_CLOCK), ...args);
      assert.notEqual(r.status, 0, `the read ran without ${g}`);
      assert.match(r.stderr, new RegExp(`unrecognized configuration parameter "${g.replace(".", "\\.")}"`));
      assert.doesNotMatch(r.stdout, /\u001fOK$|\u001fFAIL$/m, `a verdict printed without ${g}`);
      results.push(`${g} unset: the read stops with an error, no table`);
    }
    for (const c of CASES) {
      admin(`drop database if exists ${CASE_DB}`);
      admin(`create database ${CASE_DB} template ${BASE}`);
      if (c.seed) ok(psql(dbUrl(CASE_DB), [], c.seed));
      let text = withClock(c.clock ?? READ_CLOCK);
      if (c.f4x === undefined) text = F4X_OFF(text);
      if (c.rewrite) text = c.rewrite(text);
      if (c.mutate) {
        const mutated = c.mutate(text);
        assert.notEqual(mutated, text, `${c.name}: the mutant changed nothing`);
        text = mutated;
      }
      const run = runRead(CASE_DB, text, c.deployed ?? DEPLOYED, c.end ?? "2026-11-03", c.f4x ?? null);
      const refusedBy = c.refused ?? (c.kills ? CASES.find((u) => u.name === c.kills).refused : undefined);
      if (refusedBy) {
        // A refusal: an error starting F4XSTOP, no table, and no appointment id in it. A mutant of a
        // refusing case is killed when it does not refuse for the same reason.
        if (c.kills) {
          assert.ok(run.status === 0 || !refusedBy.test(run.stderr), `${c.name}: the mutant SURVIVES: it refuses as the unmutated case does`);
          results.push(`${c.name}: ${run.status === 0 ? "ran, no refusal" : `refused otherwise: ${(run.stderr.match(/F4XSTOP[^"]*/) || [run.stderr.trim()])[0]}`}`);
        } else {
          assert.notEqual(run.status, 0, `${c.name}: the read did not refuse\n${run.stdout}`);
          assert.match(run.stderr, refusedBy, `${c.name}: not the refusal expected`);
          assert.doesNotMatch(run.stdout, /\u001f(OK|REVIEW|VACUOUS|FAIL|INFO)$/m, `${c.name}: a row printed with the refusal`);
          for (const id of [F4X_APPT, F4X_OTHER]) assert.ok(!run.stderr.toLowerCase().includes(id) && !run.stdout.toLowerCase().includes(id), `${c.name}: the refusal prints an appointment id`);
          results.push(`${c.name}: refused, ${run.stderr.match(/F4XSTOP[^"]*/)[0]}`);
        }
        admin(`drop database ${CASE_DB}`);
        continue;
      }
      const out = ok(run);
      const rows = out.split("\n").filter(Boolean).map((l) => l.split("\u001f")).filter((r) => r.length === 5);
      const verdictRows = rows.filter((r) => r[4] !== "INFO");
      const verdicts = Object.fromEntries(verdictRows.map((r) => [keyOf(r), r[4]]));
      assert.equal(verdictRows.length, Object.keys(verdicts).length, `${c.name}: a verdict key printed twice\n${out}`);
      results.push(`${c.name}: ${verdictRows.map((r) => `${keyOf(r)}=${r[4]}`).filter((s) => !s.endsWith("=OK")).join(", ") || "all OK"}`);
      if (c.want) assert.deepEqual(verdicts, c.want, `${c.name}: verdicts\n${out}`);
      if (c.kills) {
        const unmutated = CASES.find((u) => u.name === c.kills);
        assert.notDeepStrictEqual(verdicts, unmutated.want, `${c.name}: the mutant SURVIVES: it meets the unmutated case's expectation`);
      }
      if (c.killsInfo) {
        const [n, rx] = c.killsInfo;
        assert.ok(!rows.some((r) => Number(r[0]) === n && rx.test(r.slice(1).join(" | "))), `${c.name}: the mutant SURVIVES: row ${n} still reads ${rx}`);
      }
      for (const [n, rx] of c.info ?? []) {
        assert.ok(rows.some((r) => Number(r[0]) === n && rx.test(r.slice(1).join(" | "))), `${c.name}: no row ${n} matching ${rx}\n${out}`);
      }
      admin(`drop database ${CASE_DB}`);
    }
  } finally {
    if (process.env.SHADOW_COMPARE_1106_TEST_REPORT) writeFileSync(process.env.SHADOW_COMPARE_1106_TEST_REPORT, results.join("\n") + "\n");
    rmSync(work, { recursive: true, force: true });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${CASE_DB}`], { encoding: "utf8" });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE}`], { encoding: "utf8" });
  }
});

