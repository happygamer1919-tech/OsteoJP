// staff-10-v2-data-op.test.mjs - the STAFF-10 v2 held data op: properties of its
// FILES, which is the half a machine can hold without a database. The behaviour
// is rehearsed on a throwaway and recorded in docs/data-op-staff-10-v2.md.
//
// Nothing here asserts a production count, and nothing here may: the op's sets
// are derived at run time, so any number in this file would be a claim about
// data that moves.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");

const F1 = "scripts/data/staff-10-v2-1-read.sql";
const F2 = "scripts/data/staff-10-v2-2-write.sql";
const F3 = "scripts/data/staff-10-v2-3-verify.sql";
const GUARD = "scripts/assert-production-target.mjs";
const DOCF = "docs/data-op-staff-10-v2.md";
const S1 = read(F1);
const S2 = read(F2);
const S3 = read(F3);
const DOC = read(DOCF);
const STAFF10 = read("packages/db/scripts/staff-10-jp-split-lv.mjs");
const STAFF11 = read("packages/db/scripts/staff-11-jp-one-clinic-check.mjs");
const NESA1 = read("scripts/data/nesa-split-1-move.sql");

/** SQL with line comments stripped, so a word in a comment never passes for code. */
const code = (s) => s.replace(/--.*$/gm, "");

/** The fenced block under the "## <heading>" whose text starts with `prefix`. */
function block(prefix) {
  const lines = DOC.split("\n");
  const at = lines.findIndex((l) => l.startsWith("## ") && l.slice(3).startsWith(prefix));
  assert.ok(at >= 0, `no heading starting "${prefix}"`);
  const open = lines.findIndex((l, i) => i > at && l === "```");
  const close = lines.findIndex((l, i) => i > open && l === "```");
  return lines.slice(open + 1, close).join("\n");
}

const BEGIN = "-- >>> STAFF-10 V2 SETS BEGIN";
const END = "-- <<< STAFF-10 V2 SETS END";
function sets(sql, label) {
  const a = sql.indexOf(BEGIN);
  const b = sql.indexOf(END);
  assert.ok(a >= 0 && b > a, `${label} has no SETS block`);
  assert.equal(sql.indexOf(BEGIN, a + 1), -1, `${label} has two SETS blocks`);
  return sql.slice(a, b + END.length);
}
const SETS = sets(S1, "stage 1");

const IDS = {
  JP_CB: "54d486e0-a9c3-4c82-acac-8b909ce5a2d0",
  JP_LV: "0c1a0000-0000-4000-8000-000000000001",
  LV: "de000002-0000-0000-0000-000000000001",
  CB: "de000002-0000-0000-0000-000000000002",
};
const NESA = { c_cb_row: "0c1a0000-0000-4000-8000-000000000002", c_lv_row: "bdc466d7-f81f-4f8c-aa2e-b85194d73e1a" };
const ACTION = "staff.staff10_v2.apply";

/* ---- the ids ------------------------------------------------------------- */

test("the JP and clinic ids are STAFF-10's and STAFF-11's, and the NESA ids are NESA-SPLIT's", () => {
  for (const [name, value] of Object.entries(IDS)) {
    const pick = (src) => src.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1];
    assert.equal(pick(STAFF10), value, `${name} differs from the STAFF-10 script`);
    assert.equal(pick(STAFF11), value, `${name} differs from the STAFF-11 check`);
    for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3], ["the doc", DOC]]) {
      assert.ok(sql.includes(value), `${name} is missing from ${label}`);
    }
  }
  for (const [name, value] of Object.entries(NESA)) {
    assert.match(NESA1, new RegExp(`${name}\\s+constant uuid := '${value}'`), `${name} differs from NESA-SPLIT`);
    for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3], ["the doc", DOC]]) {
      assert.ok(sql.includes(value), `${name} is missing from ${label}`);
    }
  }
});

/* ---- what each stage may write ------------------------------------------- */

const ANY_WRITE = /\b(insert\s+into|update\s+[a-z_.]+(\s+[a-z_]+)?\s+set|delete\s+from|truncate|alter\s+table|drop\s+|create\s+(table|function|trigger|index|view|policy))/i;

test("stage 1 and stage 3 write nothing, and each runs in a READ ONLY transaction it rolls back", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 3", S3]]) {
    assert.doesNotMatch(code(sql), ANY_WRITE, `${label} contains a write statement`);
    assert.match(code(sql), /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;/, `${label} is not READ ONLY`);
    assert.match(code(sql), /\nROLLBACK;\n/, `${label} does not roll back`);
    assert.doesNotMatch(code(sql), /\bCOMMIT\b/, `${label} commits`);
  }
});

test("stage 2's writes are exactly the whitelist, nothing more", () => {
  const found = [...code(S2).matchAll(/\b(update\s+public\.[a-z_]+\s+set\s+[a-z_0-9]+|delete\s+from\s+public\.[a-z_]+|insert\s+into\s+public\.[a-z_]+)/gi)]
    .map((m) => m[1].replace(/\s+/g, " ").toLowerCase());
  assert.deepEqual(found, [
    "update public.availability_templates set is_active",
    "update public.availability_templates set user_id",
    "delete from public.time_off",
    "update public.appointments set practitioner_id",
    "update public.appointments set practitioner_id",
    "update public.appointments set practitioner_2_id",
    "update public.appointments set status",
    "insert into public.audit_log",
  ]);
  const everyWrite = [...code(S2).matchAll(new RegExp(ANY_WRITE.source, "gi"))];
  assert.equal(everyWrite.length, found.length, `stage 2 has a write outside the whitelist: ${everyWrite.map((m) => m[0]).join(" | ")}`);
  for (const t of ["clinical_records", "clinical_episodes", "attachments", "invoices", "users", "staff_locations"]) {
    assert.doesNotMatch(code(S2), new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+public\\.${t}\\b`, "i"), `stage 2 writes ${t}`);
  }
});

test("every appointment update sets updated_at, and every write is followed by its ROW_COUNT", () => {
  const c = code(S2);
  const updates = [...c.matchAll(/UPDATE public\.appointments SET [^;]*;/g)].map((m) => m[0]);
  assert.equal(updates.length, 4);
  for (const u of updates) assert.match(u, /updated_at = now\(\)/, `an appointment update does not set updated_at: ${u.slice(0, 80)}`);
  const writes = [...c.matchAll(/\b(UPDATE public\.|DELETE FROM public\.|INSERT INTO public\.)/g)].map((m) => m.index);
  writes.forEach((at, i) => {
    const next = writes[i + 1] ?? c.length;
    const diag = c.indexOf("GET DIAGNOSTICS v_n = ROW_COUNT;", at);
    assert.ok(diag > at && diag < next, `write ${i + 1} is not followed by its ROW_COUNT before the next write`);
  });
});

test("stage 2 is ONE DO block inside ONE REPEATABLE READ transaction", () => {
  assert.equal((S2.match(/\bDO \$/g) ?? []).length, 1, "stage 2 is not exactly one DO block");
  assert.equal((S2.match(/^END \$s10v2\$;$/gm) ?? []).length, 1);
  const c = code(S2);
  const begin = c.indexOf("BEGIN ISOLATION LEVEL REPEATABLE READ;");
  const doAt = c.indexOf("DO $s10v2$");
  const commit = c.indexOf("\nCOMMIT;\n");
  assert.ok(begin >= 0 && begin < doAt && doAt < commit, "the DO block is not between BEGIN and COMMIT");
  for (const s of [S1, S3]) assert.equal((s.match(/\bDO \$/g) ?? []).length, 0);
});

/* ---- the sets and their defects ------------------------------------------ */

test("stage 1 and stage 2 compute every set with the SAME bytes", () => {
  assert.equal(sets(S2, "stage 2"), SETS, "the SETS block drifted between stage 1 and stage 2");
});

test("is_dated has ONE definition, NULL-safe, and every dated test in every file is guarded", () => {
  const defs = SETS.match(/AS is_dated/g) ?? [];
  assert.equal(defs.length, 1, "is_dated is defined more than once");
  assert.ok(
    SETS.includes("(av.valid_from IS NOT NULL AND av.valid_until IS NOT NULL AND av.valid_from = av.valid_until) AS is_dated"),
    "is_dated is not the NULL-safe form",
  );
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    for (const m of code(sql).matchAll(/([a-z0-9_]+)\.valid_from\s*=\s*([a-z0-9_]+)\.valid_until/g)) {
      if (m[1] !== m[2]) continue;
      const guard = `${m[1]}.valid_from IS NOT NULL AND ${m[1]}.valid_until IS NOT NULL AND ${m[0]}`;
      const lead = code(sql).slice(Math.max(0, m.index - guard.length + m[0].length), m.index + m[0].length);
      assert.equal(lead, guard, `${label}: an unguarded dated test: ${m[0]}`);
    }
  }
});

test("the move set requires the DATE to be a Saturday, not only the weekday column", () => {
  const move = SETS.match(/\) AS f_move/)?.index;
  assert.ok(move > 0);
  const def = SETS.slice(SETS.lastIndexOf("(NOT (c.is_dated", move), move);
  assert.match(def, /c\.weekday = 6 AND extract\(dow FROM c\.valid_from\)::int = 6/);
  assert.match(def, /c\.is_dated/);
});

test("the classes are six, and UNCLASSIFIED refuses", () => {
  for (const f of ["f_cov", "f_past", "f_move", "f_phan", "f_win", "f_unc"]) assert.ok(SETS.includes(`AS ${f}`), `class ${f} is missing`);
  assert.match(SETS, /'R09', 'an active JP\(cb\) Linda-a-Velha row is UNCLASSIFIED/);
  assert.match(SETS, /c\.f_cov::int \+ c\.f_past::int \+ c\.f_move::int \+ c\.f_phan::int \+ c\.f_win::int \+ c\.f_unc::int\) <> 1/);
});

test("the 30 September block predicate is the OVERLAP form, in both files that read it", () => {
  const from = "(DATE '2026-09-30')::timestamp AT TIME ZONE 'Europe/Lisbon' AS blk_from";
  const to = "(DATE '2026-10-01')::timestamp AT TIME ZONE 'Europe/Lisbon' AS blk_to";
  for (const [label, sql] of [["the SETS block", SETS], ["stage 3", S3]]) {
    assert.ok(sql.includes(from) && sql.includes(to), `${label} does not define the 30 September window`);
    assert.match(sql, /t\.starts_at < k\.blk_to AND t\.ends_at > k\.blk_from/, `${label} is not the overlap form`);
  }
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    assert.doesNotMatch(sql, /::date\s*<=\s*DATE '2026-09-30'/, `${label} still carries the old date-cast predicate`);
  }
});

test("the collision refusal counts the MOVE set only", () => {
  const r05 = SETS.slice(SETS.indexOf("'R05'"), SETS.indexOf("'R06'"));
  assert.match(r05, /WHERE c\.f_move/);
  assert.doesNotMatch(r05, /c\.f_cov/);
});

test("the pedido and the conflict rule are INLINE: no stage calls the jwt-scoped functions", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    assert.doesNotMatch(code(sql), /public\.is_unconfirmed_pedido\s*\(/, `${label} calls is_unconfirmed_pedido`);
    assert.doesNotMatch(code(sql), /public\.appointment_conflicts\s*\(/, `${label} calls appointment_conflicts`);
    assert.doesNotMatch(code(sql), /jwt_tenant_id\s*\(/, `${label} reads jwt_tenant_id`);
  }
  for (const [label, sql] of [["SETS", SETS], ["stage 2", S2], ["stage 3", S3]]) {
    assert.match(sql, /a\.origin = 'patient_portal'/, `${label} has no inline pedido test`);
    assert.match(sql, /sn\.kind = 'appointment_request'/, `${label} has no inline pedido test`);
  }
});

test("a past pair ruling (b) moves must sit at one clinic, and section 6 prints both clinics", () => {
  const r29 = SETS.slice(SETS.indexOf("'R29'"), SETS.indexOf("'R30'"));
  assert.match(r29, /tw\.is_past AND tw\.n_id IN \(SELECT x\.id FROM x\)\s+AND tw\.p_loc IS DISTINCT FROM tw\.n_loc/, "R29 does not refuse a two-clinic pair ruling (b) moves");
  assert.match(S1, /'person_clinic', lp\.name/, "section 6 does not carry the person row's clinic");
  assert.match(S1, /e ->> 'person_clinic' AS person_row_clinic/, "section 6 does not print the person row's clinic");
  assert.match(S1, /e ->> 'two_clinics' AS two_clinics/, "section 6 does not print the two-clinic flag");
});

test("a trigger the system did not create refuses, on exactly the tables stage 2 writes, in stage 1 and again in P4", () => {
  const written = [...new Set([...code(S2).matchAll(/\b(?:UPDATE|DELETE FROM|INSERT INTO) public\.([a-z_]+)/g)].map((m) => m[1]))].sort();
  const r30 = SETS.slice(SETS.indexOf("'R30'"), SETS.indexOf(END));
  const onTables = (txt) => [...new Set([...txt.matchAll(/'public\.([a-z_]+)'::regclass/g)].map((m) => m[1]))].sort();
  assert.deepEqual(onTables(r30), written, "R30 does not read exactly the tables stage 2 writes");
  assert.match(r30, /FROM pg_catalog\.pg_trigger t[\s\S]*AND NOT t\.tgisinternal\)::int,/, "R30 does not count the non-internal triggers");
  const p4 = S2.slice(S2.indexOf("-- P4."), S2.indexOf("-- P5."));
  assert.deepEqual(onTables(p4), written, "P4 does not read exactly the tables stage 2 writes");
  assert.match(p4, /IF v_want IS NOT NULL THEN\s+RAISE EXCEPTION 'STOP: P4/, "P4 prints a trigger but does not stop on it");
  assert.ok(S2.indexOf("-- P4.") < S2.indexOf("-- W1."), "P4 does not run before the first write");
  assert.match(S1, /'triggers', \(SELECT/, "stage 1 does not list the triggers it found");
});

test("stage 2 cannot hide its DONE line, and the block marks the write as soon as psql exits 0", () => {
  const c = code(S2);
  const pin = c.indexOf("SET client_min_messages = notice;");
  assert.ok(pin >= 0 && pin < c.indexOf("DO $s10v2$"), "stage 2 does not pin client_min_messages before the block");
  assert.match(S2, /RAISE NOTICE 'STAFF-10 V2 STAGE 2 DONE/, "the DONE line is not the NOTICE the block greps for");
  const b = block("STAGE 2");
  const psql = b.indexOf("-f scripts/data/staff-10-v2-2-write.sql");
  const touch = b.indexOf("touch /tmp/staff10v2-written.ok");
  const done = b.indexOf("grep -q 'STAFF-10 V2 STAGE 2 DONE'");
  assert.ok(psql > 0 && psql < touch && touch < done, "the written marker is not touched between psql and the transcript checks");
  for (const line of b.split("\n").slice(b.slice(0, touch).split("\n").length)) {
    if (line.includes("STOP:")) assert.match(line, /COMMITTED and the write stands/, `a STOP after the write does not say the write stands: ${line.slice(0, 90)}`);
  }
  assert.doesNotMatch(DOC, /A `STOP:` line therefore always means/, "the doc still claims every STOP means nothing was written");
});

test("no file claims the op leaves every JP(cb) Castelo Branco row alone: ruling (c) can write a future one", () => {
  for (const [label, text] of [["stage 2", S2], ["the doc", DOC]]) {
    assert.doesNotMatch(text.replace(/\s+/g, " "), /every JP\(cb\) row at Castelo Branco/, `${label} overstates what the op leaves alone`);
  }
});

test("question Q3's default: a NESA row whose past pair has its person row in ruling (a) stays, and is listed and kept", () => {
  const x = SETS.slice(SETS.indexOf("\nx AS ("), SETS.indexOf("\n),", SETS.indexOf("\nx AS (")));
  assert.match(x, /WHERE tw\.is_past AND NOT tw\.n_home\s+AND NOT EXISTS \(SELECT 1 FROM tw t2\s+WHERE t2\.is_past AND t2\.n_id = tw\.n_id\s+AND t2\.p_id IN \(SELECT h\.id FROM h\)\)/, "set X still takes a NESA row whose past pair has its person row in H");
  assert.match(SETS, /\npp AS \(\n  SELECT tw\.\* FROM tw WHERE tw\.is_past AND tw\.n_id NOT IN \(SELECT x\.id FROM x\)\n\)/, "set P is not every past pair whose NESA row X does not move");
  assert.match(SETS, /WHERE s\.id NOT IN \(SELECT h\.id FROM h\) AND s\.id NOT IN \(SELECT x\.id FROM x\)/, "tw_keep is not every past twin row outside H and X");
  assert.match(S1, /'nesa_installed_there', pp\.n_home::text/, "section 8 does not say whether the listed NESA row is installed at its clinic");
  assert.doesNotMatch(S1.slice(S1.indexOf("  'x', (SELECT"), S1.indexOf("  'f', (SELECT")), /person_row_in_h/, "section 6 still carries a person row in H");
  const q3 = DOC.split("\n").find((l) => l.startsWith("| Q3 |"));
  assert.ok(q3, "the doc answers no question Q3");
  assert.doesNotMatch(q3, /OWNER TO CONFIRM|departs/i, "the doc's answer to question Q3 still describes a departure from the written default");
});

test("R14 and R15 take as control the confirmed rows that MOVE, so no confirmed mover reads VACUOUS", () => {
  const r14 = SETS.slice(SETS.indexOf("'R14'"), SETS.indexOf("'R15'"));
  const r15 = SETS.slice(SETS.indexOf("'R15'"), SETS.indexOf("'R16'"));
  assert.match(r14, /\(SELECT count\(\*\) FROM h_after WHERE h_after\.moving\)::int\s+UNION ALL\s+SELECT\s*$/, "R14's control is not the confirmed movers");
  assert.match(r15, /\(SELECT count\(\*\) FROM x_after WHERE x_after\.moving\)::int\s+UNION ALL\s+SELECT\s*$/, "R15's control is not the confirmed movers");
});

test("R02 and verdict 8 read the roster's own user predicate: active, bookable, not a shared resource", () => {
  const store = read("apps/api/lib/appointments/store.ts");
  assert.match(store, /and u\.is_active = true\s+and u\.is_bookable = true\s+\$\{notShared\}/, "the roster predicate moved; re-read it before trusting R02 and verdict 8");
  assert.match(store, /sql`and u\.is_shared_resource = false`/, "the shared-resource exclusion moved");
  assert.match(SETS, /SELECT u\.id, u\.tenant_id, u\.is_active, u\.is_bookable, u\.is_shared_resource\n/, "the JP rows do not carry the roster's user flags");
  const r02 = SETS.slice(SETS.indexOf("'R02'"), SETS.indexOf("'R03'"));
  assert.match(r02, /jp\.is_active IS NOT TRUE OR jp\.is_bookable IS NOT TRUE OR jp\.is_shared_resource IS NOT FALSE/, "R02 does not refuse a JP(lv) the roster would not list");
  const lv = S3.slice(S3.lastIndexOf("(SELECT count(*)", S3.indexOf("AS roster_lv_at_sat")), S3.indexOf("AS roster_lv_at_sat"));
  assert.match(lv, /JOIN public\.users u ON u\.id = av\.user_id AND u\.tenant_id = av\.tenant_id/, "verdict 8's JP(lv) arm does not join the user row");
  assert.match(lv, /u\.is_active IS TRUE AND u\.is_bookable IS TRUE AND u\.is_shared_resource IS FALSE/, "verdict 8's JP(lv) arm does not apply the roster's user predicate");
});

test("every md5 baseline stage 2 compares is in the audit row with its row count, and a guaranteed family stops when empty", () => {
  const c = code(S2);
  const declared = [...new Set([...c.matchAll(/\bv_b_md5_([a-z_]+) text/g)].map((m) => m[1]))].sort();
  assert.ok(declared.length > 0);
  const md5Obj = c.slice(c.indexOf("'md5', jsonb_build_object("), c.indexOf("'md5_rows', v_md5_rows"));
  const recorded = [...md5Obj.matchAll(/'([a-z_]+)', v_b_md5_\1\b/g)].map((m) => m[1]).sort();
  assert.deepEqual(recorded, declared, "the audit row's md5 object is not every baseline stage 2 takes");
  const rows = c.slice(c.indexOf("v_md5_rows := jsonb_build_object("), c.indexOf(");", c.indexOf("v_md5_rows := jsonb_build_object(")));
  const counted = [...rows.matchAll(/'([a-z_]+)', v_(?:bn|b_n)_\1\b/g)].map((m) => m[1]).sort();
  assert.deepEqual(counted, declared, "the md5_rows object does not count every md5 family");
  for (const f of declared) {
    assert.match(c, new RegExp(`INTO v_(?:bn|b_n)_${f}, v_b_md5_${f}\\b`), `family ${f} takes its md5 without its row count`);
  }
  const guard = c.slice(c.indexOf("FOR v_row IN SELECT e.key FROM jsonb_each_text(v_md5_rows) e"), c.indexOf("END LOOP;", c.indexOf("FOR v_row IN SELECT e.key FROM jsonb_each_text(v_md5_rows) e")));
  assert.match(guard, /AND e\.value::int = 0/);
  assert.match(guard, /RAISE EXCEPTION 'STOP: the md5 family % is empty/);
  const guaranteed = guard.match(/e\.key IN \(([^)]*)\)/)?.[1].match(/'([a-z_]+)'/g).map((q) => q.slice(1, -1)).sort();
  assert.deepEqual(guaranteed, ["appt_rest", "av_rest", "cb_past", "cb_sched", "cr_all", "cr_att", "keep", "sl", "users", "w_fixed"], "the families a refusal guarantees moved");
  for (const f of guaranteed) assert.ok(declared.includes(f), `the guard names ${f}, which is not a family`);
  const at = S2.indexOf("FOR v_row IN SELECT e.key FROM jsonb_each_text(v_md5_rows) e");
  assert.ok(at > 0 && at < S2.indexOf("-- W1."), "the empty-family guard does not run before the first write");
  assert.match(c, /RAISE NOTICE 'P5 md5 families and the rows each compares: %'/, "stage 2 does not print the md5 family profile");
});

/* ---- the handshake ------------------------------------------------------- */

const CODES = [...SETS.matchAll(/\((\d+), '([a-z0-9]+)'\)/g)].map((m) => m[2]);
const CARRIES = ["s10v2_run_day", ...CODES.flatMap((c) => [`s10v2_count_${c}`, `s10v2_digest_${c}`])];

test("the carries: one per action for count and digest, plus the run day, and no name inside another", () => {
  assert.equal(new Set(CODES).size, CODES.length, "an action code repeats");
  assert.ok(CODES.length >= 10, `expected the ten action codes, found ${CODES.join(",")}`);
  for (const a of CARRIES) for (const b of CARRIES) if (a !== b) assert.ok(!b.includes(a), `carry ${a} is inside ${b}`);
  for (const c of CARRIES) {
    assert.match(S2, new RegExp(`set_config\\('s10v2\\.${c}',\\s+:'${c}',\\s+false\\)`), `stage 2 does not lift ${c}`);
  }
  assert.match(S2, new RegExp(`IF v_n <> ${CARRIES.length} THEN`), "stage 2 does not assert the carry count");
  const names = block("STAGE 2").match(/NAMES=\(\n([\s\S]*?)\n\)/)?.[1].split(/\s+/).filter(Boolean);
  assert.deepEqual(names, CARRIES, "the doc's stage 2 block does not pass exactly these carries, in order");
  assert.match(SETS, /coalesce\(md5\(string_agg\(t\.key, ',' ORDER BY t\.key\)\), 'empty'\)/, "the digest expression moved");
});

test("stage 2 refuses on stale or foreign carries: under an hour, same Lisbon day", () => {
  const b = block("STAGE 2");
  assert.match(b, /find \/tmp\/staff10v2-stage1\.ok -mmin -60/);
  assert.match(b, /find \/tmp\/staff10v2-stage1\.out -mmin -60/);
  assert.match(b, /\$\(TZ=Europe\/Lisbon date \+%Y-%m-%d\)/);
  assert.match(S2, /current_setting\('s10v2\.s10v2_run_day', true\) IS DISTINCT FROM v_today::text/);
});

test("every refusal stage 1 prints is a refusal stage 2 raises, and the doc counts them", () => {
  const codes = [...SETS.matchAll(/'(R\d{2})'(?: AS code)?,/g)].map((m) => m[1]);
  const want = Array.from({ length: codes.length }, (_, i) => `R${String(i + 1).padStart(2, "0")}`);
  assert.deepEqual(codes, want, "the refusal codes are not contiguous from R01");
  assert.match(S2, /WHERE \(e ->> 'n'\)::int > 0 ORDER BY 1\s+LOOP\s+RAISE EXCEPTION 'STOP: % refuses/);
  assert.ok(block("STAGE 1").includes(`[ "\${RN}" = ${codes.length} ]`), "stage 1's block does not count every refusal line");
});

/* ---- the verify ---------------------------------------------------------- */

test("stage 3 prints a contiguous set of verdicts, each able to FAIL, and the doc counts them", () => {
  const ns = [...S3.matchAll(/^(?:SELECT|UNION ALL SELECT) (\d+)(?: AS n)?, '/gm)].map((m) => Number(m[1]));
  const verdicts = ns.filter((n) => n !== 99);
  assert.deepEqual(verdicts, Array.from({ length: verdicts.length }, (_, i) => i + 1));
  const rows = S3.slice(S3.indexOf("), r AS ("), S3.indexOf("SELECT r.n, r.\"check\"")).split(/\nUNION ALL SELECT /);
  assert.equal(rows.length, verdicts.length, "the verdict rows did not split one per verdict");
  rows.forEach((r, i) => assert.match(r, /THEN 'FAIL'/, `verdict ${i + 1} cannot FAIL`));
  const b = block("STAGE 3");
  assert.ok(b.includes(`[ "\${NV}" = ${verdicts.length} ]`), "the doc's stage 3 block counts a different number");
  const allowed = b.match(/grep -vxE '([0-9|]+)'/)?.[1].split("|").map(Number);
  assert.ok(allowed?.length > 0);
  for (const n of allowed) assert.ok(verdicts.includes(n), `the allowed-VACUOUS list names ${n}, which does not exist`);
  for (const n of [1, 7, 8, 9, 19, 20, 21, 22]) assert.ok(!allowed.includes(n), `verdict ${n} must never be allowed VACUOUS`);
});

test("an empty comparand never reads OK: every verdict but 1, 7 and 22 has a VACUOUS branch, and 7 FAILs on a zero control", () => {
  const rows = S3.slice(S3.indexOf("), r AS ("), S3.indexOf("SELECT r.n, r.\"check\"")).split(/\nUNION ALL SELECT /);
  rows.forEach((r, i) => {
    const n = i + 1;
    if ([1, 7, 22].includes(n)) return;
    assert.match(r, /THEN 'VACUOUS'/, `verdict ${n} has no VACUOUS branch, so an empty set could read OK`);
  });
  assert.match(rows[6], /OR v\.lv_lv_future = 0 THEN 'FAIL'/, "verdict 7's control does not FAIL at zero");
  const ten = rows[9];
  assert.match(ten, /\+ v\.n_rcov \+ v\.n_rpast \+ v\.n_rphan \+ v\.n_rwin\) = 0\s+THEN 'VACUOUS'/, "verdict 10 is not VACUOUS on an empty comparand");
  assert.ok(ten.indexOf("THEN 'FAIL'") < ten.indexOf("THEN 'VACUOUS'"), "verdict 10 must test FAIL before VACUOUS");
});

test("every untouched set stage 3 compares by md5 must be non-empty, and stage 1 refuses an empty one before the write", () => {
  const md5Verdicts = [...S3.matchAll(/UNION ALL SELECT (\d+), '[^']*\(md5\)'/g)].map((m) => Number(m[1]));
  assert.deepEqual(md5Verdicts, [9, 19, 20, 21], "the md5 comparison verdicts moved");
  const r25 = SETS.slice(SETS.indexOf("'R25'"), SETS.indexOf("'R26'"));
  assert.match(r25, /a\.practitioner_id = k\.jp_cb AND a\.location_id = k\.cb_loc AND a\.starts_at < k\.day0\) = 0/, "R25 does not refuse an empty JP(cb) past Castelo Branco set");
  assert.match(r25, /av\.user_id = k\.jp_cb AND av\.location_id = k\.cb_loc\) = 0/, "R25 does not refuse an empty JP(cb) Castelo Branco schedule");
  const r27 = SETS.slice(SETS.indexOf("'R27'"), SETS.indexOf("'R28'"));
  assert.match(r27, /FROM public\.clinical_records cr\s+WHERE cr\.appointment_id IN \(SELECT h\.id FROM h UNION SELECT x\.id FROM x\s+UNION SELECT f\.p_id FROM f UNION SELECT f\.n_id FROM f\)\) = 0/, "R27 does not refuse an empty clinical record set on the written rows");
  assert.match(r27, /\(SELECT count\(\*\) FROM tw_keep\) = 0/, "R27 does not refuse an empty kept past twin set");
});

test("the roster check always has a real Saturday to read: R28 refuses before the write when it would not", () => {
  const r28 = SETS.slice(SETS.indexOf("'R28'"), SETS.indexOf(END));
  assert.match(r28, /o\.user_id = k\.jp_lv AND o\.location_id = k\.lv_loc AND o\.is_active IS TRUE/);
  assert.match(r28, /o\.valid_from >= k\.today AND extract\(dow FROM o\.valid_from\)::int = 6/, "R28 does not look for a real Saturday from today");
  assert.match(r28, /\+ \(SELECT count\(\*\) FROM cls c WHERE c\.f_move\) = 0/, "R28 does not count the Saturdays that move");
  const sat = S3.slice(S3.indexOf("), sat AS ("), S3.indexOf("), v AS ("));
  assert.match(sat, /av\.valid_from >= k\.today AND extract\(dow FROM av\.valid_from\)::int = 6/, "stage 3's Saturday is not the one R28 guarantees");
});

test("stage 3 reads back only what stage 2 records, and the audit action agrees everywhere", () => {
  assert.ok(S2.includes(`c_action   constant text := '${ACTION}'`));
  assert.ok(SETS.includes(`al.action = '${ACTION}'`));
  assert.ok(S3.includes(`a.action = '${ACTION}'`));
  const top = [...S3.matchAll(/m -> '([a-z_0-9]+)'/g)].map((m) => m[1]);
  const nested = [...S3.matchAll(/m -> '(before|md5)' ->> '([a-z_0-9]+)'/g)].map((m) => `${m[1]}.${m[2]}`);
  for (const k of new Set(top)) assert.ok(S2.includes(`'${k}', `), `stage 3 reads ${k}, which stage 2 never writes`);
  for (const k of new Set(nested)) assert.ok(S2.includes(`'${k.split(".")[1]}', v_`), `stage 3 reads ${k}, which stage 2 never writes`);
});

test("the md5 fingerprints stage 3 recomputes are the exact expressions stage 2 recorded", () => {
  const keep = "ROW(a.id, a.practitioner_id, a.practitioner_2_id, a.location_id, a.starts_at,";
  const cr = "string_agg(ROW(cr.id, cr.practitioner_id, cr.appointment_id)::text, E'\\n' ORDER BY cr.id)";
  for (const s of [S2, S3]) {
    assert.ok(s.includes(keep), "the kept-row fingerprint differs");
    assert.ok(s.includes(cr), "the clinical record fingerprint differs");
    assert.match(s, /SET TIME ZONE 'UTC';\nSET datestyle = 'ISO, YMD';/, "a fingerprint file does not fix the text rendering");
  }
});

/* ---- the pins and the public bytes --------------------------------------- */

test("the doc pins each file by its sha256, and the sidecar pins the doc", () => {
  const pins = { SHA1: F1, SHA2: F2, SHA3: F3, SHAGUARD: GUARD };
  for (const [name, file] of Object.entries(pins)) {
    const want = sha256(file);
    const set = [...DOC.matchAll(new RegExp(`^${name}=([0-9a-f]{64})$`, "gm"))].map((m) => m[1]);
    assert.ok(set.length > 0, `no block sets ${name}`);
    for (const v of set) assert.equal(v, want, `${name} in the doc is not the sha256 of ${file}`);
    assert.ok(DOC.includes(`\`${file}\`, `) && DOC.includes(want), `the facts table does not pin ${file}`);
  }
  const side = read("docs/data-op-staff-10-v2.sha256");
  assert.equal(side, `${sha256(DOCF)}  ${DOCF}\n`, "the sidecar does not pin the doc");
});

test("the original STAFF-10 SQL files are byte-identical to what their own doc pinned", () => {
  const old = read("docs/data-op-staff-10.md");
  assert.match(old, /SUPERSEDED on 2026-09-24/);
  for (const f of ["staff-10-1-preview.sql", "staff-10-2-apply.sql", "staff-10-3-postcheck.sql"]) {
    const pinned = old.match(new RegExp(`scripts/data/${f.replace(/\./g, "\\.")}\`, sha256 \`([0-9a-f]{64})\``))?.[1];
    assert.equal(sha256(`scripts/data/${f}`), pinned, `${f} moved`);
  }
});

test("no public byte of the op carries a count next to a counted noun, or a dash", () => {
  const noun = /\b\d[\d,.]*\s*(?:future |past |live |twin |nesa |person )?(?:pairs?|rows?|twins?|patients?|appointments?|bookings?|thousand)\b/i;
  for (const [label, text] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3], ["the doc", DOC]]) {
    text.split("\n").forEach((line, i) => {
      assert.doesNotMatch(line, noun, `${label}:${i + 1} reads like a count: ${line.trim().slice(0, 100)}`);
      assert.doesNotMatch(line, /[\u2013\u2014]/, `${label}:${i + 1} carries an en or em dash`);
    });
  }
});
