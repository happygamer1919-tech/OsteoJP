// FICHA-V6: docs/data-op-ficha-v6.md, the production install of osteopathy version 6 (FICHA-ORDER-01).
//
// WHAT THIS PROVES, with no database:
//   * the version 6 schema stage 2 embeds IS packages/db/seed/form-templates/osteopathy-v6.json's
//     schema, and its title the file's title, by an exact canonical comparison: both sides go
//     through JSON.parse and are compared whole with assert.deepStrictEqual (never a regex or a
//     scanner); stage 3's x-order and title literals likewise; and the two files differ in
//     x-order alone, which is the premise the op is built on;
//   * the expected md5 values (repo version 5 and version 6, md5 of schema::text) are one pair,
//     written the same in stage 1, stage 2, stage 3 and the document;
//   * stage 1 and stage 2 compute every set with the same bytes (the BASE), and stage 3 reads
//     the same constants;
//   * the stage files never mention the seed loader, update nothing, delete nothing, and stage 2
//     writes exactly one INSERT into form_templates (ON CONFLICT DO NOTHING) and one into
//     audit_log, inside one transaction, after its lock;
//   * every pin in the document and in every block is the real file's sha256 on this tree, and
//     the sidecar pins the document;
//   * the document states the halt rule once, word for word, and says NOT RUN and NOT REHEARSED;
//   * every block parses under bash -n and zsh -n, carries no # line, no !, no backslash
//     continuation, no set -e and no unbraced parameter before a colon, and halts explicitly;
//   * THE FAULT INJECTION: each block runs in GREEN's tool shape (`true && eval '<block>' ...`), in
//     bash with errexit forced off and in zsh, with every external program a stub. Its positive
//     control reaches its last line; each external call made to fail in turn, and each scenario
//     below, stops it with a STOP line, without its last line and without a record written past
//     the fault. HARNESS_POOL caps the parallel runs; FAULT_TABLE=1 prints every row.
// WHAT IT DOES NOT PROVE: that the SQL runs. Nothing here touches a database; the rehearsal does.
//
// Run: pnpm test:scripts

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const DOC = "docs/data-op-ficha-v6.md";
const SIDECAR = "docs/data-op-ficha-v6.sha256";
const F1 = "scripts/data/ficha-v6-1-measure.sql";
const F2 = "scripts/data/ficha-v6-2-write.sql";
const F3 = "scripts/data/ficha-v6-3-verify.sql";
const V5 = "packages/db/seed/form-templates/osteopathy-v5.json";
const V6 = "packages/db/seed/form-templates/osteopathy-v6.json";
const GUARD = "scripts/assert-production-target.mjs";
const PTM = "scripts/production-target.mjs";
const LOADER = "packages/db/seed/form-templates.ts";
const THIS = "scripts/ficha-v6-data-op.test.mjs";
const ACTION = "staff.ficha_v6.install_template";
/** md5(schema::text) of each file's schema, taken by Postgres 17 (UTF8) from a literal of it. */
const MD5 = Object.freeze({ v5: "b109e3af926fd6f51bbf485a173d2145", v6: "752bf47bf11d46a49f74e94761ecea83" });

const doc = read(DOC);
/** The document with every run of whitespace one space, for prose that wraps. */
const flat = doc.replace(/\s+/g, " ");
const S1 = read(F1);
const S2 = read(F2);
const S3 = read(F3);
const fileV5 = JSON.parse(read(V5));
const fileV6 = JSON.parse(read(V6));

const HALT_RULE =
  "THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any\n" +
  "STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and\n" +
  "nothing continues to the next block. After stage 2 has committed, a post-commit STOP\n" +
  "still stops the sitting: the write stands, and stage 3 (READ ONLY) runs only on the\n" +
  "owner's or the lead's word. The only onward path from stage 2 to stage 3 is exit 0\n" +
  'with the line "FICHA-V6 WRITTEN. Paste stage 3 now." No block, and no dispatch\n' +
  "step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit.\n" +
  "Whether and when a halted sitting starts again is the lead's call, never the runner's.";

/** The fenced blocks GREEN pastes: fences whose opening line is exactly three backticks. A fence naming a language is prose. */
export function blocksOf(md) {
  const out = [];
  let open = null;
  let body = [];
  for (const line of md.split("\n")) {
    if (open === null) {
      const m = /^```(\S*)$/.exec(line);
      if (m) {
        open = m[1];
        body = [];
      }
    } else if (line === "```") {
      if (open === "") out.push(`${body.join("\n")}\n`);
      open = null;
    } else body.push(line);
  }
  if (open !== null) throw new Error("a fence is never closed");
  return out;
}

const SUCCESS = Object.freeze({
  stage0: "FICHA-V6 FILES VERIFIED",
  stage1: "STAGE 1 READ, NO REFUSAL.",
  stage2: "FICHA-V6 WRITTEN. Paste stage 3 now.",
  stage3: "FICHA-V6 VERIFIED: 10 OK / 0 VACUOUS / 0 FAIL.",
});
const NAMES = Object.keys(SUCCESS);
const blockOf = (name, md = doc) => {
  const hits = blocksOf(md).filter((b) => b.includes(`echo "${SUCCESS[name]}`));
  if (hits.length !== 1) throw new Error(`expected exactly one block for ${name}, found ${hits.length}`);
  return hits[0];
};

/** One dollar-quoted literal of a stage file, by its tag and the text that follows the closing tag. */
function literal(sql, tag, after) {
  assert.equal(sql.split(`$${tag}$`).length - 1, 2, `the tag $${tag}$ does not open and close exactly once`);
  const m = new RegExp(String.raw`\$${tag}\$\n([\s\S]*?)\n\$${tag}\$${after.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).exec(sql);
  assert.ok(m, `no literal $${tag}$ followed by ${after}`);
  return m[1];
}

/** The text between the BASE markers, markers included. */
function baseOf(sql, label) {
  const open = "-- >>> FICHA-V6 BASE BEGIN.";
  const close = "-- <<< FICHA-V6 BASE END.";
  assert.equal(sql.split(open).length - 1, 1, `${label} does not carry exactly one BASE BEGIN`);
  assert.equal(sql.split(close).length - 1, 1, `${label} does not carry exactly one BASE END`);
  return sql.slice(sql.indexOf(open), sql.indexOf(close) + close.length);
}

/**
 * The SQL a statement keyword scan reads: the embedded JSON literals, the -- comments and the
 * '...' strings taken out. Used only to look for statement keywords in this op's own files.
 */
function code(sql) {
  let s = sql;
  for (const tag of ["fv6s", "fv6t", "fv6x"]) s = s.replace(new RegExp(String.raw`\$${tag}\$[\s\S]*?\$${tag}\$`, "g"), "''");
  s = s.replace(/--[^\n]*/g, "");
  s = s.replace(/'(?:[^']|'')*'/g, "''");
  return s;
}

/* ---- the embedded literals, by an exact canonical comparison ----------------------------------- */

test("stage 2's schema and title ARE the version 6 file's, parsed and compared whole", () => {
  assert.equal(fileV6.key, "osteopathy");
  assert.equal(fileV6.version, 6);
  const schema = JSON.parse(literal(S2, "fv6s", "::jsonb;"));
  const title = JSON.parse(literal(S2, "fv6t", "::jsonb;"));
  assert.deepStrictEqual(schema, fileV6.schema);
  assert.deepStrictEqual(title, fileV6.title);
  assert.match(S2, /w_schema constant jsonb := \$fv6s\$\n/);
  assert.match(S2, /w_title {2}constant jsonb := \$fv6t\$\n/);
  // A control: the comparison can fail. The version 5 schema is not the literal.
  assert.notDeepStrictEqual(schema, fileV5.schema);
});

test("stage 3's x-order and title ARE the version 6 file's, parsed and compared whole", () => {
  assert.deepStrictEqual(JSON.parse(literal(S3, "fv6x", "::jsonb AS c_order,")), fileV6.schema["x-order"]);
  assert.deepStrictEqual(JSON.parse(literal(S3, "fv6t", "::jsonb AS c_title")), fileV6.title);
  assert.notDeepStrictEqual(fileV6.schema["x-order"], fileV5.schema["x-order"]);
});

test("THE PREMISE, on the files: version 6 is version 5 with its x-order changed and nothing else", () => {
  const strip = (o) => {
    const { "x-order": _ignored, ...rest } = o;
    return rest;
  };
  assert.deepStrictEqual(strip(fileV6.schema), strip(fileV5.schema));
  assert.deepStrictEqual(fileV6.title, fileV5.title);
  assert.equal(fileV5.key, fileV6.key);
  assert.equal(fileV5.version, 5);
  assert.deepStrictEqual([...fileV6.schema["x-order"]].sort(), [...fileV5.schema["x-order"]].sort(), "the x-orders hold different fields");
  assert.notDeepStrictEqual(fileV6.schema["x-order"], fileV5.schema["x-order"]);
});

/* ---- the constants -------------------------------------------------------------------------- */

test("one pair of expected md5 values, in stage 1, stage 2, stage 3 and the document", () => {
  assert.notEqual(MD5.v5, MD5.v6);
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    assert.match(sql, new RegExp(`'${MD5.v5}'::text AS c_v5_md5,`), `${label} does not carry the version 5 md5`);
    assert.match(sql, new RegExp(`'${MD5.v6}'::text AS c_v6_md5,`), `${label} does not carry the version 6 md5`);
    const all = sql.match(/\b[0-9a-f]{32}\b/g) ?? [];
    assert.deepStrictEqual([...new Set(all)].sort(), [MD5.v5, MD5.v6].sort(), `${label} carries another 32-hex value`);
  }
  assert.ok(doc.includes(`| Expected md5, repo version 5 | \`${MD5.v5}\`: md5(schema::text) of \`osteopathy-v5.json\`'s \`schema\``));
  assert.ok(doc.includes(`| Expected md5, repo version 6 | \`${MD5.v6}\`: md5(schema::text) of \`osteopathy-v6.json\`'s \`schema\``));
  assert.ok(doc.includes(`whose md5 of \`schema::text\` is not \`${MD5.v5}\`, the repo version 5's`), "the R03 row does not name the version 5 md5");
  assert.ok(flat.includes(`each version 6 schema reads \`${MD5.v6}\`; control: each version 5 reads \`${MD5.v5}\``), "verdict 5 does not name both md5s");
  const docMd5 = new Set(doc.match(/\b[0-9a-f]{32}\b/g) ?? []);
  assert.deepStrictEqual([...docMd5].sort(), [MD5.v5, MD5.v6].sort(), "the document names another 32-hex value");
});

test("stage 1 and stage 2 compute every set with the SAME bytes, and stage 3 and stage 2 read the same constants", () => {
  const b1 = baseOf(S1, "stage 1");
  const b2 = baseOf(S2, "stage 2");
  assert.equal(b1, b2, "the BASE differs between stage 1 and stage 2");
  assert.ok(!S3.includes("FICHA-V6 BASE BEGIN"), "stage 3 carries a BASE");
  const consts = (sql) => ({
    key: /'([a-z]+)'::text AS c_key,/.exec(sql)?.[1],
    from: /\n\s+(\d+) AS c_from,/.exec(sql)?.[1],
    to: /\n\s+(\d+) AS c_to,/.exec(sql)?.[1],
    action: /'([a-z0-9_.]+)'::text AS c_action/.exec(sql)?.[1],
  });
  const want = { key: "osteopathy", from: "5", to: "6", action: ACTION };
  assert.deepStrictEqual(consts(b1), want);
  assert.deepStrictEqual(consts(S3), want);
  assert.match(S2, new RegExp(`w_action constant text := '${ACTION.replaceAll(".", "\\.")}';`));
  assert.ok(S3.includes(`WHERE al.action = '${ACTION}'`), "stage 3's listing reads another action");
  assert.equal(String(fileV5.version), want.from);
  assert.equal(String(fileV6.version), want.to);
  assert.equal(fileV6.key, want.key);
});

test("the carries: four names, none inside another, the same in the BASE, stage 2's lift, P3 and the stage 2 block", () => {
  const base = baseOf(S1, "stage 1");
  const fromBase = [...base.matchAll(/SELECT \d+(?: AS ord)?, '(fv6_[a-z]+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(fromBase, ["fv6_count", "fv6_tenants", "fv6_rows", "fv6_baseline"]);
  for (const a of fromBase) for (const b of fromBase) if (a !== b) assert.ok(!b.includes(a), `${a} is inside ${b}`);
  const lifted = [...S2.matchAll(/set_config\('fv6\.(fv6_[a-z]+)', +:'(fv6_[a-z]+)'/g)].map((m) => (m[1] === m[2] ? m[1] : `${m[1]}/${m[2]}`));
  assert.deepStrictEqual(lifted, fromBase);
  assert.ok(S2.includes(`FOREACH v_name IN ARRAY ARRAY[${fromBase.map((c) => `'${c}'`).join(", ")}] LOOP`));
  const names = blockOf("stage2").match(/NAMES=\(\n([\s\S]*?)\n\)/)?.[1].split(/\s+/).filter(Boolean);
  assert.deepStrictEqual(names, fromBase);
});

test("the refusals: R01 to R08, contiguous, raised by stage 2, read by the stage 1 block, and named by the document", () => {
  const codes = [...baseOf(S1, "stage 1").matchAll(/SELECT '(R\d{2})'/g)].map((m) => m[1]);
  assert.deepStrictEqual(codes, ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08"]);
  assert.ok(S2.includes("IF jsonb_array_length(v_ref) <> 8 THEN"));
  assert.ok(S2.includes("RAISE EXCEPTION 'STOP: % refuses: %. Nothing was written', v_row.code, v_row.label;"));
  assert.ok(blockOf("stage1").includes('[ "${RN}" = 8 ] || {'));
  const table = doc.slice(doc.indexOf("| Code | Refuses when |"), doc.indexOf("**The carries.**"));
  assert.deepStrictEqual([...table.matchAll(/^\| (R\d{2}) \|/gm)].map((m) => m[1]), codes);
  assert.ok(flat.includes("Section 5 prints eight refusals, `R01` to `R08`"));
});

test("stage 3 prints ten verdicts and a SUMMARY row, none may read VACUOUS, and the block and the document count ten", () => {
  const r = S3.slice(S3.indexOf("\nr AS ("), S3.indexOf('SELECT r.n, r."check"'));
  const ns = [...r.matchAll(/(?:SELECT (\d+) AS n,|UNION ALL SELECT (\d+),)/g)].map((m) => Number(m[1] ?? m[2]));
  assert.deepStrictEqual(ns, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(!/'VACUOUS'/.test(r), "a verdict can read VACUOUS");
  assert.equal((r.match(/THEN 'FAIL' ELSE 'OK' END/g) ?? []).length, 10, "a verdict is not FAIL-or-OK");
  const b = blockOf("stage3");
  assert.ok(b.includes('[ "${NV}" = 10 ] ||'));
  assert.ok(b.includes('[ "${NOK}" = 10 ] ||'));
  assert.ok(b.includes('[ "${NVAC}" = 0 ] ||'));
  assert.ok(b.includes('[ "${NF}" = 0 ] ||'));
  assert.ok(doc.includes("10 verdicts and a SUMMARY row"));
  assert.ok(doc.includes("**Stage 3's ten verdicts,**"));
});

test("stage 3's controls read what they claim: one row less of the same set, the other version, the rule without version 6", () => {
  const exact = [
    // verdict 9: the rows stage 2 did not insert, their md5, and the same md5 less one row of that same set
    "SELECT f.* FROM public.form_templates f WHERE f.id NOT IN (SELECT al.entity_id FROM al WHERE al.entity_id IS NOT NULL)",
    "(SELECT md5(coalesce(string_agg((r.*)::text, E'\\n' ORDER BY r.id), '')) FROM rest r) AS rest_now,",
    "(SELECT md5(coalesce(string_agg((r.*)::text, E'\\n' ORDER BY r.id), '')) FROM rest r\n      WHERE r.id <> (SELECT r2.id FROM rest r2 ORDER BY r2.id LIMIT 1)) AS rest_less_one,",
    "(SELECT (al.m -> 'baseline' ->> 'rows')::int FROM al ORDER BY al.id LIMIT 1) AS rest_n_then,",
    "(SELECT al.m -> 'baseline' ->> 'md5' FROM al ORDER BY al.id LIMIT 1) AS rest_then,",
    "OR v.rest_now IS DISTINCT FROM v.rest_then OR v.rest_n_now IS DISTINCT FROM v.rest_n_then\n                OR v.rest_less_one IS NOT DISTINCT FROM v.rest_then THEN 'FAIL' ELSE 'OK' END FROM v",
    // verdict 5: the version 6 md5 over the version 6 rows; its control the version 5 md5 over the version 5 rows
    "(SELECT count(*) FROM v6 CROSS JOIN k WHERE md5(v6.schema::text) = k.c_v6_md5)::int AS n_v6_md5_ok,",
    "(SELECT count(*) FROM v5 CROSS JOIN k WHERE md5(v5.schema::text) = k.c_v5_md5)::int AS n_v5_md5_ok,",
    "(SELECT k.c_v5_md5 <> k.c_v6_md5 FROM k) AS md5s_differ,",
    // verdict 6: the file's x-order over the version 6 rows; its control over the version 5 rows, which must be 0
    "(SELECT count(*) FROM v6 CROSS JOIN k WHERE (v6.schema -> 'x-order') = k.c_order)::int AS n_v6_order_ok,",
    "(SELECT count(*) FROM v5 CROSS JOIN k WHERE (v5.schema -> 'x-order') = k.c_order)::int AS n_v5_order_same,",
    "CASE WHEN v.n_v6 = 0 OR v.n_v6_order_ok <> v.n_v6 OR v.n_v5 = 0 OR v.n_v5_order_same <> 0 THEN 'FAIL' ELSE 'OK' END FROM v",
    // verdict 8: the picker, and the same rule without version 6 reading version 5
    "WHERE f.key = k.c_key AND f.is_active AND f.version <> k.c_to\n   ORDER BY f.tenant_id, f.version DESC",
    "(SELECT count(*) FROM v6 JOIN pick p ON p.tenant_id = v6.tenant_id AND p.id = v6.id)::int AS n_pick_v6,",
    "(SELECT count(*) FROM v6 CROSS JOIN k JOIN pick_without p ON p.tenant_id = v6.tenant_id AND p.version = k.c_from)::int AS n_pick_without_v5,",
    "CASE WHEN v.n_v6 = 0 OR v.n_pick_v6 <> v.n_v6 OR v.n_pick_without_v5 <> v.n_v6 THEN 'FAIL' ELSE 'OK' END FROM v",
    // verdict 10: the op's own transaction
    "WHERE v6.created_at = al.created_at AND v6.updated_at = v6.created_at)::int AS n_same_txn",
  ];
  for (const e of exact) assert.equal(S3.split(e).length - 1, 1, `stage 3 does not carry, exactly once: ${e.slice(0, 120)}`);
  const sel = (name) => new RegExp(`\\b${name}\\b`, "g");
  for (const name of ["rest_less_one", "n_v5_md5_ok", "n_v5_order_same", "n_pick_without_v5", "md5s_differ"]) {
    assert.ok((S3.match(sel(name)) ?? []).length >= 3, `${name} is computed but not read by a verdict`);
  }
});

/* ---- what the stage files do and never do --------------------------------------------------- */

test("the stage files never mention the seed loader, nor any seed file", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]]) {
    assert.doesNotMatch(sql, /seed|loadFormTemplates|upsertOne|form-templates\.ts|form-templates\//i, `${label} mentions the seed loader or its folder`);
  }
  assert.ok(existsSync(join(ROOT, LOADER)), "the loader this test guards against has moved; re-read the ruling");
  for (const name of NAMES) {
    const b = blockOf(name);
    assert.doesNotMatch(b, /form-templates\.ts|loadFormTemplates|seed:form-templates|upsertOne|tsx |pnpm /, `${name} runs a loader`);
  }
});

test("stage 1 and stage 3 write nothing: READ ONLY, rolled back, no statement that writes", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 3", S3]]) {
    assert.equal(sql.split("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;").length - 1, 1, `${label} is not one READ ONLY transaction`);
    assert.equal((code(sql).match(/\bROLLBACK;/g) ?? []).length, 1, `${label} does not roll back once`);
    assert.doesNotMatch(code(sql), /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COMMIT|COPY|LOCK|DO)\b/, `${label} carries a statement that writes`);
  }
});

test("stage 2 writes exactly one INSERT into form_templates, ON CONFLICT DO NOTHING, and one into audit_log, in ONE transaction, after its lock", () => {
  const c = code(S2);
  assert.equal((c.match(/\bBEGIN ISOLATION LEVEL READ COMMITTED;/g) ?? []).length, 1);
  assert.equal((c.match(/\bCOMMIT;/g) ?? []).length, 1);
  assert.equal((c.match(/\bDO \$fv6w\$/g) ?? []).length, 1);
  assert.equal((c.match(/\bINSERT INTO\b/g) ?? []).length, 2, "stage 2 does not carry exactly two INSERTs");
  assert.equal((c.match(/INSERT INTO public\.form_templates \(tenant_id, key, version, title, schema, is_active\)/g) ?? []).length, 1);
  assert.equal((c.match(/INSERT INTO public\.audit_log \(tenant_id, actor_user_id, action, entity_type, entity_id, metadata\)/g) ?? []).length, 1);
  assert.equal((c.match(/ON CONFLICT \(tenant_id, key, version\) DO NOTHING/g) ?? []).length, 1);
  assert.doesNotMatch(c, /\b(UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY)\b/, "stage 2 carries a statement beyond its two INSERTs");
  assert.doesNotMatch(c, /DO UPDATE/);
  const body = c.slice(c.indexOf("DO $fv6w$"));
  const lock = body.indexOf("LOCK TABLE public.form_templates IN SHARE ROW EXCLUSIVE MODE;");
  assert.ok(lock > 0, "no lock");
  assert.ok(body.indexOf("set_config('lock_timeout', '5s', true)") < lock, "the lock_timeout is not set before the lock");
  assert.ok(body.indexOf("SELECT") > lock, "a read comes before the lock");
  for (const step of ["P0", "P1", "P2", "P3", "P4", "W1", "A1", "A2", "A3"]) assert.ok(S2.includes(`RAISE NOTICE '${step} `), `no ${step} step line`);
  const order = ["RAISE NOTICE 'P4", "INSERT INTO public.form_templates", "RAISE NOTICE 'A3", "INSERT INTO public.audit_log", "FICHA-V6 STAGE 2 DONE"].map((x) => S2.indexOf(x));
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, "the steps are out of order");
  assert.ok(S2.includes("SET client_min_messages = notice;"));
  // The inserted row: key and version from the BASE, the literals, active.
  assert.ok(S2.includes("SELECT t.tid, v_key, v_to, w_title, w_schema, true"));
  // Each refusal and assertion raises a STOP that rolls everything back.
  for (const line of S2.split("\n").filter((l) => l.includes("RAISE EXCEPTION"))) assert.match(line, /RAISE EXCEPTION 'STOP: /, line);
});

test("stage 2 proves inside its transaction that no other row moved, that each row reads the expected md5, and that new fichas pick it", () => {
  assert.ok(S2.includes("IF md5(w_schema::text) IS DISTINCT FROM v_v6_md5 THEN"));
  assert.ok(S2.includes("count(*) FILTER (WHERE (f.schema - 'x-order') = (w_schema - 'x-order'))::int"));
  assert.ok(S2.includes("AND md5(f.schema::text) = v_v6_md5 AND f.schema = w_schema AND f.title = w_title;"));
  assert.ok(S2.includes("WHERE NOT (f.id = ANY (v_ids));"));
  assert.ok(S2.includes("IF v_a_n <> v_b_n OR v_a_md5 IS DISTINCT FROM v_b_md5 OR v_total <> v_b_n + v_n THEN"));
  // The baseline after the write is taken with the BASE's own expression.
  const expr = "md5(coalesce(string_agg((f.*)::text, E'\\n' ORDER BY f.id), ''))";
  assert.ok(baseOf(S2, "stage 2").includes(expr));
  assert.equal(S2.split(expr).length - 1, 2);
  assert.ok(S2.includes("IF v_n <> cardinality(v_ins) OR v_n::text <> current_setting('fv6.fv6_count') OR v_tids IS DISTINCT FROM v_ins THEN"));
  assert.ok(S2.includes("WHERE f.tenant_id = w.tid AND f.key = v_key AND f.is_active\n                  ORDER BY f.version DESC LIMIT 1);"));
});

test("the picker stage 2 and stage 3 read is the app's: the active rows of the key, highest version", () => {
  const records = read("apps/web/lib/clinical/records.ts");
  assert.match(records, /\.where\(and\(eq\(formTemplates\.isActive, true\), eq\(formTemplates\.key, FICHA_MEDICA_KEY\)\)\)/);
  assert.match(read("apps/web/lib/clinical/ficha-medica.ts"), /export const FICHA_MEDICA_KEY = "osteopathy" as const;/);
  assert.match(read("apps/web/lib/clinical/template-version.ts"), /if \(!winner \|\| row\.version > winner\.version\)/);
  assert.ok(S3.includes("WHERE f.key = k.c_key AND f.is_active\n   ORDER BY f.tenant_id, f.version DESC"));
});

test("the form_templates columns the md5 covers are the table's: no migration adds a column the op does not know", () => {
  const schema = read("packages/db/src/schema.ts");
  const table = schema.slice(schema.indexOf('export const formTemplates = pgTable(\n  "form_templates",'), schema.indexOf("export const clinicalEpisodes"));
  const cols = [...table.matchAll(/^\s+\w+: \w+\("([a-z_]+)"/gm)].map((m) => m[1]);
  assert.deepStrictEqual(cols, ["id", "tenant_id", "key", "version", "title", "schema", "is_active", "created_at", "updated_at"]);
  assert.match(table, /uniqueIndex\("form_templates_tenant_key_version_uq"\)\.on\(t\.tenantId, t\.key, t\.version\)/);
});

test("the document pins each file by its sha256, every block pins the same, and the sidecar pins the document", () => {
  const want = {
    SHA1: sha256(S1), SHA2: sha256(S2), SHA3: sha256(S3), SHAJSON: sha256(read(V6)), SHAGUARD: sha256(read(GUARD)), SHAPTM: sha256(read(PTM)),
  };
  assert.ok(doc.includes(`| Stage 1 | \`${F1}\`, READ ONLY, sha256 \`${want.SHA1}\` |`));
  assert.ok(doc.includes(`| Stage 2 | \`${F2}\`, ONE DO block in ONE transaction, sha256 \`${want.SHA2}\` |`));
  assert.ok(doc.includes(`| Stage 3 | \`${F3}\`, READ ONLY, 10 verdicts and a SUMMARY row, sha256 \`${want.SHA3}\` |`));
  assert.ok(doc.includes(`| The version 6 file | \`${V6}\`, sha256 \`${want.SHAJSON}\`.`));
  assert.ok(doc.includes(`\`${GUARD}\`, sha256 \`${want.SHAGUARD}\`, and the one module it imports, \`${PTM}\`, sha256 \`${want.SHAPTM}\``));
  for (const name of NAMES) {
    const b = blockOf(name);
    const pins = Object.fromEntries([...b.matchAll(/^(SHA[A-Z0-9]*)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
    assert.ok(Object.keys(pins).length >= 3, `${name} pins fewer than three files`);
    for (const [k, v] of Object.entries(pins)) assert.equal(v, want[k], `${name}: ${k}`);
    assert.ok(b.includes("shasum -a 256 -c ${DOCPIN} || {"), `${name} does not check the sidecar`);
    assert.ok(b.includes("DOCPIN=docs/data-op-ficha-v6.sha256\n"));
  }
  assert.deepStrictEqual(Object.keys(Object.fromEntries([...blockOf("stage0").matchAll(/^(SHA[A-Z0-9]*)=/gm)].map((m) => [m[1], 1]))).sort(), Object.keys(want).sort(), "stage 0 does not check every pin");
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
});

test("every script a block runs is checked by sha256 in that block before it runs", () => {
  const runs = { stage1: ["F1", "GUARD"], stage2: ["F2", "GUARD"], stage3: ["F3", "GUARD"] };
  for (const [name, files] of Object.entries(runs)) {
    const lines = blockOf(name).split("\n");
    for (const f of files) {
      const sha = f === "GUARD" ? "SHAGUARD" : `SHA${f.slice(1)}`;
      const hashAt = lines.findIndex((l) => new RegExp(`^S[0-9A-Z]=\\$\\(shasum -a 256 \\$\\{${f}\\} \\| cut -d' ' -f1\\) \\|\\| \\{`).test(l));
      assert.ok(hashAt > 0, `${name} does not hash ${f}`);
      const v = /^(S[0-9A-Z])=/.exec(lines[hashAt])[1];
      assert.match(lines[hashAt + 1], new RegExp(`^\\[ "\\$\\{${v}\\}" = "\\$\\{${sha}\\}" \\] \\|\\| \\{ echo "STOP: `), `${name} does not compare ${f}`);
      const useAt = lines.findIndex((l) => (f === "GUARD" ? /^node \$\{GUARD\} / : new RegExp(`^psql .* -f \\$\\{${f}\\} `)).test(l));
      assert.ok(useAt > hashAt + 1, `${name} runs ${f} before it checks it`);
    }
    assert.ok(lines.some((l) => l.startsWith("SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || {")), `${name} does not check the guard's module`);
  }
});

/* ---- the document ---------------------------------------------------------------------------- */

test("the document states the halt rule once, word for word, says NOT RUN and NOT REHEARSED, and leaves the rehearsal section to the rehearsal", () => {
  assert.equal(doc.split(HALT_RULE).length - 1, 1, "the halt rule is not stated exactly once, word for word");
  assert.ok(doc.includes("**Status: NOT RUN. NOT REHEARSED.**"));
  const rehearsal = doc.slice(doc.indexOf("## Rehearsed on a throwaway database"), doc.indexOf("## What this does NOT do"));
  assert.ok(rehearsal.length > 0);
  assert.ok(rehearsal.includes("**NOT REHEARSED.** Nothing in this document has run on any database."));
  const ruling =
    '"FICHA-ORDER-01 v6: YES, on the Tier C list as proposed: one-row INSERT per tenant, ON CONFLICT DO NOTHING, its own document, ' +
    "rehearsal and sha256. GREEN runs it on a closed-hours night with no other sitting, AFTER the switch and its clean first-send read. " +
    'Earliest Thu 11-12; if the switch slips, strategy re-rules. Never run the seed loader against production."';
  assert.equal(flat.split(ruling).length - 1, 1, "the ruling is not quoted once, word for word");
});

test("no em dash in the document, this test, or the stage files outside the embedded version 6 literal", () => {
  const dash = String.fromCharCode(0x2014);
  assert.ok(!doc.includes(dash), "the document");
  assert.ok(!read(THIS).includes(dash), "this test");
  assert.ok(!S1.includes(dash) && !S3.includes(dash), "stage 1 or stage 3");
  const outside = S2.replace(/\$fv6s\$[\s\S]*?\$fv6s\$/, "");
  assert.ok(!outside.includes(dash), "stage 2 outside the literal");
});

test("no op file carries a date: the dispatch names the night, the blocks read the clock", () => {
  for (const [label, text] of [["stage 1", S1], ["stage 2", code(S2)], ["stage 3", S3], ...NAMES.map((n) => [n, blockOf(n)])]) {
    assert.doesNotMatch(text, /\b20\d\d-[01]\d-[0-3]\d\b|\b20\d\d[01]\d[0-3]\d\b/, `${label} carries a date`);
  }
});

/* ---- the blocks, statically ------------------------------------------------------------------ */

test("exactly four blocks, each with its last line, each parsing under bash -n and zsh -n", (t) => {
  assert.equal(blocksOf(doc).length, 4);
  for (const name of NAMES) blockOf(name);
  for (const b of blocksOf(doc)) {
    const r = spawnSync("bash", ["--noprofile", "--norc", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
  if (!zshOrSkip(t)) return;
  for (const b of blocksOf(doc)) {
    const r = spawnSync("zsh", ["-f", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `zsh -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
});

export function blockHazards(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (/^\s*#/.test(line)) out.push(`a # line: ${line.trim()}`);
    if (line.includes("!")) out.push(`a !: ${line.trim().slice(0, 80)}`);
    if (/\\\s*$/.test(line)) out.push(`a backslash continuation: ${line.trim().slice(0, 80)}`);
    if (/\bset\s+-[a-z]*e/.test(line) || /\bset -o errexit\b/.test(line)) out.push(`a set -e: ${line.trim().slice(0, 80)}`);
    if (/\$[A-Za-z_][A-Za-z0-9_]*:/.test(line)) out.push(`an unbraced parameter before a colon: ${line.trim().slice(0, 80)}`);
  }
  return out;
}

test("no block carries a # line, a !, a continuation, set -e or an unbraced parameter before a colon", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(blockHazards(b), [], b.slice(0, 80));
  for (const planted of ["# x", "if ! true; then :; fi", "echo a \\", "set -e", "set -eo pipefail", "set -o errexit", "git show $TIP:x"]) {
    assert.equal(blockHazards(planted).length, 1, planted);
  }
});

const EXPLICIT_HALT = /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/;
const STRAY_HALT = /\|\| \{ echo "STOP: [^"]+"; echo "\$\{STRAY\}"; exit 1; \}$/;
const COUNT_IDIOM = /^([A-Z]+)=\$\(grep -cE '[^']+' \/tmp\/fv6-[a-z0-9.-]+\)$/;
/** A command a later step relies on: its failure must halt the block by an explicit guard. */
const MUST_HALT = [
  /^cd /, /^rm /, /^touch /, /^git /, /^shasum /, /^node /, /^psql /, /^test /, /^\[ /, /^grep /,
  /^echo "[^"]*" \| grep /, /^echo .* > \/tmp\//, /^set -o allexport/, /^[A-Z0-9]+=\$\(/,
];
export function unguardedLines(block) {
  const out = [];
  const lines = block.split("\n");
  lines.forEach((line, i) => {
    if (/^if /.test(line) || /^for /.test(line)) return;
    const idiom = COUNT_IDIOM.exec(line);
    if (idiom) {
      const next = lines[i + 1] ?? "";
      const okNext = new RegExp(`^\\[ "\\$\\{${idiom[1]}\\}" = 0 \\] \\|\\| \\{ echo "STOP: [^"]+"; exit 1; \\}$`).test(next);
      if (!okNext) out.push(`${i + 1}: a grep count not followed by its own STOP: ${line.slice(0, 100)}`);
      return;
    }
    if (MUST_HALT.some((re) => re.test(line)) && !EXPLICIT_HALT.test(line) && !STRAY_HALT.test(line)) out.push(`${i + 1}: ${line.slice(0, 100)}`);
  });
  return out;
}

test("EVERY HALT IS EXPLICIT: each command a later step relies on carries its own STOP, and line 2 is set -o pipefail", () => {
  for (const b of blocksOf(doc)) {
    assert.deepEqual(unguardedLines(b), [], b.slice(0, 80));
    const lines = b.split("\n");
    assert.equal(lines[0], "(");
    assert.equal(lines[1], "set -o pipefail");
    assert.equal(lines.filter(Boolean).at(-1), ")");
    const sets = lines.filter((l) => /(^|[ (;])set [-+]/.test(l));
    assert.equal(sets[0], "set -o pipefail");
    for (const s of sets.slice(1)) {
      assert.equal(s.replace(/ \|\| \{.*$/, ""), "set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport");
    }
    for (const line of lines) if (line.includes('echo "STOP: ')) assert.match(line, /exit 1; (\}|fi)$|exit 1; \}; \[ -n .*; done$/, line.slice(0, 120));
  }
  for (const planted of [
    "git fetch origin --prune", "node x.mjs | tee /tmp/fv6-x.out", "REC=$(cat /tmp/fv6-main.sha)", "test -f /tmp/fv6-main.sha", "[ a = b ]",
    "grep -qxF x /tmp/fv6-x.out", 'echo "${REC}" > /tmp/fv6-stage1.ok', "touch /tmp/fv6-written.ok", "shasum -a 256 -c x", "psql x -f y",
    "NF=$(grep -cE 'x' /tmp/fv6-stage3.out)",
  ]) {
    assert.equal(unguardedLines(planted).length, 1, planted);
  }
});

test("the HEAD CHECK: stage 0 records origin/main; stages 1 and 2 halt on a moved main before the environment and psql; stage 3 only reports it; no block names a branch", () => {
  for (const name of NAMES) {
    const b = blockOf(name);
    assert.doesNotMatch(b, /origin\/(?!main\b)[A-Za-z]/, `${name} names a branch`);
    for (const l of b.split("\n").filter((x) => /\bgit checkout\b/.test(x))) assert.match(l, /^git checkout -q --detach "\$\{(MAIN|REC)\}" \|\| \{/, `${name}: ${l}`);
  }
  for (const name of ["stage1", "stage2"]) {
    const l = blockOf(name).split("\n");
    const halt = l.findIndex((x) => x.startsWith('[ "${MNOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken.'));
    assert.ok(halt > 0, `${name} has no HEAD CHECK halt`);
    assert.ok(l.findIndex((x) => x.startsWith("set -o allexport")) > halt, `${name} loads the environment before its HEAD CHECK`);
    assert.ok(l.findIndex((x) => x.startsWith("psql ")) > halt, `${name} runs psql before its HEAD CHECK`);
  }
  const s3 = blockOf("stage3").split("\n");
  assert.ok(!s3.some((x) => x.includes('"${MNOW}" = "${REC}" ] ||')), "stage 3 halts on a moved main");
  assert.ok(blockOf("stage0").includes('echo "${MAIN}" > /tmp/fv6-main.sha || {'));
});

test("stages 0, 1 and 2 refuse while the written marker exists, whatever its age; stage 2 marks the write the moment psql exits 0", () => {
  const written = 'if [ -e /tmp/fv6-written.ok ]; then echo "STOP: stage 2 has ALREADY WRITTEN. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner\'s or the lead\'s word"; exit 1; fi';
  for (const name of ["stage0", "stage1", "stage2"]) {
    const l = blockOf(name).split("\n");
    assert.equal(l.filter((x) => x === written).length, 1, `${name} does not refuse on the written marker`);
    assert.ok(l.indexOf(written) < l.findIndex((x) => x.startsWith("git ")), `${name} reads git before the written marker`);
  }
  const l = blockOf("stage2").split("\n");
  const psql = l.findIndex((x) => x.startsWith("psql "));
  assert.ok(l[psql + 1].startsWith("touch /tmp/fv6-written.ok || {"), "stage 2 does not mark the write right after psql");
  for (const x of l.slice(psql + 2).filter((y) => y.includes("STOP:"))) assert.ok(x.includes("THE WRITE STANDS"), x.slice(0, 100));
});

test("every clock read names its zone and is checked, and the weekday table is the ruled one in every block and in R08", () => {
  const table = "'BEGIN { d += 0; t += 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'";
  for (const name of ["stage0", "stage1", "stage2"]) {
    const l = blockOf(name).split("\n");
    const at = l.findIndex((x) => x.startsWith("NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || {"));
    assert.ok(at > 0, `${name} reads no Lisbon clock`);
    assert.ok(l[at + 1].startsWith(`echo "\${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || {`), `${name} does not check the zone`);
    assert.ok(l.some((x) => x.includes(table)), `${name} does not carry the weekday table`);
    assert.ok(l.some((x) => x.startsWith('[ "${CLOCK}" = closed ] || { echo "STOP: ')), `${name} does not stop in clinic hours`);
  }
  for (const b of blocksOf(doc)) for (const x of b.split("\n").filter((y) => /\bdate\b/.test(y) && !y.startsWith("echo"))) assert.match(x, /TZ=Europe\/Lisbon date/, x);
  const r08 = baseOf(S1, "stage 1").slice(baseOf(S1, "stage 1").indexOf("SELECT 'R08'"));
  assert.ok(r08.includes("WHEN k.dow BETWEEN 1 AND 5 AND k.hhmm >= 800 AND k.hhmm < 2100 THEN 1"));
  assert.ok(r08.includes("WHEN k.dow = 6 AND k.hhmm >= 800 AND k.hhmm < 1300 THEN 1"));
});

test("no block prints or tests an environment variable; psql takes the URL only as its argument", () => {
  for (const name of NAMES) {
    for (const l of blockOf(name).split("\n")) {
      if (l.includes("DATABASE_URL")) assert.match(l, /^psql "\$\{DATABASE_URL_DIRECT\}" -X -v ON_ERROR_STOP=1 -P pager=off /, `${name}: ${l.slice(0, 80)}`);
      assert.doesNotMatch(l, /^(env|printenv|export -p|set -x)\b/);
    }
  }
});

/* ---- THE FAULT INJECTION ---------------------------------------------------------------------- */

const STUBBED = ["git", "node", "psql", "date", "shasum", "tee", "rm", "touch", "cat", "find", "grep", "cut", "awk"];
const FAKED = new Set(["git", "node", "psql", "date"]);
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROD_APPLY = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const MAIN = "1".repeat(40);
const OTHER = "2".repeat(40);
const BEFORE = "3".repeat(40);
const RECORDS = ["fv6-main.sha", "fv6-stage1.ok", "fv6-written.ok"];
const RECORDS_OF = { stage0: ["fv6-main.sha"], stage1: ["fv6-stage1.ok"], stage2: ["fv6-written.ok"], stage3: [] };
const APPLY_FILES = [F1, F2, F3, V6, GUARD, PTM, DOC, SIDECAR];

function realPath(name) {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8", env: { PATH: SYSTEM_PATH } });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}, and it is not there`);
  return p;
}
const hasShell = (name) => spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH } }).status === 0;
const shq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

/** One POSIX sh stub: it numbers its calls per name, logs each call and the records present, fails when named by HARNESS_FAIL, and otherwise answers. */
function stubText(name, real) {
  const R = (n) => shq(real[n]);
  return `#!/bin/sh
n=${shq(name)}
d="$HARNESS_RUN"
k=0
if [ -f "$d/cnt.$n" ]; then read -r k < "$d/cnt.$n"; fi
k=$((k + 1))
echo "$k" > "$d/cnt.$n"
id="$n#$k"
ex=
for m in ${RECORDS.join(" ")}; do if [ -f "$d/tmp/$m" ] && [ "$d/tmp/$m" -nt "$d/t0" ]; then ex="$ex $m"; fi; done
printf '%s\\n' "$@" > "$d/args.$id"
printf '%s|%s\\n' "$id" "$ex" >> "$d/log"
unexpected() { printf '%s %s\\n' "$id" "$*" >> "$d/unexpected"; echo "harness: unexpected call $id" >&2; exit 97; }
for a in "$@"; do case "$a" in *osteojp-secrets*|*osteojp-prod-apply*) unexpected "a real path";; esac; done
if [ "$HARNESS_FAIL" = "$id" ]; then
  echo "$id" > "$d/fired"
  case "$n" in
    git) echo "fatal: harness fault" >&2; exit 128;;
    psql) echo "psql: error: harness fault" >&2; exit 2;;
    node) echo "REFUSING: harness fault" >&2; exit 2;;
    tee) ${R("cat")}; echo "tee: harness fault: Permission denied" >&2; exit 1;;
    grep) ${R("cat")} > /dev/null 2>&1; echo "grep: harness fault: Input/output error" >&2; exit 2;;
    cut|awk|shasum|find|cat) ${R("cat")} > /dev/null 2>&1; echo "$n: harness fault: Input/output error" >&2; exit 1;;
    *) echo "$n: harness fault: Operation failed" >&2; exit 1;;
  esac
fi
case "$n" in
  git) case "$1" in
      status) [ "$2" = --short ] || unexpected "$@"; if [ -n "$HARNESS_STRAY" ]; then echo "$HARNESS_STRAY"; fi; exit 0;;
      fetch) [ "$2" = origin ] && [ "$3" = --prune ] || unexpected "$@"; exit 0;;
      rev-parse) if [ "$2" = origin/main ]; then echo "$HARNESS_MAIN"; exit 0; fi
        if [ "$2" = HEAD ]; then read -r h < "$d/head"; echo "$h"; exit 0; fi;;
      checkout) [ "$2" = -q ] && [ "$3" = --detach ] || unexpected "$@"; echo "$4" > "$d/head"; exit 0;;
    esac
    unexpected "$@";;
  node) [ "$1" = ${GUARD} ] || unexpected "$@"
    [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || unexpected "the guard ran without the harness environment"
    printf 'host: harness.invalid\\nport: 5432\\nref:  harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
  psql) [ "$1" = "$HARNESS_DBURL" ] || unexpected "psql ran without the harness URL"
    f=; prev=; for a in "$@"; do if [ "$prev" = -f ]; then f="$a"; fi; prev="$a"; done
    [ -f "$f" ] || { echo "psql: error: $f: No such file or directory" >&2; exit 1; }
    case "$f" in
      *ficha-v6-1-measure.sql) fx=stage1;;
      *ficha-v6-2-write.sql) fx=stage2;;
      *ficha-v6-3-verify.sql) fx=stage3;;
      *) unexpected "$@";;
    esac
    if [ -n "$HARNESS_PSQL_FIX" ]; then fx="$HARNESS_PSQL_FIX"; fi
    ${R("cat")} "$HARNESS_FIX/$fx.out"; exit "\${HARNESS_PSQL_EXIT:-0}";;
  date) [ "$TZ" = Europe/Lisbon ] || unexpected "date ran without TZ=Europe/Lisbon [TZ=$TZ]"
    [ "$1" = '+%Y%m%d%H%M %u %Z' ] || unexpected "$@"
    echo "$HARNESS_STAMP $HARNESS_DOW $HARNESS_ZONE"; exit 0;;
esac
exec ${R(name)} "$@"
`;
}

const refusalLine = (code, verdict = "OK") => ` ${code}  | the predicate of ${code}                                    | ${verdict === "REFUSE" ? 1 : 0} |      42 | ${verdict}`;
const STAGE1_OUT = (over = {}) =>
  [
    "",
    "=== FICHA-V6, STAGE 1. READ ONLY. ===",
    " read_only |    isolation    ",
    "-----------+-----------------",
    " on        | repeatable read",
    "(1 row)",
    "",
    "=== 1. EVERY TENANT: its osteopathy versions, its version 5 against the repo version 5, and what stage 2 does with it ===",
    "              tenant_id               | slug | osteopathy_versions | v5_active |          v5_schema_md5           | v5_is_repo_v5 |  plan  ",
    "--------------------------------------+------+---------------------+-----------+----------------------------------+---------------+--------",
    ` d0000000-0000-4000-8000-000000000001 | demo | [1, 2, 3, 4, 5]     | true      | ${MD5.v5} | yes           | INSERT`,
    "(1 row)",
    "",
    "=== 4. THE CARRIES. Stage 2 is given these and refuses if any has moved ===",
    "    carry     |              value               ",
    "--------------+----------------------------------",
    ...(over.noCarries ? [] : [" fv6_count    | 1", ` fv6_tenants  | ${"a".repeat(32)}`, " fv6_rows     | 13", ` fv6_baseline | ${"b".repeat(32)}`]),
    "(4 rows)",
    "",
    "=== 5. THE REFUSALS. Any REFUSE stops the sitting here; stage 2 refuses on the same lines ===",
    " code |                        refuses_when                         | n | control | verdict ",
    "------+-------------------------------------------------------------+---+---------+---------",
    ...["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08"].slice(0, over.refusals ?? 8).map((c) => refusalLine(c, over.refuse === c ? "REFUSE" : "OK")),
    "(8 rows)",
    "",
    "=== FICHA-V6 STAGE 1 COMPLETE. Nothing was written. ===",
    "",
  ].join("\n");
const STAGE2_OUT = (over = {}) =>
  [
    "",
    "=== FICHA-V6, STAGE 2. ONE TRANSACTION, THE TABLE LOCKED BEFORE THE FIRST READ. ===",
    " carries_lifted ",
    "----------------",
    "              4",
    "(1 row)",
    "",
    "NOTICE:  L1 locked form_templates (share row exclusive); lock_timeout 5s",
    "NOTICE:  W1 inserted 1 row(s), osteopathy version 6",
    ...(over.noDone ? [] : ["NOTICE:  FICHA-V6 STAGE 2 DONE: 1 osteopathy version 6 row(s) inserted, 1 audit row(s)"]),
    "DO",
    "COMMIT",
    "",
    "=== FICHA-V6 STAGE 2 COMMITTED ===",
    "",
  ].join("\n");
const STAGE3_OUT = (over = {}) => {
  const verdicts = Array.from({ length: over.verdicts ?? 10 }, (_, i) => {
    const n = i + 1;
    const v = over.verdict?.[n] ?? "OK";
    return ` ${String(n).padStart(2)} | the check of verdict ${n} | observed | expected | ${v}`;
  });
  const ok = verdicts.filter((l) => l.endsWith("| OK")).length;
  return [
    "",
    "=== FICHA-V6, STAGE 3. READ ONLY. Every verdict must read OK ===",
    "  n |        check         | observed | expected | verdict ",
    "----+----------------------+----------+----------+---------",
    ...verdicts,
    ` 99 | SUMMARY | ${ok} OK / 0 VACUOUS / ${verdicts.length - ok} FAIL | ${verdicts.length} verdicts | SUMMARY`,
    `(${verdicts.length + 1} rows)`,
    "",
    "=== FICHA-V6 STAGE 3 COMPLETE. Nothing was written. ===",
    "",
  ].join("\n");
};
const FIXTURES = {
  stage1: STAGE1_OUT(),
  stage1refuse: STAGE1_OUT({ refuse: "R03" }),
  stage1seven: STAGE1_OUT({ refusals: 7 }),
  stage1nocarry: STAGE1_OUT({ noCarries: true }),
  stage2: STAGE2_OUT(),
  stage2nodone: STAGE2_OUT({ noDone: true }),
  stage3: STAGE3_OUT(),
  stage3fail: STAGE3_OUT({ verdict: { 9: "FAIL" } }),
  stage3vacuous: STAGE3_OUT({ verdict: { 3: "VACUOUS" } }),
  stage3nine: STAGE3_OUT({ verdicts: 9 }),
};

/** The shared base of a sweep: the stubs, the fixtures, a fake env file, and a fake apply worktree holding the real files. */
function prepareHarness(base) {
  for (const dir of ["bin", "fix", "apply"]) mkdirSync(join(base, dir), { recursive: true });
  const real = Object.fromEntries([...STUBBED.filter((n) => !FAKED.has(n)), "cat"].map((n) => [n, realPath(n)]));
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, real));
    chmodSync(join(base, "bin", n), 0o755);
  }
  for (const [f, t] of Object.entries(FIXTURES)) writeFileSync(join(base, "fix", `${f}.out`), t);
  writeFileSync(join(base, "fake-prod.env"), `DATABASE_URL_DIRECT=${FAKE_DB_URL}\nDATABASE_URL=${FAKE_DB_URL}\n`);
  for (const f of APPLY_FILES) {
    mkdirSync(dirname(join(base, "apply", f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(base, "apply", f));
  }
}

/** The block with its real paths moved into the run folder. A block that still names one is refused unrun. */
export function localize(block, run, envFile) {
  const out = block.replaceAll(PROD_APPLY, join(run, "apply")).replaceAll(PROD_ENV, envFile).replaceAll("/tmp/fv6-", join(run, "tmp/fv6-"));
  const rest = out.replaceAll(join(run, "tmp/fv6-"), "").replaceAll(join(run, "apply"), "").replaceAll(envFile, "");
  for (const bad of ["/tmp/", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
    if (rest.includes(bad)) throw new Error(`the localized block still names ${bad}`);
  }
  return out;
}

/** GREEN's tool shape. zsh: exactly it. bash: the same, with errexit forced off, as zsh has it there. */
export function shellArgs(shell, text) {
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  if (shell === "zsh") return ["zsh", ["-f", "-c", tail]];
  if (shell === "bash") return ["bash", ["--noprofile", "--norc", "-c", `set() { builtin set "$@"; builtin set +e; }; ${tail}`]];
  throw new Error(`no shell ${shell}`);
}

function runShell(shell, text, env, cwd) {
  const [cmd, args] = shellArgs(shell, text);
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (out += b));
    const t = setTimeout(() => p.kill("SIGKILL"), 60000);
    p.on("close", (c) => {
      clearTimeout(t);
      resolve({ code: c ?? 128, out });
    });
  });
}

const putRecord = (tmp, name, text, minutesAgo) => {
  const f = join(tmp, name);
  writeFileSync(f, text);
  const t = new Date(Date.now() - minutesAgo * 60000);
  utimesSync(f, t, t);
};

/** What each block finds on disk before it runs, written older than its start. */
const SETUPS = {
  stage0: (tmp) => {
    putRecord(tmp, "fv6-main.sha", `${OTHER}\n`, 600);
    putRecord(tmp, "fv6-stage1.ok", `${OTHER}\n`, 600);
    putRecord(tmp, "fv6-stage1.out", "stale\n", 600);
  },
  stage1: (tmp) => putRecord(tmp, "fv6-main.sha", `${MAIN}\n`, 5),
  stage2: (tmp) => {
    putRecord(tmp, "fv6-main.sha", `${MAIN}\n`, 10);
    putRecord(tmp, "fv6-stage1.out", FIXTURES.stage1, 5);
    putRecord(tmp, "fv6-stage1.ok", `${MAIN}\n`, 5);
  },
  stage3: (tmp) => {
    putRecord(tmp, "fv6-main.sha", `${MAIN}\n`, 15);
    putRecord(tmp, "fv6-stage1.out", FIXTURES.stage1, 10);
    putRecord(tmp, "fv6-stage1.ok", `${MAIN}\n`, 10);
    putRecord(tmp, "fv6-written.ok", "", 2);
    putRecord(tmp, "fv6-stage2.out", FIXTURES.stage2, 2);
  },
};

/** Run one block once; `fault` null is the positive control. */
async function runOnce(cfg, runId, fault) {
  const run = join(cfg.base, "runs", runId);
  rmSync(run, { recursive: true, force: true });
  mkdirSync(join(run, "tmp"), { recursive: true });
  if (!fault?.noApply) symlinkSync(join(cfg.base, "apply"), join(run, "apply"));
  writeFileSync(join(run, "head"), `${cfg.name === "stage0" ? BEFORE : MAIN}\n`);
  (cfg.setup ?? SETUPS[cfg.name])(join(run, "tmp"));
  const t0 = Date.now() - 30000;
  writeFileSync(join(run, "t0"), "");
  utimesSync(join(run, "t0"), new Date(t0), new Date(t0));
  const text = localize(blockOf(cfg.name), run, fault?.noEnv ? join(run, "no-such.env") : join(cfg.base, "fake-prod.env"));
  const s = cfg.scenario ?? {};
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL, HARNESS_MAIN: s.main ?? MAIN,
    HARNESS_STAMP: s.stamp ?? "000101012230", HARNESS_DOW: s.dow ?? "4", HARNESS_ZONE: s.zone ?? "WET",
    HARNESS_STRAY: s.stray ?? "", HARNESS_PSQL_FIX: s.psqlFix ?? "", HARNESS_PSQL_EXIT: String(s.psqlExit ?? 0),
    HARNESS_FAIL: fault?.call ?? "",
  };
  const r = await runShell(cfg.shell, text, env, join(cfg.base, "apply"));
  const readRun = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = readRun("log").trim().split("\n").filter(Boolean).map((l, pos) => {
    const [id, ex] = l.split("|");
    return { id, pos, exists: ex.trim() ? ex.trim().split(" ") : [], args: readRun(`args.${id}`) };
  });
  const recordsAtEnd = RECORDS.filter((m) => {
    try {
      const st = statSync(join(run, "tmp", m));
      return st.isFile() && st.mtimeMs > t0;
    } catch {
      return false;
    }
  });
  const result = { ...r, calls, recordsAtEnd, unexpected: readRun("unexpected"), fired: readRun("fired").trim() };
  rmSync(run, { recursive: true, force: true });
  return result;
}

const describeCall = (call) => `${call.id.split("#")[0]} ${call.args.split("\n").filter(Boolean).map((a) => (a.length > 60 ? `${a.slice(0, 30)}...${a.slice(-20)}` : a)).join(" ")}`;

/** The position before which each record a block writes did not exist in its positive control. */
function writePoints(positive, records) {
  const wp = {};
  for (const m of records) {
    const first = positive.calls.find((c) => c.exists.includes(m));
    wp[m] = first ? first.pos - 1 : positive.calls.length;
  }
  return wp;
}

async function inPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Sweep one block: the positive control, then every external call made to fail in turn, plus the cd and env faults. */
async function sweep(cfg) {
  const positive = await runOnce(cfg, `${cfg.id}-positive`, null);
  const posProblems = [];
  if (positive.code !== 0) posProblems.push(`exit ${positive.code}`);
  if (!positive.out.includes(SUCCESS[cfg.name])) posProblems.push("its last line is missing");
  if (!positive.out.includes("TOOL-CHAIN-CONTINUED")) posProblems.push("the tool chain did not continue");
  if (positive.unexpected) posProblems.push(`unexpected calls: ${positive.unexpected}`);
  if (/^STOP: /m.test(positive.out)) posProblems.push("a STOP line");
  for (const m of RECORDS_OF[cfg.name]) if (!positive.recordsAtEnd.includes(m)) posProblems.push(`it did not write ${m}`);
  if (posProblems.length) return { positive, posProblems, rows: [] };
  const wp = writePoints(positive, RECORDS_OF[cfg.name]);
  const faults = positive.calls.map((c) => ({ call: c.id, label: describeCall(c), pos: c.pos }));
  faults.push({ kind: "cd", label: "cd: the apply worktree is not there", noApply: true, pos: -1 });
  const guardAt = positive.calls.find((c) => c.id.startsWith("node#"));
  if (guardAt) faults.push({ kind: "env", label: ". the env file is not there", noEnv: true, pos: guardAt.pos - 1 });
  const rows = await inPool(faults, Number(process.env.HARNESS_POOL) || Math.max(2, cpus().length), async (f, i) => {
    const r = await runOnce(cfg, `${cfg.id}-f${i}`, f);
    const id = f.call ?? f.kind;
    const halted = r.code !== 0 && !r.out.includes("TOOL-CHAIN-CONTINUED");
    const problems = [];
    if (f.call && r.fired !== f.call) problems.push(`the fault at ${f.call} never fired`);
    if (r.unexpected) problems.push(`unexpected calls: ${r.unexpected.trim()}`);
    if (r.code === 0) problems.push("(a) exit 0");
    if (r.out.includes("TOOL-CHAIN-CONTINUED")) problems.push("(a) the tool chain continued");
    if (r.out.includes(SUCCESS[cfg.name])) problems.push("(b) printed its last line");
    for (const m of r.recordsAtEnd) if (wp[m] !== undefined && wp[m] > f.pos) problems.push(`(c) wrote ${m}`);
    if (!/^STOP: /m.test(r.out)) problems.push("no STOP line");
    const stop = (r.out.match(/^STOP: .*$/m) ?? [""])[0];
    return { fault: f.label, call: id, halted, problems, out: r.out, result: halted ? `halts, exit ${r.code}: ${stop.slice(0, 100)}` : `DOES NOT HALT, exit ${r.code}` };
  });
  return { positive, posProblems, rows };
}

function zshOrSkip(t) {
  if (hasShell("zsh")) return true;
  if (process.env.GITHUB_ACTIONS === "true") {
    t.skip("zsh is not on the CI runner (ubuntu-latest); the bash arm ran here instead");
    return false;
  }
  assert.fail("zsh is not on this machine, and the zsh arm of the fault-injection harness must run wherever it is not the GitHub runner");
}

async function sweepAll(t, shell) {
  const base = mkdtempSync(join(tmpdir(), `fault-fv6-${shell}-`));
  try {
    prepareHarness(base);
    const bad = [];
    for (const name of NAMES) {
      const r = await sweep({ id: `${shell}-${name}`, name, shell, base });
      assert.deepEqual(r.posProblems, [], `${shell} ${name}: the positive control did not reach its last line\n${r.positive.out.slice(-3000)}`);
      assert.ok(r.rows.length > r.positive.calls.length, `${shell} ${name}: ${r.rows.length} faults`);
      t.diagnostic(`${shell} ${name}: positive reaches its last line; ${r.rows.length} faults, ${r.rows.filter((x) => x.halted).length} halt`);
      for (const row of r.rows) {
        if (process.env.FAULT_TABLE === "1") t.diagnostic(`  ${name} | ${row.call} | ${row.fault.slice(0, 110)} | ${row.result}`);
        if (row.problems.length) bad.push(`${shell} ${name} ${row.call} [${row.fault}]: ${row.problems.join("; ")}\n${row.out.slice(-700)}`);
      }
      if (name === "stage2") {
        const p = r.positive.calls.find((c) => c.id.startsWith("psql#"));
        const args = p.args.split("\n").filter(Boolean);
        assert.deepStrictEqual(args.filter((a, i) => args[i - 1] === "-v" && a.startsWith("fv6_")), [
          "fv6_count=1", `fv6_tenants=${"a".repeat(32)}`, "fv6_rows=13", `fv6_baseline=${"b".repeat(32)}`,
        ], "stage 2 did not hand psql the four carries of stage 1's transcript");
      }
    }
    assert.deepEqual(bad, [], `fault rows that broke a rule:\n${bad.join("\n")}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** Scenarios: each must stop its block with the STOP named, write none of its records, and leave psql uncalled where named. */
const SCENARIOS = [
  { name: "stage0", tag: "clinic-open", scenario: { dow: "3", stamp: "000101011000" }, stop: "is inside clinic hours by the weekday table" },
  { name: "stage0", tag: "saturday-noon", scenario: { dow: "6", stamp: "000101011200" }, stop: "is inside clinic hours by the weekday table" },
  { name: "stage0", tag: "zone-utc", scenario: { zone: "UTC" }, stop: "the zone WET or WEST" },
  { name: "stage0", tag: "dirty", scenario: { stray: " M scripts/data/ficha-v6-1-measure.sql" }, stop: "the apply worktree is not clean" },
  { name: "stage0", tag: "written", setup: (tmp) => putRecord(tmp, "fv6-written.ok", "", 900), stop: "stage 2 has ALREADY WRITTEN" },
  { name: "stage1", tag: "main-moved", scenario: { main: OTHER }, stop: "main moved since stage 0", noPsql: true, noGuard: true },
  { name: "stage1", tag: "no-recorded-sha", setup: () => {}, stop: "stage 0 recorded no sha in this sitting", noPsql: true },
  { name: "stage1", tag: "refuse", scenario: { psqlFix: "stage1refuse" }, stop: "stage 1 printed REFUSE on 1 line(s)" },
  { name: "stage1", tag: "seven-refusals", scenario: { psqlFix: "stage1seven" }, stop: "stage 1 printed 7 refusal lines, not 8" },
  { name: "stage1", tag: "psql-error", scenario: { psqlExit: 3 }, stop: "stage 1 failed in the database" },
  { name: "stage1", tag: "written", setup: (tmp) => { SETUPS.stage1(tmp); putRecord(tmp, "fv6-written.ok", "", 900); }, stop: "stage 2 has ALREADY WRITTEN", noPsql: true },
  { name: "stage1", tag: "clinic-open", scenario: { dow: "1", stamp: "000101010800" }, stop: "is inside clinic hours by the weekday table", noPsql: true },
  { name: "stage2", tag: "main-moved", scenario: { main: OTHER }, stop: "main moved since stage 0", noPsql: true, noGuard: true },
  { name: "stage2", tag: "pass-on-another-sha", setup: (tmp) => { SETUPS.stage2(tmp); putRecord(tmp, "fv6-stage1.ok", `${OTHER}\n`, 5); }, stop: "stage 1 did not pass on the recorded sha", noPsql: true },
  { name: "stage2", tag: "pass-too-old", setup: (tmp) => { SETUPS.stage2(tmp); putRecord(tmp, "fv6-stage1.ok", `${MAIN}\n`, 61); }, stop: "stage 1 passed over an hour ago", noPsql: true },
  { name: "stage2", tag: "no-pass", setup: (tmp) => { putRecord(tmp, "fv6-main.sha", `${MAIN}\n`, 10); putRecord(tmp, "fv6-stage1.out", FIXTURES.stage1, 5); }, stop: "stage 1 did not pass in this sitting", noPsql: true },
  { name: "stage2", tag: "no-carries", setup: (tmp) => { SETUPS.stage2(tmp); putRecord(tmp, "fv6-stage1.out", FIXTURES.stage1nocarry, 5); }, stop: "carry fv6_count did not parse", noPsql: true },
  { name: "stage2", tag: "db-stop", scenario: { psqlExit: 3 }, stop: "NOTHING WAS WRITTEN" },
  { name: "stage2", tag: "no-done", scenario: { psqlFix: "stage2nodone" }, stop: "THE WRITE STANDS, but its DONE line is missing", wrote: ["fv6-written.ok"] },
  { name: "stage2", tag: "written", setup: (tmp) => { SETUPS.stage2(tmp); putRecord(tmp, "fv6-written.ok", "", 900); }, stop: "stage 2 has ALREADY WRITTEN", noPsql: true },
  { name: "stage2", tag: "clinic-open", scenario: { dow: "5", stamp: "000101012059" }, stop: "is inside clinic hours by the weekday table", noPsql: true },
  { name: "stage3", tag: "fail", scenario: { psqlFix: "stage3fail" }, stop: "1 stage 3 verdict(s) read FAIL" },
  { name: "stage3", tag: "vacuous", scenario: { psqlFix: "stage3vacuous" }, stop: "1 stage 3 verdict(s) read VACUOUS" },
  { name: "stage3", tag: "nine", scenario: { psqlFix: "stage3nine" }, stop: "stage 3 printed 9 verdicts, not 10" },
  { name: "stage3", tag: "no-recorded-sha", setup: () => {}, stop: "stage 0 recorded no sha in this sitting", noPsql: true },
];

async function scenariosAll(t, shell) {
  const base = mkdtempSync(join(tmpdir(), `scen-fv6-${shell}-`));
  try {
    prepareHarness(base);
    const bad = [];
    const rows = await inPool(SCENARIOS, Number(process.env.HARNESS_POOL) || Math.max(2, cpus().length), async (sc) => {
      const r = await runOnce({ id: `${shell}-${sc.name}-${sc.tag}`, name: sc.name, shell, base, scenario: sc.scenario, setup: sc.setup }, `${shell}-${sc.name}-${sc.tag}`, null);
      const problems = [];
      if (r.code === 0 || r.out.includes("TOOL-CHAIN-CONTINUED")) problems.push(`it did not halt (exit ${r.code})`);
      if (r.out.includes(SUCCESS[sc.name])) problems.push("it printed its last line");
      if (!r.out.split("\n").some((l) => l.startsWith("STOP: ") && l.includes(sc.stop))) problems.push(`no STOP line naming: ${sc.stop}`);
      if (r.unexpected) problems.push(`unexpected calls: ${r.unexpected.trim()}`);
      if (sc.noPsql && r.calls.some((c) => c.id.startsWith("psql#"))) problems.push("psql ran");
      if (sc.noGuard && r.calls.some((c) => c.id.startsWith("node#"))) problems.push("the target guard ran");
      const want = sc.wrote ?? [];
      for (const m of r.recordsAtEnd) if (!want.includes(m)) problems.push(`it wrote ${m}`);
      for (const m of want) if (!r.recordsAtEnd.includes(m)) problems.push(`it did not write ${m}`);
      return { sc, problems, out: r.out };
    });
    for (const row of rows) {
      t.diagnostic(`${shell} ${row.sc.name} ${row.sc.tag}: ${row.problems.length ? "BROKE A RULE" : "halts as it must"}`);
      if (row.problems.length) bad.push(`${shell} ${row.sc.name} ${row.sc.tag}: ${row.problems.join("; ")}\n${row.out.slice(-900)}`);
    }
    // Stage 3 after a moved main still verifies, from the recorded sha, and says so.
    const moved = await runOnce({ id: `${shell}-stage3-moved`, name: "stage3", shell, base, scenario: { main: OTHER } }, `${shell}-stage3-moved`, null);
    assert.equal(moved.code, 0, moved.out.slice(-1500));
    assert.ok(moved.out.includes(`MAIN MOVED since stage 0: recorded ${MAIN}, origin/main now ${OTHER}.`));
    assert.ok(moved.out.includes(SUCCESS.stage3));
    assert.deepEqual(bad, [], `scenarios that broke a rule:\n${bad.join("\n")}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("THE FAULT INJECTION, bash: every external call made to fail stops every block, before its last line and its records", { timeout: 600000 }, async (t) => {
  await sweepAll(t, "bash");
});

test("THE FAULT INJECTION, zsh: the same, in the shell GREEN pastes into", { timeout: 600000 }, async (t) => {
  if (!zshOrSkip(t)) return;
  await sweepAll(t, "zsh");
});

test("THE SCENARIOS, bash: the clock, the zone, a dirty tree, a moved main, a refusal, a stale pass, a database STOP, a missing DONE, a FAIL", { timeout: 600000 }, async (t) => {
  await scenariosAll(t, "bash");
});

test("THE SCENARIOS, zsh", { timeout: 600000 }, async (t) => {
  if (!zshOrSkip(t)) return;
  await scenariosAll(t, "zsh");
});
