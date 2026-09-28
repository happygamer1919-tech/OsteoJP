// 0097 (migration staging index, HELD): the migration's shape, and the two
// check files agree with it, byte for byte where it matters.
//
// WHAT THIS PROVES, statically, with no database:
//   * THE FILE IS TWO STATEMENTS AND NO MORE: exactly one CREATE INDEX and
//     one COMMENT ON INDEX on the index it creates. The SQL is read with a
//     small lexer, so a comment, a string literal or a quoted identifier can
//     neither hide a statement nor fake one: a `;` inside the COMMENT text
//     splits nothing, and a statement after a line comment is still seen;
//   * THE CREATE INDEX: IF NOT EXISTS, never CONCURRENTLY (drizzle runs every
//     pending migration inside one transaction), not UNIQUE, named
//     migration_staging_imported_entity_idx, ON public.migration_staging_rows,
//     USING btree, keyed EXACTLY (imported_entity_id, entity_type) in that
//     order, WHERE imported_entity_id IS NOT NULL. The order is load-bearing:
//     under row level security entity_type cannot be an index condition
//     (enum `=` is not leakproof), so the other order is never used by the
//     app; see the migration's section 4;
//   * NO DROP, ALTER, DELETE, UPDATE, INSERT, TRUNCATE, GRANT OR REVOKE
//     anywhere in the file's code. Comments and string literals do not
//     count, either way: a forbidden word in a comment is not a statement,
//     and a green arm below proves the rule is not so tight that prose trips
//     it;
//   * the pre-check's "0097 is absent, by hash" and the post-check's "0097 is
//     in the journal, by hash" pin the sha256 of the migration as it stands.
//     A promotion changes no byte, so this is the hash the journal carries;
//   * the pre-check expects the index's name absent (verdict 3) and no index
//     keying the target column (verdict 4, read from target_keyed's OWN
//     subquery), and the post-check's verdicts compare the definition, the
//     key and the predicate to the values DERIVED FROM THIS MIGRATION, and
//     the comment to the md5 of the COMMENT text in it. A pin that is only in
//     a comment does not count;
//   * EVERY PART OF BOTH VERDICT QUERIES IS THE REVIEWED TEXT: each CTE, each
//     column of j and p, each verdict row's label, observed, expected and
//     verdict, the frame around the rows and the final SELECT, compared with
//     comments removed and whitespace collapsed. What the migration fixes
//     (the index's name, table and key, its definition, predicate and
//     comment md5, the file's sha256) is taken FROM the migration. The SWEEP
//     controls replace every verdict, every observed value and every column
//     of both files in turn and require each copy red on that part; a GREEN
//     arm requires a reflowed, re-indented, commented copy green;
//   * the migration is read WHERE IT STANDS: parked in migrations-pending
//     now, or promoted into migrations/ as 0097. Both, or neither, is red;
//   * THE APPLY DOCUMENT QUOTES THE REAL FILES: every sha256 a block of
//     docs/migration-apply-0097.md sets is the sha256 of the file on disk it
//     is compared with; stages 1 and 2 compare every file they run or read
//     before they load the production credentials, and stage 1 compares
//     every file stage 2 reads, so a post-check edited on the branch stops
//     the sitting BEFORE the apply; the facts table quotes each file's real
//     sha256; and docs/migration-apply-0097.sha256 is the document's sha256.
//
// Each rule is a function of the texts it reads. The tests run it on the
// committed files; the CONTROLS run the SAME function on a seeded wrong copy
// and require it to go red with that rule's own message; the GREEN arms run it
// on a copy that must stay green.
//
// WHAT IT DOES NOT PROVE: that any of it runs, or what the planner does with
// it. That is the rehearsal's job (docs/migration-apply-0097.md).
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** The migration parked, and the same bytes after the promotion renames it. */
const PENDING_PATH = "packages/db/migrations-pending/NEXT-AFTER-0096_migration_staging_imported_entity_idx.sql";
const PROMOTED_PATH = "packages/db/migrations/0097_migration_staging_imported_entity_idx.sql";

/** Where the migration stands: exactly one of the two places. `exists` answers for a repo path. */
function locateMigration(exists) {
  const found = [PENDING_PATH, PROMOTED_PATH].filter((p) => exists(p));
  assert.equal(found.length, 1,
    `the 0097 migration must stand in exactly one of ${PENDING_PATH} and ${PROMOTED_PATH}; found ${found.length}`);
  return found[0];
}

const MIGRATION_PATH = locateMigration((p) => existsSync(join(ROOT, p)));
const PRE = "scripts/db/precheck-0097-staging-imported-entity-idx.sql";
const POST = "scripts/db/postcheck-0097-staging-imported-entity-idx.sql";

const migration = read(MIGRATION_PATH);
const pre = read(PRE);
const post = read(POST);

/** What the ruling and the measurement fix. */
const INDEX_NAME = "migration_staging_imported_entity_idx";
const TABLE = "public.migration_staging_rows";
const KEY = ["imported_entity_id", "entity_type"];
const PREDICATE = "imported_entity_id IS NOT NULL";
const FORBIDDEN = ["DROP", "ALTER", "DELETE", "UPDATE", "INSERT", "TRUNCATE", "GRANT", "REVOKE"];

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ---------------------------------------------------------------------------
// THE LEXER. A migration reaches Postgres in two steps, and this reads it the
// same way: drizzle first splits the file on the text "--> statement-breakpoint"
// WHEREVER it stands (drizzle-orm 0.45.2 migrator.js:16), then sends
// each chunk to Postgres, which lexes it by its own rules for comments,
// literals and identifiers. So text after a breakpoint on the same line is
// CODE to drizzle, although Postgres alone would read it as a comment, and a
// statement smuggled there is caught. The check files are psql scripts and
// are read with the Postgres rules alone.
// ---------------------------------------------------------------------------

const WORD = /[A-Za-z0-9_$]/;

/**
 * Split SQL into top-level statements. Each statement carries
 *   code      comments removed, every string literal replaced by `?`, and a
 *             quoted identifier unquoted when it is a plain lower-case name;
 *   bare      the same with EVERY quoted identifier blanked, for keyword scans;
 *   literals  the values of its string literals, in order;
 * and `stripped` is the whole text with comments removed and everything else,
 * literals included, verbatim.
 */
function lexPostgres(sql) {
  const statements = [];
  let code = "";
  let bare = "";
  let literals = [];
  let stripped = "";
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const flush = () => {
    if (code.trim()) statements.push({ code: norm(code), bare: norm(bare), literals });
    code = "";
    bare = "";
    literals = [];
  };
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    const prevIsWord = i > 0 && WORD.test(sql[i - 1]);
    if (c === "-" && d === "-") {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? n : end;
      code += " "; bare += " "; stripped += " ";
      continue;
    }
    if (c === "/" && d === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; }
        else if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      assert.equal(depth, 0, "lexer: an unterminated block comment");
      code += " "; bare += " "; stripped += " ";
      continue;
    }
    if (c === "'" || ((c === "E" || c === "e") && d === "'" && !prevIsWord)) {
      const start = i;
      const escapes = c !== "'";
      i += escapes ? 2 : 1;
      let value = "";
      for (;;) {
        assert.ok(i < n, "lexer: an unterminated string literal");
        const ch = sql[i];
        if (escapes && ch === "\\") { value += sql[i + 1]; i += 2; continue; }
        if (ch === "'") {
          if (sql[i + 1] === "'") { value += "'"; i += 2; continue; }
          i++;
          break;
        }
        value += ch;
        i++;
      }
      literals.push(value);
      code += " ? "; bare += " ? "; stripped += sql.slice(start, i);
      continue;
    }
    if (c === "$" && !prevIsWord) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        assert.ok(end >= 0, "lexer: an unterminated dollar-quoted string");
        literals.push(sql.slice(i + tag.length, end));
        stripped += sql.slice(i, end + tag.length);
        i = end + tag.length;
        code += " ? "; bare += " ? ";
        continue;
      }
    }
    if (c === '"') {
      let j = i + 1;
      let name = "";
      for (;;) {
        assert.ok(j < n, "lexer: an unterminated quoted identifier");
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { name += '"'; j += 2; continue; }
          break;
        }
        name += sql[j];
        j++;
      }
      stripped += sql.slice(i, j + 1);
      i = j + 1;
      code += /^[a-z_][a-z0-9_$]*$/.test(name) ? name : `"${name}"`;
      bare += " ";
      continue;
    }
    if (c === ";") {
      flush();
      stripped += c;
      i++;
      continue;
    }
    code += c; bare += c; stripped += c;
    i++;
  }
  flush();
  return { statements, stripped };
}

/** The statements drizzle and Postgres together would run from a migration file. */
function lexMigration(sql) {
  return { statements: sql.split("--> statement-breakpoint").flatMap((chunk) => lexPostgres(chunk).statements) };
}

/** The CREATE INDEX statement's parts, or null when it is not one this parser reads. */
const CREATE_INDEX = /^CREATE (UNIQUE )?INDEX (CONCURRENTLY )?(IF NOT EXISTS )?([a-z_][a-z0-9_]*) ON (ONLY )?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*) USING ([a-z]+) ?\(([^()]*)\)(?: WHERE (.+))?$/i;

function parseIndex(statement) {
  const m = CREATE_INDEX.exec(statement.code);
  if (!m) return null;
  return {
    unique: Boolean(m[1]),
    concurrently: Boolean(m[2]),
    ifNotExists: Boolean(m[3]),
    name: m[4],
    only: Boolean(m[5]),
    table: m[6],
    method: m[7],
    key: m[8].split(",").map((s) => s.trim()),
    predicate: m[9] ?? null,
  };
}

/** The COMMENT ON INDEX statement's target and text (adjacent literals concatenate, as in SQL). */
function parseComment(statement) {
  const m = /^COMMENT ON INDEX ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*) IS ((?:\? ?)+)$/i.exec(statement.code);
  if (!m) return null;
  return { target: m[1], text: statement.literals.join("") };
}

/** The whole migration, read into the index it creates and the comment it sets. */
function readMigration(sql) {
  const { statements } = lexMigration(sql);
  const creates = statements.filter((s) => /\bCREATE\b[\s\S]*\bINDEX\b/i.test(s.bare));
  assert.equal(creates.length, 1, `the migration must hold exactly one CREATE INDEX; found ${creates.length}`);
  const index = parseIndex(creates[0]);
  assert.ok(index, `the CREATE INDEX is not in a shape this test reads: ${creates[0].code}`);
  const comments = statements.map(parseComment).filter(Boolean);
  return { statements, index, comments };
}

// ---------------------------------------------------------------------------
// THE RULES. Each throws an AssertionError with its own message.
// ---------------------------------------------------------------------------

function assertTwoStatementsOnly(sql) {
  const { statements, index, comments } = readMigration(sql);
  assert.equal(statements.length, 2,
    `the migration must be exactly two statements (the CREATE INDEX and its COMMENT); found ${statements.length}`);
  assert.equal(comments.length, 1, "the migration must hold exactly one COMMENT ON INDEX");
  assert.equal(comments[0].target, `public.${index.name}`,
    `the COMMENT must be on the index the file creates, public.${index.name}; it is on ${comments[0].target}`);
  assert.ok(comments[0].text.trim().length > 0, "the COMMENT ON INDEX says nothing");
}

function assertIndexShape(sql) {
  const { index } = readMigration(sql);
  assert.equal(index.concurrently, false,
    "the CREATE INDEX must not be CONCURRENTLY: drizzle runs every pending migration inside one transaction");
  assert.equal(index.ifNotExists, true, "the CREATE INDEX must say IF NOT EXISTS");
  assert.equal(index.unique, false, "the index must not be UNIQUE");
  assert.equal(index.name, INDEX_NAME, `the index must be named ${INDEX_NAME}`);
  assert.equal(index.only, false, "the index must not be ON ONLY");
  assert.equal(index.table, TABLE, `the index must be on ${TABLE}; it is on ${index.table}`);
  assert.equal(index.method, "btree", "the index must be USING btree");
  assert.deepEqual(index.key, KEY,
    `the index must key exactly (${KEY.join(", ")}), in that order; it keys (${index.key.join(", ")})`);
  assert.equal(index.predicate, PREDICATE, `the index must be partial WHERE ${PREDICATE}; it is ${index.predicate ?? "not partial"}`);
}

function assertNoForbiddenVerb(sql) {
  const { statements } = lexMigration(sql);
  for (const verb of FORBIDDEN) {
    const hit = statements.find((s) => new RegExp(`\\b${verb}\\b`, "i").test(s.bare));
    assert.equal(hit, undefined, `the migration carries a ${verb}: ${hit?.code}`);
  }
}

/** A check file's code: comments removed, literals and meta-commands verbatim. */
const codeOf = (sql) => lexPostgres(sql).stripped;

function assertChecksPinTheHash(migrationText, preText, postText) {
  const want = sha256(migrationText);
  const prePins = [...codeOf(preText).matchAll(/hash\s*=\s*'([0-9a-f]{64})'\s*\)\s+AS\s+has_0097/g)].map((m) => m[1]);
  assert.equal(prePins.length, 1, "the pre-check must pin 0097's hash exactly once, in code");
  assert.equal(prePins[0], want, "the migration changed and the pre-check's has_0097 pin did not");
  const postPins = [...codeOf(postText).matchAll(/hash\s*=\s*'([0-9a-f]{64})'\s*\)\s+AS\s+has_0097/g)].map((m) => m[1]);
  assert.equal(postPins.length, 1, "the post-check must pin 0097's hash exactly once, in code");
  assert.equal(postPins[0], want, "the migration changed and the post-check's has_0097 pin did not");
}

// ---------------------------------------------------------------------------
// THE CHECK FILES, READ PART BY PART. Each check's verdicts come from ONE
// query, WITH t, ix (and new_ix), j, p, r, s, then a final SELECT: j and p
// compute named columns, r's VALUES rows are the verdicts, s adds the SUMMARY.
// readCheck splits that query into its parts from the file's code (comments
// removed, literals verbatim) and collapses whitespace outside literals, so a
// reflow or a comment changes no part, and any change to the code changes one.
// ---------------------------------------------------------------------------

/** Index of the quote that closes the SQL literal opening at s[i] ('' is an escaped quote). */
function literalEnd(s, i) {
  for (let j = i + 1; ; ) {
    const k = s.indexOf("'", j);
    assert.ok(k >= 0, "check reader: an unterminated literal");
    if (s[k + 1] === "'") { j = k + 2; continue; }
    return k;
  }
}

/** Calls visit(i, c, depth) for each code character of s, stepping over literals and quoted identifiers; false stops. */
function walkCode(s, visit) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { i = literalEnd(s, i); continue; }
    if (c === '"') {
      i = s.indexOf('"', i + 1);
      assert.ok(i >= 0, "check reader: an unterminated quoted identifier");
      continue;
    }
    if (c === "(") depth++;
    if (visit(i, c, depth) === false) return;
    if (c === ")") depth--;
  }
}

/** The index of the parenthesis closing the one at s[open]. */
function closingParen(s, open) {
  let at = -1;
  walkCode(s.slice(open), (i, c, depth) => {
    if (c === ")" && depth === 1) { at = open + i; return false; }
    return true;
  });
  assert.ok(at > open, "check reader: an unbalanced parenthesis");
  return at;
}

/** s split on its top-level commas, each part normalised. */
function splitTopLevel(s) {
  const parts = [];
  let start = 0;
  walkCode(s, (i, c, depth) => {
    if (c === "," && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
    return true;
  });
  parts.push(s.slice(start));
  return parts.map(normalise);
}

/** Whitespace collapsed to one space outside literals, and none just inside a parenthesis. */
function normalise(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { const e = literalEnd(s, i); out += s.slice(i, e + 1); i = e; continue; }
    if (/\s/.test(c)) { if (out && !out.endsWith(" ") && !out.endsWith("(")) out += " "; continue; }
    if (c === ")" && out.endsWith(" ")) out = out.slice(0, -1);
    out += c;
  }
  return out.trim();
}

const VERDICT_QUERY = /\bWITH\s+(?=t\s+AS\s*\()/g;

/**
 * A check file's verdict query, in parts: `ctes` (name -> normalised body, in
 * order), `j` and `p` (column name -> expression, in order), `frame` (r with
 * its VALUES list elided), `rows` (verdict number -> [label, observed,
 * expected, verdict]) and `final`.
 */
function readCheck(sql) {
  const s = codeOf(sql);
  const starts = [...s.matchAll(VERDICT_QUERY)];
  assert.equal(starts.length, 1, `check reader: a check must hold exactly one verdict query (WITH t AS ...); found ${starts.length}`);
  let i = starts[0].index + starts[0][0].length;
  const ctes = new Map();
  for (;;) {
    const head = /^\s*([a-z_]+)\s+AS\s*\(/.exec(s.slice(i));
    assert.ok(head, `check reader: no CTE at ${JSON.stringify(s.slice(i, i + 40))}`);
    const open = i + head[0].length - 1;
    const close = closingParen(s, open);
    assert.ok(!ctes.has(head[1]), `check reader: the CTE ${head[1]} is defined twice`);
    ctes.set(head[1], s.slice(open + 1, close));
    i = close + 1;
    const comma = /^\s*,/.exec(s.slice(i));
    if (!comma) break;
    i += comma[0].length;
  }
  const final = /^\s*(SELECT\b[^;]*);/.exec(s.slice(i));
  assert.ok(final, "check reader: no final SELECT after the CTEs");
  const columnsOf = (name) => {
    const body = ctes.get(name);
    assert.ok(body !== undefined, `check reader: no CTE ${name}`);
    const select = /^\s*SELECT\s/.exec(body);
    assert.ok(select, `check reader: the CTE ${name} is not a SELECT list`);
    const columns = new Map();
    for (const item of splitTopLevel(body.slice(select[0].length))) {
      const m = /^([\s\S]+) AS ([a-z_][a-z0-9_]*)$/.exec(item);
      assert.ok(m, `check reader: an item of ${name} is not "<expression> AS <name>": ${item}`);
      assert.ok(!columns.has(m[2]), `check reader: ${name}.${m[2]} is defined twice`);
      columns.set(m[2], m[1]);
    }
    return columns;
  };
  const r = ctes.get("r");
  assert.ok(r !== undefined, "check reader: no CTE r");
  const open = r.search(/\(\s*VALUES\b/);
  assert.ok(open >= 0, "check reader: r has no VALUES list");
  const close = closingParen(r, open);
  const rows = new Map();
  for (const row of splitTopLevel(r.slice(open + 1, close).replace(/^\s*VALUES\b/, ""))) {
    assert.ok(row.startsWith("(") && row.endsWith(")"), `check reader: a VALUES row is not parenthesised: ${row.slice(0, 60)}`);
    const fields = splitTopLevel(row.slice(1, -1));
    assert.equal(fields.length, 5, `check reader: a VALUES row has ${fields.length} fields, not 5: ${row.slice(0, 60)}`);
    const n = Number(fields[0]);
    assert.ok(Number.isInteger(n) && String(n) === fields[0], `check reader: a verdict number is not an integer: ${fields[0]}`);
    assert.ok(!rows.has(n), `check reader: verdict ${n} appears twice`);
    rows.set(n, fields.slice(1));
  }
  return {
    ctes: new Map([...ctes].map(([k, v]) => [k, normalise(v)])),
    j: columnsOf("j"),
    p: columnsOf("p"),
    frame: normalise(`${r.slice(0, open)}(VALUES ...)${r.slice(close + 1)}`),
    rows,
    final: normalise(final[1]),
  };
}

const FIELDS = ["label", "observed", "expected", "verdict"];
const TBL = "(SELECT tbl FROM t)";
const READ_ONLY_ROW = [
  "'0. this transaction is READ ONLY (the server refuses writes)'", "current_setting('transaction_read_only')", "'on'",
  "CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END",
];
const summaryCte = (profile) => "SELECT n, \"check\", observed, expected, verdict FROM r UNION ALL " +
  "SELECT 99, 'SUMMARY. the verdict profile this run printed', " +
  "(SELECT count(*) FROM r WHERE verdict = 'OK') || ' OK / ' || " +
  "(SELECT count(*) FROM r WHERE verdict = 'VACUOUS') || ' VACUOUS / ' || " +
  `(SELECT count(*) FROM r WHERE verdict = 'FAIL') || ' FAIL', '${profile}', 'SUMMARY'`;
const FINAL = "SELECT \"check\", observed, expected, verdict FROM s ORDER BY n";
/** The target column's attnum, as both checks look it up. */
const attnumOf = (column) =>
  `(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = ${TBL} AND a.attname = '${column}' AND NOT a.attisdropped)`;
const hasHash = (sha) => `(SELECT count(*)::int FROM drizzle.__drizzle_migrations WHERE hash = '${sha}')`;
const relationsNamed = (name) =>
  `(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = '${name}')`;

/**
 * The pre-check's verdict query as reviewed. The index's name, its target
 * column and the file's sha256 come from the migration; 0014's four indexes,
 * the key columns' types and the ruled carries are constants the migration
 * does not set.
 */
function preCheckAsReviewed(migrationText) {
  const { index } = readMigration(migrationText);
  const is0014 = (column, def) => [
    `coalesce(j.${column}, 'absent')`, `'${def}'`, `CASE WHEN j.${column} = '${def}' THEN 'OK' ELSE 'FAIL' END`,
  ];
  const defOf = (name) =>
    `(SELECT def || CASE WHEN usable THEN '' ELSE ' NOT VALID, READY AND LIVE' END FROM ix WHERE relname = '${name}')`;
  const KEY_COLUMNS = "imported_entity_id pg_catalog.uuid NULL, entity_type public.migration_entity_type NOT NULL";
  return {
    ctes: {
      t: "SELECT to_regclass('public.migration_staging_rows') AS tbl",
      ix: "SELECT c.relname, pg_get_indexdef(i.indexrelid) AS def, i.indisvalid AND i.indisready AND i.indislive AS usable, " +
        `i.indisvalid, i.indisready, i.indislive FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = ${TBL}`,
      j: null,
      p: null,
      r: null,
      s: summaryCte("14 OK, or 13 OK and 1 VACUOUS; never a FAIL"),
    },
    j: {
      tbl: TBL,
      relkind: `(SELECT c.relkind::text FROM pg_class c WHERE c.oid = ${TBL})`,
      target_attnum: attnumOf(index.key[0]),
      key_columns: "(SELECT string_agg(a.attname || ' ' || tn.nspname || '.' || ty.typname || " +
        "CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE ' NULL' END, ', ' ORDER BY a.attname DESC) " +
        "FROM pg_attribute a JOIN pg_type ty ON ty.oid = a.atttypid JOIN pg_namespace tn ON tn.oid = ty.typnamespace " +
        `WHERE a.attrelid = ${TBL} AND NOT a.attisdropped AND a.attname IN ('imported_entity_id', 'entity_type'))`,
      name_taken: relationsNamed(index.name),
      target_keyed: `(SELECT count(*)::int FROM pg_index i WHERE i.indrelid = ${TBL} AND ${attnumOf(index.key[0])} = ANY (i.indkey::int2[]))`,
      def_pkey: defOf("migration_staging_rows_pkey"),
      def_source_uq: defOf("migration_staging_tenant_source_uq"),
      def_batch: defOf("migration_staging_tenant_batch_idx"),
      def_status: defOf("migration_staging_tenant_status_idx"),
      indexes: "(SELECT count(*)::int FROM ix)",
      indexes_md5: "(SELECT md5(string_agg(relname || ':' || def || ':' || indisvalid::text || ':' || " +
        "indisready::text || ':' || indislive::text, ';' ORDER BY relname)) FROM ix)",
      journal_rows: "(SELECT count(*)::int FROM drizzle.__drizzle_migrations)",
      has_0097: hasHash(sha256(migrationText)),
    },
    p: {
      ledger_rows: "(SELECT count(*)::int FROM public.migration_staging_rows)",
      with_target: "(SELECT count(*)::int FROM public.migration_staging_rows WHERE imported_entity_id IS NOT NULL)",
      with_target_records: "(SELECT count(*)::int FROM public.migration_staging_rows WHERE imported_entity_id IS NOT NULL " +
        "AND entity_type = 'clinical_record'::public.migration_entity_type)",
    },
    frame: "SELECT v.* FROM j LEFT JOIN p ON true CROSS JOIN LATERAL (VALUES ...) AS v(n, \"check\", observed, expected, verdict)",
    rows: {
      0: READ_ONLY_ROW,
      1: ["'1. public.migration_staging_rows exists, an ordinary table'",
        "coalesce(j.tbl::text || ' relkind ' || j.relkind, 'absent')", "'migration_staging_rows relkind r'",
        "CASE WHEN j.tbl IS NOT NULL AND j.relkind = 'r' THEN 'OK' ELSE 'FAIL' END"],
      2: ["'2. the two key columns carry the types 0014 gave them'", "coalesce(j.key_columns, 'absent')", `'${KEY_COLUMNS}'`,
        `CASE WHEN j.key_columns = '${KEY_COLUMNS}' THEN 'OK' ELSE 'FAIL' END`],
      3: [`'3. no relation named ${index.name} exists in public'`,
        "CASE WHEN j.tbl IS NULL THEN 'table absent' ELSE j.name_taken::text END", "'0'",
        "CASE WHEN j.tbl IS NULL THEN 'FAIL' WHEN j.name_taken = 0 THEN 'OK' ELSE 'FAIL' END"],
      4: [`'4. no index on the table keys ${index.key[0]}, under any name'`,
        "CASE WHEN j.target_attnum IS NULL THEN 'column absent' ELSE j.target_keyed::text END", "'0'",
        "CASE WHEN j.target_attnum IS NULL THEN 'FAIL' WHEN j.target_keyed = 0 THEN 'OK' ELSE 'FAIL' END"],
      5: ["'5. the primary key is 0014''s, valid, ready and live'",
        ...is0014("def_pkey", "CREATE UNIQUE INDEX migration_staging_rows_pkey ON public.migration_staging_rows USING btree (id)")],
      6: ["'6. the idempotency key is 0014''s, valid, ready and live'",
        ...is0014("def_source_uq", "CREATE UNIQUE INDEX migration_staging_tenant_source_uq ON public.migration_staging_rows " +
          "USING btree (tenant_id, source_system, entity_type, source_id)")],
      7: ["'7. the batch index is 0014''s, valid, ready and live'",
        ...is0014("def_batch", "CREATE INDEX migration_staging_tenant_batch_idx ON public.migration_staging_rows USING btree (tenant_id, batch_id)")],
      8: ["'8. the status index is 0014''s, valid, ready and live'",
        ...is0014("def_status", "CREATE INDEX migration_staging_tenant_status_idx ON public.migration_staging_rows USING btree (tenant_id, status)")],
      9: ["'9. 0097 is absent from the journal, by hash'", "j.has_0097::text", "'0'",
        "CASE WHEN j.has_0097 = 0 THEN 'OK' ELSE 'FAIL' END"],
      10: ["'10. PROFILE: ledger rows the index will hold (imported_entity_id set)'",
        "CASE WHEN j.tbl IS NULL THEN 'table absent' ELSE p.with_target::text || ' of ' || p.ledger_rows::text || " +
          "' ledger rows, ' || p.with_target_records::text || ' of them clinical_record' END",
        "'> 0 is OK; 0 is VACUOUS'",
        "CASE WHEN j.tbl IS NULL THEN 'FAIL' WHEN p.with_target > 0 THEN 'OK' ELSE 'VACUOUS' END"],
      11: ["'journal_rows_before'", "j.journal_rows::text", "'94'", "CASE WHEN j.journal_rows = 94 THEN 'OK' ELSE 'FAIL' END"],
      12: ["'staging_indexes_before'", "CASE WHEN j.tbl IS NULL THEN 'table absent' ELSE j.indexes::text END", "'4'",
        "CASE WHEN j.tbl IS NOT NULL AND j.indexes = 4 THEN 'OK' ELSE 'FAIL' END"],
      13: ["'staging_indexes_md5'", "coalesce(j.indexes_md5, 'absent')", "'32 hex characters'",
        "CASE WHEN j.indexes_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END"],
    },
    final: FINAL,
  };
}

/**
 * The post-check's verdict query as reviewed. The index's name, table, key,
 * method, predicate, definition, comment md5 and the file's sha256 come from
 * the migration.
 */
function postCheckAsReviewed(migrationText) {
  const { index, comments } = readMigration(migrationText);
  const N = index.name;
  const DEF = `CREATE INDEX ${N} ON ${index.table} USING ${index.method} (${index.key.join(", ")})` +
    (index.predicate ? ` WHERE (${index.predicate})` : "");
  const KEY = `${index.key.join(", ")}; ${index.key.length} key, ${index.key.length} total, no expression`;
  const PREDICATE = `(${index.predicate})`;
  const MD5 = comments.length === 1 ? md5(comments[0].text) : "(the migration holds no single COMMENT)";
  return {
    ctes: {
      t: "SELECT to_regclass('public.migration_staging_rows') AS tbl",
      ix: `SELECT c.oid, c.relname, i.* FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = ${TBL}`,
      new_ix: `SELECT * FROM ix WHERE relname = '${N}'`,
      j: null,
      p: null,
      r: null,
      s: summaryCte("13 OK, or 12 OK and 1 VACUOUS; never a FAIL"),
    },
    j: {
      tbl: TBL,
      named: relationsNamed(N),
      named_as: "(SELECT c.relkind::text || ' on ' || coalesce(tn.nspname || '.' || tc.relname, 'nothing') " +
        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_index i ON i.indexrelid = c.oid " +
        "LEFT JOIN pg_class tc ON tc.oid = i.indrelid LEFT JOIN pg_namespace tn ON tn.oid = tc.relnamespace " +
        `WHERE n.nspname = 'public' AND c.relname = '${N}')`,
      kind: "(SELECT am.amname || ', unique ' || x.indisunique::text || ', primary ' || x.indisprimary::text || " +
        "', exclusion ' || x.indisexclusion::text FROM new_ix x JOIN pg_class c ON c.oid = x.indexrelid JOIN pg_am am ON am.oid = c.relam)",
      state: "(SELECT 'valid ' || indisvalid::text || ', ready ' || indisready::text || ', live ' || indislive::text FROM new_ix)",
      key_shape: "(SELECT string_agg(coalesce(a.attname, 'expression'), ', ' ORDER BY k.ord) || '; ' || " +
        "x.indnkeyatts::text || ' key, ' || x.indnatts::text || ' total, ' || " +
        "CASE WHEN x.indexprs IS NULL THEN 'no expression' ELSE 'an expression' END " +
        "FROM new_ix x CROSS JOIN LATERAL unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) " +
        "LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum GROUP BY x.indnkeyatts, x.indnatts, x.indexprs)",
      predicate: "(SELECT coalesce(pg_get_expr(indpred, indrelid), 'none') FROM new_ix)",
      def: "(SELECT pg_get_indexdef(indexrelid) FROM new_ix)",
      comment_md5: "(SELECT md5(obj_description(indexrelid, 'pg_class')) FROM new_ix)",
      target_keyed: `(SELECT count(*)::int FROM ix WHERE ${attnumOf(index.key[0])} = ANY (ix.indkey::int2[]))`,
      indexes_now: "(SELECT count(*)::int FROM ix)",
      others_md5_now: "(SELECT md5(string_agg(relname || ':' || pg_get_indexdef(indexrelid) || ':' || indisvalid::text || " +
        `':' || indisready::text || ':' || indislive::text, ';' ORDER BY relname)) FROM ix WHERE relname <> '${N}')`,
      journal_rows_now: "(SELECT count(*)::int FROM drizzle.__drizzle_migrations)",
      has_0097: hasHash(sha256(migrationText)),
    },
    p: {
      with_target: "(SELECT count(*)::int FROM public.migration_staging_rows WHERE imported_entity_id IS NOT NULL)",
    },
    frame: "SELECT v.* FROM j CROSS JOIN p CROSS JOIN LATERAL (VALUES ...) AS v(n, \"check\", observed, expected, verdict)",
    rows: {
      0: READ_ONLY_ROW,
      1: ["'1. exactly one relation in public has the index''s name, and it is an index on the ledger'",
        "j.named::text || ', ' || coalesce(j.named_as, 'absent')", `'1, i on ${index.table}'`,
        `CASE WHEN j.named = 1 AND j.named_as = 'i on ${index.table}' THEN 'OK' ELSE 'FAIL' END`],
      2: ["'2. it is a btree, and not unique, primary or an exclusion constraint'", "coalesce(j.kind, 'absent')",
        "'btree, unique false, primary false, exclusion false'",
        "CASE WHEN j.kind = 'btree, unique false, primary false, exclusion false' THEN 'OK' ELSE 'FAIL' END"],
      3: ["'3. it is VALID, READY and LIVE (pg_index.indisvalid, indisready, indislive)'", "coalesce(j.state, 'absent')",
        "'valid true, ready true, live true'",
        "CASE WHEN j.state = 'valid true, ready true, live true' THEN 'OK' ELSE 'FAIL' END"],
      4: ["'4. its key is exactly (imported_entity_id, entity_type), in that order, with no INCLUDE and no expression'",
        "coalesce(j.key_shape, 'absent')", `'${KEY}'`, `CASE WHEN j.key_shape = '${KEY}' THEN 'OK' ELSE 'FAIL' END`],
      5: ["'5. its predicate is exactly imported_entity_id IS NOT NULL'", "coalesce(j.predicate, 'absent')", `'${PREDICATE}'`,
        `CASE WHEN j.predicate = '${PREDICATE}' THEN 'OK' ELSE 'FAIL' END`],
      6: ["'6. its whole definition, as Postgres renders it'", "coalesce(j.def, 'absent')", `'${DEF}'`,
        `CASE WHEN j.def = '${DEF}' THEN 'OK' ELSE 'FAIL' END`],
      7: ["'7. its COMMENT is the migration file''s text, by md5'", "coalesce(j.comment_md5, 'absent')", `'${MD5}'`,
        `CASE WHEN j.comment_md5 = '${MD5}' THEN 'OK' ELSE 'FAIL' END`],
      8: ["'8. it is the only index on the table that keys imported_entity_id'", "j.target_keyed::text", "'1'",
        "CASE WHEN j.target_keyed = 1 THEN 'OK' ELSE 'FAIL' END"],
      9: ["'9. the table carries exactly one index more than before'", "j.indexes_now::text",
        "(:'staging_indexes_before'::int + 1)::text",
        "CASE WHEN j.indexes_now = :'staging_indexes_before'::int + 1 THEN 'OK' ELSE 'FAIL' END"],
      10: ["'10. every OTHER index on the table is byte-identical (one md5 over name, definition and state)'",
        "coalesce(j.others_md5_now, 'absent')", ":'staging_indexes_md5'",
        "CASE WHEN j.others_md5_now = :'staging_indexes_md5' THEN 'OK' ELSE 'FAIL' END"],
      11: ["'11. 0097 is in the journal by hash, and the journal moved by exactly one'",
        "j.has_0097::text || ' by hash, journal ' || j.journal_rows_now::text",
        "'1 by hash, journal ' || (:'journal_rows_before'::int + 1)::text",
        "CASE WHEN j.has_0097 = 1 AND j.journal_rows_now = :'journal_rows_before'::int + 1 THEN 'OK' ELSE 'FAIL' END"],
      12: ["'12. PROFILE: ledger rows the index holds (imported_entity_id set)'", "p.with_target::text",
        "'> 0 is OK; 0 is VACUOUS'", "CASE WHEN p.with_target > 0 THEN 'OK' ELSE 'VACUOUS' END"],
    },
    final: FINAL,
  };
}

/** assert.equal whose message carries both texts, so a red names what it read. */
function same(read, reviewed, message) {
  assert.equal(read, reviewed, `${message}\n  read:     ${read}\n  reviewed: ${reviewed}`);
}

/** Every part of a check's verdict query is the reviewed text. `which` names the file in each message. */
function assertCheckAsReviewed(which, text, want) {
  const got = readCheck(text);
  same([...got.ctes.keys()].join(", "), Object.keys(want.ctes).join(", "), `${which}: its CTEs are not the reviewed ones, in order`);
  for (const [name, body] of Object.entries(want.ctes)) {
    if (body !== null) same(got.ctes.get(name), body, `${which}: the CTE ${name} is not the reviewed text`);
  }
  for (const g of ["j", "p"]) {
    same([...got[g].keys()].join(", "), Object.keys(want[g]).join(", "), `${which}: the columns of ${g} are not the reviewed ones, in order`);
    for (const [name, expression] of Object.entries(want[g])) {
      same(got[g].get(name), expression, `${which}: ${g}.${name} is not the reviewed expression`);
    }
  }
  same(got.frame, want.frame, `${which}: the frame around the VALUES rows is not the reviewed text`);
  same([...got.rows.keys()].join(", "), Object.keys(want.rows).join(", "), `${which}: its verdict rows are not the reviewed ones, in order`);
  for (const [n, fields] of Object.entries(want.rows)) {
    FIELDS.forEach((field, k) => same(got.rows.get(Number(n))[k], fields[k], `${which}: verdict ${n}'s ${field} is not the reviewed text`));
  }
  same(got.final, want.final, `${which}: the final SELECT is not the reviewed text`);
}

function assertPreCheckExpectsItAbsent(migrationText, preText) {
  const { index } = readMigration(migrationText);
  const want = preCheckAsReviewed(migrationText);
  const got = readCheck(preText);
  same(got.j.get("name_taken"), want.j.name_taken, `the pre-check does not count relations named ${index.name}`);
  same(got.rows.get(3)?.[3], want.rows[3][3], "the pre-check does not expect the index's name absent");
  same(got.j.get("target_attnum"), want.j.target_attnum, `the pre-check's target_attnum is not the attnum of ${index.key[0]}`);
  same(got.j.get("target_keyed"), want.j.target_keyed, `the pre-check does not look for an index already keying ${index.key[0]}`);
  same(got.rows.get(4)?.[3], want.rows[4][3], "the pre-check does not expect no index keying the column");
}

function assertPostCheckPinsTheIndex(migrationText, postText) {
  const { index } = readMigration(migrationText);
  const want = postCheckAsReviewed(migrationText);
  const got = readCheck(postText);
  const verdict = (n) => got.rows.get(n)?.[3];
  same(verdict(6), want.rows[6][3], `the post-check has no verdict comparing the definition to ${want.rows[6][2]}`);
  same(verdict(4), want.rows[4][3], `the post-check has no verdict comparing the key to ${want.rows[4][2]}`);
  same(verdict(5), want.rows[5][3], `the post-check has no verdict comparing the predicate to ${want.rows[5][2]}`);
  for (const part of ["named", "named_as"]) {
    same(got.j.get(part), want.j[part], `the post-check does not look the index up by the name ${index.name} (j.${part})`);
  }
  same(got.ctes.get("new_ix"), want.ctes.new_ix, `the post-check does not look the index up by the name ${index.name} (new_ix)`);
  same(verdict(1), want.rows[1][3], "the post-check does not require exactly one relation of the name, an index on the ledger");
  same(verdict(3), want.rows[3][3], "the post-check does not require the index valid, ready and live");
  const pins = [...codeOf(postText).matchAll(/CASE\s+WHEN\s+j\.comment_md5\s*=\s*'([0-9a-f]{32})'/g)].map((m) => m[1]);
  assert.equal(pins.length, 1, "the post-check must compare the comment md5 exactly once, in code");
  same(verdict(7), want.rows[7][3], "the post-check's comment md5 is not the md5 of the migration's COMMENT text");
}

// ---------------------------------------------------------------------------
// THE RULES ON THE COMMITTED FILES.
// ---------------------------------------------------------------------------

test("the migration is two statements: one CREATE INDEX and one COMMENT ON INDEX on it", () => {
  assertTwoStatementsOnly(migration);
});

test("the CREATE INDEX is IF NOT EXISTS, not CONCURRENTLY, btree on migration_staging_rows (imported_entity_id, entity_type) WHERE imported_entity_id IS NOT NULL", () => {
  assertIndexShape(migration);
});

test("the migration's code carries no DROP, ALTER, DELETE, UPDATE, INSERT, TRUNCATE, GRANT or REVOKE", () => {
  assertNoForbiddenVerb(migration);
});

test("the pre-check and the post-check pin the sha256 of the migration as it stands", () => {
  assertChecksPinTheHash(migration, pre, post);
});

test("the pre-check expects the index's name, and any index keying imported_entity_id, absent", () => {
  assertPreCheckExpectsItAbsent(migration, pre);
});

test("the post-check compares the definition, key, predicate and comment to what the migration writes", () => {
  assertPostCheckPinsTheIndex(migration, post);
});

test("the pre-check's verdict query is the reviewed text, part by part: every CTE, column and verdict row", () => {
  assertCheckAsReviewed("the pre-check", pre, preCheckAsReviewed(migration));
});

test("the post-check's verdict query is the reviewed text, part by part: every CTE, column and verdict row", () => {
  assertCheckAsReviewed("the post-check", post, postCheckAsReviewed(migration));
});

test("the promotion needs no edit here: with the parked file renamed into migrations/, the promoted file is the one read", () => {
  assert.equal(locateMigration((p) => p === PROMOTED_PATH), PROMOTED_PATH);
  assert.equal(locateMigration((p) => p === PENDING_PATH), PENDING_PATH);
});

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS: every rule above goes red, with its own message, on a
// seeded wrong copy fed through the same function.
// ---------------------------------------------------------------------------

/** Replace `from` in `text`, and fail if the anchor is not there (a plant that misses proves nothing). */
function plant(text, from, to) {
  const out = text.replace(from, to);
  assert.notEqual(out, text, `the plant did not land: ${String(from).slice(0, 80)}`);
  return out;
}
const red = (fn, message) => assert.throws(fn, { name: "AssertionError", message });

/** A regex for normalised check text wherever it stands in a file, whatever its line breaks and indentation. */
function loose(normalised) {
  let re = "";
  for (const c of normalised) {
    if (c === " ") re += "\\s+";
    else if (c === "(") re += "\\(\\s*";
    else if (c === ")") re += "\\s*\\)";
    else re += c.replace(/[.*+?^${}|[\]\\]/g, "\\$&");
  }
  if (/\w$/.test(normalised)) re += "(?!\\w)";
  return new RegExp(re, "g");
}

/** Replace the one place `normalised` stands in a check file; an anchor found twice or never is a plant that proves nothing. */
function plantOnce(text, normalised, to) {
  const hits = text.match(loose(normalised)) ?? [];
  assert.equal(hits.length, 1, `the plant must find its anchor exactly once; found ${hits.length}: ${normalised.slice(0, 80)}`);
  return text.replace(loose(normalised), () => to);
}

/** A verdict row as normalised text. */
const rowText = (n, fields) => `(${n}, ${fields.join(", ")})`;

const CREATE_LINE = 'CREATE INDEX IF NOT EXISTS "migration_staging_imported_entity_idx"';
const KEY_LINE = 'USING btree ("imported_entity_id", "entity_type")';
const BREAK = ";--> statement-breakpoint";

test("CONTROL shape: a CONCURRENTLY copy is red", () => {
  const seeded = plant(migration, CREATE_LINE, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "migration_staging_imported_entity_idx"');
  red(() => assertIndexShape(seeded), /must not be CONCURRENTLY/);
});

test("CONTROL shape: the other column order (entity_type first) is red, and the post-check's pins no longer match it", () => {
  const seeded = plant(migration, KEY_LINE, 'USING btree ("entity_type", "imported_entity_id")');
  red(() => assertIndexShape(seeded), /must key exactly \(imported_entity_id, entity_type\), in that order/);
  red(() => assertPostCheckPinsTheIndex(seeded, post), /no verdict comparing the definition/);
});

test("CONTROL shape: a single-column key is red", () => {
  const seeded = plant(migration, KEY_LINE, 'USING btree ("imported_entity_id")');
  red(() => assertIndexShape(seeded), /must key exactly/);
});

test("CONTROL shape: an index on another table is red", () => {
  const seeded = plant(migration, "ON public.migration_staging_rows USING", "ON public.clinical_records USING");
  red(() => assertIndexShape(seeded), /must be on public\.migration_staging_rows/);
});

test("CONTROL shape: a copy without IF NOT EXISTS is red", () => {
  const seeded = plant(migration, CREATE_LINE, 'CREATE INDEX "migration_staging_imported_entity_idx"');
  red(() => assertIndexShape(seeded), /must say IF NOT EXISTS/);
});

test("CONTROL shape: a copy without the partial predicate is red", () => {
  const seeded = plant(migration, `"entity_type")\n  WHERE "imported_entity_id" IS NOT NULL${BREAK}`, `"entity_type")${BREAK}`);
  red(() => assertIndexShape(seeded), /must be partial WHERE imported_entity_id IS NOT NULL; it is not partial/);
});

test("CONTROL shape: a UNIQUE copy is red", () => {
  const seeded = plant(migration, CREATE_LINE, 'CREATE UNIQUE INDEX IF NOT EXISTS "migration_staging_imported_entity_idx"');
  red(() => assertIndexShape(seeded), /must not be UNIQUE/);
});

test("CONTROL shape: another index name is red", () => {
  const seeded = plant(migration, CREATE_LINE, 'CREATE INDEX IF NOT EXISTS "migration_staging_target_idx"');
  red(() => assertIndexShape(seeded), /must be named migration_staging_imported_entity_idx/);
});

test("CONTROL shape: another access method (USING hash) is red", () => {
  const seeded = plant(migration, KEY_LINE, 'USING hash ("imported_entity_id", "entity_type")');
  red(() => assertIndexShape(seeded), /must be USING btree/);
});

test("CONTROL shape: an ON ONLY copy is red", () => {
  const seeded = plant(migration, "ON public.migration_staging_rows USING", "ON ONLY public.migration_staging_rows USING");
  red(() => assertIndexShape(seeded), /must not be ON ONLY/);
});

test("CONTROL statements: a second CREATE INDEX is red", () => {
  const seeded = plant(migration, "COMMENT ON INDEX",
    `CREATE INDEX IF NOT EXISTS "extra_idx" ON public.migration_staging_rows USING btree ("entity_type")${BREAK}\nCOMMENT ON INDEX`);
  red(() => assertTwoStatementsOnly(seeded), /exactly one CREATE INDEX; found 2/);
});

test("CONTROL statements: a DROP INDEX appended after the COMMENT is red, by the statement count and by the verb", () => {
  const seeded = `${migration}--> statement-breakpoint\nDROP INDEX IF EXISTS public.migration_staging_tenant_status_idx;\n`;
  red(() => assertTwoStatementsOnly(seeded), /exactly two statements .*found 3/);
  red(() => assertNoForbiddenVerb(seeded), /carries a DROP/);
});

test("CONTROL statements: an UPDATE after a breakpoint on the same line is red (drizzle runs it, although Postgres alone reads a comment)", () => {
  const seeded = plant(migration, `IS NOT NULL${BREAK}`,
    `IS NOT NULL${BREAK} UPDATE public.migration_staging_rows SET raw = raw;`);
  red(() => assertNoForbiddenVerb(seeded), /carries a UPDATE/);
  red(() => assertTwoStatementsOnly(seeded), /exactly two statements/);
});

test("CONTROL statements: a GRANT smuggled after a dollar-quoted COMMENT is red", () => {
  const seeded = plant(migration, /COMMENT ON INDEX public\.migration_staging_imported_entity_idx IS[\s\S]*$/,
    "COMMENT ON INDEX public.migration_staging_imported_entity_idx IS $c$why; it is 0097$c$; GRANT ALL ON public.migration_staging_rows TO anon;\n");
  red(() => assertNoForbiddenVerb(seeded), /carries a GRANT/);
});

test("CONTROL each forbidden verb: every one of the eight is red when it is code", () => {
  for (const verb of FORBIDDEN) {
    const seeded = `${migration}--> statement-breakpoint\n${verb} something;\n`;
    red(() => assertNoForbiddenVerb(seeded), new RegExp(`carries a ${verb}`));
  }
});

test("CONTROL comment: a COMMENT on another index is red", () => {
  const seeded = plant(migration, "COMMENT ON INDEX public.migration_staging_imported_entity_idx IS",
    "COMMENT ON INDEX public.migration_staging_tenant_status_idx IS");
  red(() => assertTwoStatementsOnly(seeded), /must be on the index the file creates/);
});

test("CONTROL pin: a one-byte edit to the migration no longer matches the checks' hash pins", () => {
  const edited = plant(migration, "'0097. Serves", "'0097.  Serves");
  red(() => assertChecksPinTheHash(edited, pre, post), /pre-check's has_0097 pin did not/);
});

test("CONTROL pin: a stale pre-check pin is red although the current hash is parked in a line comment", () => {
  const current = sha256(migration);
  const stale = plant(pre, `hash = '${current}')`, `hash = '${"0".repeat(64)}')`);
  const parked = plant(stale, "BEGIN READ ONLY;", `-- hash = '${current}') AS has_0097\nBEGIN READ ONLY;`);
  red(() => assertChecksPinTheHash(migration, parked, post), /pre-check's has_0097 pin did not/);
});

test("CONTROL pin: a stale post-check pin is red", () => {
  const current = sha256(migration);
  const stale = plant(post, `hash = '${current}')`, `hash = '${"f".repeat(64)}')`);
  red(() => assertChecksPinTheHash(migration, pre, stale), /post-check's has_0097 pin did not/);
});

test("CONTROL comment md5: a COMMENT text edit no longer matches the post-check's md5", () => {
  const edited = plant(migration, "Partial because a NULL is never probed.", "Partial, because a NULL is never probed.");
  red(() => assertPostCheckPinsTheIndex(edited, post), /comment md5 is not the md5/);
});

test("CONTROL post-check: verdict 6 commented out is red, although the comment still carries the definition", () => {
  const edited = plant(post, /  \(6, '6\. [\s\S]*?(?=  \(7, )/, (m) => m.replace(/^(?=.)/gm, "-- "));
  assert.match(edited, /-- .*CASE WHEN j\.def = 'CREATE INDEX/, "the plant must leave the definition in a comment");
  red(() => assertPostCheckPinsTheIndex(migration, edited), /no verdict comparing the definition/);
});

test("CONTROL post-check: a verdict 3 that does not require the index ready is red", () => {
  const edited = plant(post, "CASE WHEN j.state = 'valid true, ready true, live true' THEN 'OK'",
    "CASE WHEN j.state LIKE 'valid true%' THEN 'OK'");
  red(() => assertPostCheckPinsTheIndex(migration, edited), /valid, ready and live/);
});

test("CONTROL pre-check: a pre-check that no longer expects the name absent is red", () => {
  const edited = plant(pre, "WHEN j.name_taken = 0 THEN 'OK'", "WHEN j.name_taken >= 0 THEN 'OK'");
  red(() => assertPreCheckExpectsItAbsent(migration, edited), /does not expect the index's name absent/);
});

test("CONTROL pre-check: counting relations of another name is red", () => {
  const want = preCheckAsReviewed(migration);
  const edited = plantOnce(pre, `${want.j.name_taken} AS name_taken`,
    `${want.j.name_taken.replace("'migration_staging_imported_entity_idx'", "'migration_staging_other_idx'")} AS name_taken`);
  red(() => assertPreCheckExpectsItAbsent(migration, edited), /does not count relations named migration_staging_imported_entity_idx/);
});

test("CONTROL pre-check: target_keyed's OWN subquery looking up entity_type is red, although target_attnum still names imported_entity_id", () => {
  const want = preCheckAsReviewed(migration);
  const edited = plantOnce(pre, `${want.j.target_keyed} AS target_keyed`,
    `${want.j.target_keyed.replace("a.attname = 'imported_entity_id'", "a.attname = 'entity_type'")} AS target_keyed`);
  assert.match(codeOf(edited), /a\.attname = 'imported_entity_id'\s+AND NOT a\.attisdropped\)\s+AS target_attnum/,
    "the plant must leave target_attnum on imported_entity_id, where the old regex found it");
  red(() => assertPreCheckExpectsItAbsent(migration, edited), /does not look for an index already keying imported_entity_id/);
  red(() => assertCheckAsReviewed("the pre-check", edited, want), /j\.target_keyed is not the reviewed expression/);
});

test("CONTROL pre-check: target_attnum looking up another column is red", () => {
  const want = preCheckAsReviewed(migration);
  const edited = plantOnce(pre, `${want.j.target_attnum} AS target_attnum`,
    `${want.j.target_attnum.replace("'imported_entity_id'", "'entity_type'")} AS target_attnum`);
  red(() => assertPreCheckExpectsItAbsent(migration, edited), /target_attnum is not the attnum of imported_entity_id/);
});

test("CONTROL pre-check: a verdict 4 that also says OK after target_keyed = 0 is red", () => {
  const edited = plant(pre, "WHEN j.target_keyed = 0 THEN 'OK'", "WHEN j.target_keyed = 0 THEN 'OK' WHEN true THEN 'OK'");
  red(() => assertPreCheckExpectsItAbsent(migration, edited), /does not expect no index keying the column/);
});

test("CONTROL pre-check: verdict 9 (has_0097 = 0) and the journal carry (= 94) loosened to >= 0 are each red", () => {
  const want = preCheckAsReviewed(migration);
  const nine = plant(pre, "WHEN j.has_0097 = 0 THEN", "WHEN j.has_0097 >= 0 THEN");
  red(() => assertCheckAsReviewed("the pre-check", nine, want), /verdict 9's verdict is not the reviewed text/);
  const carry = plant(pre, "WHEN j.journal_rows = 94 THEN", "WHEN j.journal_rows >= 0 THEN");
  red(() => assertCheckAsReviewed("the pre-check", carry, want), /verdict 11's verdict is not the reviewed text/);
});

test("CONTROL post-check: a verdict 4 comparing another key shape is red", () => {
  const want = postCheckAsReviewed(migration);
  const edited = plantOnce(post, want.rows[4][3],
    "CASE WHEN j.key_shape = 'imported_entity_id; 1 key, 1 total, no expression' THEN 'OK' ELSE 'FAIL' END");
  red(() => assertPostCheckPinsTheIndex(migration, edited), /no verdict comparing the key/);
});

test("CONTROL post-check: a verdict 5 comparing another predicate is red", () => {
  const want = postCheckAsReviewed(migration);
  const edited = plantOnce(post, want.rows[5][3], "CASE WHEN j.predicate = 'none' THEN 'OK' ELSE 'FAIL' END");
  red(() => assertPostCheckPinsTheIndex(migration, edited), /no verdict comparing the predicate/);
});

test("CONTROL post-check: looking the index up by another name is red, in j.named, j.named_as and new_ix alike", () => {
  const want = postCheckAsReviewed(migration);
  for (const part of ["named", "named_as"]) {
    const edited = plantOnce(post, `${want.j[part]} AS ${part}`,
      `${want.j[part].replace("'migration_staging_imported_entity_idx'", "'migration_staging_other_idx'")} AS ${part}`);
    red(() => assertPostCheckPinsTheIndex(migration, edited), new RegExp(`by the name migration_staging_imported_entity_idx \\(j\\.${part}\\)`));
  }
  const edited = plantOnce(post, want.ctes.new_ix, "SELECT * FROM ix WHERE relname = 'migration_staging_other_idx'");
  red(() => assertPostCheckPinsTheIndex(migration, edited), /by the name migration_staging_imported_entity_idx \(new_ix\)/);
});

test("CONTROL post-check: a verdict 1 that no longer requires the relation to be an index on the ledger is red", () => {
  const want = postCheckAsReviewed(migration);
  const edited = plantOnce(post, want.rows[1][3], "CASE WHEN j.named = 1 THEN 'OK' ELSE 'FAIL' END");
  red(() => assertPostCheckPinsTheIndex(migration, edited), /does not require exactly one relation of the name/);
});

// THE SWEEP: every verdict, every observed value and every column of both
// checks, in turn. It covers each mutation a reviewer planted by hand (a verdict
// replaced by CASE WHEN true, a WHEN true THEN 'OK' put ahead of the real
// test) on every row rather than on the rows somebody thought of.
const CHECKS = [
  ["the pre-check", () => pre, preCheckAsReviewed],
  ["the post-check", () => post, postCheckAsReviewed],
];

for (const [which, textOf, reviewed] of CHECKS) {
  test(`SWEEP ${which}: each verdict replaced by CASE WHEN true, each verdict with WHEN true THEN 'OK' put first, and each observed value replaced by a constant, is red on that row`, () => {
    const text = textOf();
    const want = reviewed(migration);
    let arms = 0;
    for (const [n, f] of Object.entries(want.rows)) {
      assert.match(f[3], /^CASE /, `${which}: verdict ${n} is not a CASE, so this sweep cannot plant in it`);
      const plants = [
        ["verdict", [f[0], f[1], f[2], "CASE WHEN true THEN 'OK' END"]],
        ["verdict", [f[0], f[1], f[2], f[3].replace(/^CASE /, "CASE WHEN true THEN 'OK' ")]],
        ["observed", [f[0], "'x'", f[2], f[3]]],
      ];
      for (const [field, fields] of plants) {
        const seeded = plantOnce(text, rowText(n, f), rowText(n, fields));
        red(() => assertCheckAsReviewed(which, seeded, want), new RegExp(`verdict ${n}'s ${field} is not the reviewed text`));
        arms++;
      }
    }
    assert.equal(arms, 3 * Object.keys(want.rows).length);
  });

  test(`SWEEP ${which}: each column of j and p replaced by (SELECT 0) is red on that column`, () => {
    const text = textOf();
    const want = reviewed(migration);
    for (const g of ["j", "p"]) {
      for (const [name, expression] of Object.entries(want[g])) {
        const seeded = plantOnce(text, `${expression} AS ${name}`, `(SELECT 0) AS ${name}`);
        red(() => assertCheckAsReviewed(which, seeded, want), new RegExp(`${which}: ${g}\\.${name} is not the reviewed expression`));
      }
    }
  });
}

test("SWEEP structure: a changed CTE, frame, label, expected value or final SELECT, an added column, an added or a dropped verdict, and a second verdict query are each red", () => {
  const preWant = preCheckAsReviewed(migration);
  const postWant = postCheckAsReviewed(migration);
  const arms = [
    ["the pre-check", pre, preWant, "to_regclass('public.migration_staging_rows')", "to_regclass('public.migration_staging_rows_old')", /the CTE t is not/],
    ["the pre-check", pre, preWant, "JOIN pg_class c ON c.oid = i.indexrelid\n   WHERE", "JOIN pg_class c ON c.oid = i.indrelid\n   WHERE", /the CTE ix is not/],
    ["the post-check", post, postWant, "SELECT * FROM ix WHERE relname = ", "SELECT * FROM ix WHERE relname <> ", /the CTE new_ix is not/],
    ["the pre-check", pre, preWant, "(SELECT count(*) FROM r WHERE verdict = 'FAIL')", "(SELECT 0)", /the CTE s is not/],
    ["the post-check", post, postWant, "(SELECT count(*) FROM r WHERE verdict = 'FAIL')", "(SELECT 0)", /the CTE s is not/],
    ["the pre-check", pre, preWant, "FROM j LEFT JOIN p ON true", "FROM j LEFT JOIN p ON false", /the frame around the VALUES rows/],
    ["the post-check", post, postWant, "ORDER BY n;", "ORDER BY 1;", /the final SELECT/],
    ["the pre-check", pre, preWant, "(11, 'journal_rows_before',", "(11, 'journal_rows_after',", /verdict 11's label/],
    ["the post-check", post, postWant, "'valid true, ready true, live true',\n", "'valid true',\n", /verdict 3's expected/],
    ["the pre-check", pre, preWant, "AS journal_rows,", "AS journal_rows, (SELECT 1) AS spare,", /the columns of j are not/],
    ["the pre-check", pre, preWant, "  ) AS v(n,", "  , (14, 'extra', 'x', 'x', 'OK')\n  ) AS v(n,", /verdict rows are not the reviewed ones/],
    ["the post-check", post, postWant, /\n {2}\(12, '12\. [\s\S]*?(?=\n {2}\) AS v\(n,)/, "", /verdict rows are not the reviewed ones/],
  ];
  for (const [which, text, want, from, to, message] of arms) {
    let seeded = plant(text, from, to);
    if (from instanceof RegExp) seeded = seeded.replace(/,(\s*\) AS v\(n,)/, "$1");
    red(() => assertCheckAsReviewed(which, seeded, want), message);
  }
  const twice = `${pre}\n${pre.slice(pre.indexOf("WITH t AS ("), pre.indexOf("ROLLBACK;"))}`;
  red(() => assertCheckAsReviewed("the pre-check", twice, preWant), /exactly one verdict query .*found 2/);
});

test("CONTROL lexer: an unterminated comment or literal is red, not silently short", () => {
  red(() => lexPostgres("CREATE INDEX x ON t (a); /* never closed"), /unterminated block comment/);
  red(() => lexPostgres("COMMENT ON INDEX x IS 'never closed;"), /unterminated string literal/);
  // A breakpoint inside the COMMENT text is split there by drizzle, and the
  // literal it cuts in two is unterminated: red here, and a failed apply there.
  const cut = plant(migration, "'Partial because", "'Partial--> statement-breakpoint because");
  red(() => lexMigration(cut), /unterminated string literal/);
});

test("CONTROL locate: the migration in both places, or in neither, is red", () => {
  red(() => locateMigration(() => true), /must stand in exactly one of .*; found 2/);
  red(() => locateMigration(() => false), /must stand in exactly one of .*; found 0/);
});

// ---------------------------------------------------------------------------
// GREEN ARMS: copies the rules must ACCEPT. A rule so tight that prose trips
// it would refuse the file for its comments, and would be learned to ignore.
// ---------------------------------------------------------------------------

test("GREEN: every forbidden verb inside comments, and a `;` and a verb inside the COMMENT text, stay green", () => {
  const prose = FORBIDDEN.join(" ");
  const seeded = plant(
    plant(migration, CREATE_LINE, `/* ${prose}; DROP TABLE x; */\n-- ${prose}; UPDATE y SET z = 1;\n${CREATE_LINE}`),
    "'drizzle runs every pending migration inside one transaction.'",
    "'drizzle runs every pending migration inside one transaction; nothing here will DROP, ALTER or UPDATE.'",
  );
  assertTwoStatementsOnly(seeded);
  assertIndexShape(seeded);
  assertNoForbiddenVerb(seeded);
});

test("GREEN: a column named like a verb in a quoted identifier is not a verb", () => {
  assertNoForbiddenVerb('CREATE INDEX IF NOT EXISTS i ON public.t USING btree ("Update", "drop");');
});

test("GREEN: both checks reflowed, re-indented and commented stay green on every check rule (the pins read code, not layout)", () => {
  const reflow = (text) => text
    .replace(/^[ \t]+/gm, "")
    .replace(/ {2,}AS /g, "\n    AS ")
    .replace(/CASE WHEN /g, "CASE\n  WHEN ")
    .replace("CROSS JOIN LATERAL (VALUES", "CROSS JOIN LATERAL ( /* the verdicts */ VALUES -- one row each\n");
  const pre2 = reflow(pre);
  const post2 = reflow(post);
  assert.notEqual(pre2, pre, "the reflow must change the pre-check's bytes");
  assert.notEqual(post2, post, "the reflow must change the post-check's bytes");
  assertCheckAsReviewed("the pre-check", pre2, preCheckAsReviewed(migration));
  assertCheckAsReviewed("the post-check", post2, postCheckAsReviewed(migration));
  assertPreCheckExpectsItAbsent(migration, pre2);
  assertPostCheckPinsTheIndex(migration, post2);
  assertChecksPinTheHash(migration, pre2, post2);
});

// ---------------------------------------------------------------------------
// THE APPLY DOCUMENT. docs/migration-apply-0097.md pins five files by sha256
// in the blocks GREEN pastes, and docs/migration-apply-0097.sha256 pins the
// document. A pin that does not match the file on disk halts the sitting,
// and where it halts matters: a file stage 2 reads and stage 1 never compared
// halts AFTER production is written. So, statically:
//   * every SHA*= a block sets is the real sha256 of the file that block
//     compares it with, and no block sets a pin it never compares;
//   * stages 1 and 2 compare every file they run or read BEFORE they load the
//     production credentials, and stage 1's list holds every file of stage
//     2's, so a file edited on the branch stops the sitting before the apply;
//   * stages 0 and 1 check the sidecar;
//   * the facts table quotes each file's real sha256, the document quotes no
//     other 64-hex string, and the sidecar is the document's sha256.
// ---------------------------------------------------------------------------

const DOC_PATH = "docs/migration-apply-0097.md";
const SIDECAR_PATH = "docs/migration-apply-0097.sha256";
const VM_PATH = "packages/db/scripts/verified-migrate.mjs";
const GUARD_PATH = "scripts/assert-production-target.mjs";
const fileSha = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
const doc = read(DOC_PATH);
const sidecar = read(SIDECAR_PATH);

/** The real sha256 of every file the document pins, by the path a block or the facts table names it by. */
const REAL = Object.freeze({
  [PROMOTED_PATH]: fileSha(MIGRATION_PATH),
  [PENDING_PATH]: fileSha(MIGRATION_PATH),
  [PRE]: fileSha(PRE),
  [POST]: fileSha(POST),
  [VM_PATH]: fileSha(VM_PATH),
  [GUARD_PATH]: fileSha(GUARD_PATH),
});

/** What each stage must compare by sha256 before it goes further. */
const STAGE_PINS = {
  "STAGE 0": [PROMOTED_PATH],
  "STAGE 1": [PROMOTED_PATH, PRE, POST, VM_PATH, GUARD_PATH],
  "STAGE 2": [PROMOTED_PATH, POST, GUARD_PATH],
};
const CREDENTIALS = "set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport";
const COMPARE = /^\[ "\$\(shasum -a 256 (\S+) \| cut -d' ' -f1\)" = "\$\{(\w+)\}" \] \|\| \{ echo "STOP: [^"]+"; exit 1; \}$/;

/** The fenced block under each `## STAGE n` heading, as lines. */
function stageBlocks(text) {
  const blocks = {};
  for (const stage of Object.keys(STAGE_PINS)) {
    const head = text.indexOf(`\n## ${stage}:`);
    assert.ok(head >= 0, `the apply document has no "## ${stage}:" section`);
    const next = text.indexOf("\n## ", head + 1);
    const section = text.slice(head, next < 0 ? text.length : next);
    const fence = section.match(/\n```\n([\s\S]*?)\n```\n/);
    assert.ok(fence, `the apply document's ${stage} section has no fenced block`);
    blocks[stage] = fence[1].split("\n");
  }
  return blocks;
}

/** Every pin a block sets is the real sha256 of what it is compared with, and every file the stage needs is compared in time. */
function assertDocPins(text, real) {
  for (const [stage, lines] of Object.entries(stageBlocks(text))) {
    const vars = new Map();
    for (const l of lines) {
      const m = /^([A-Z][A-Z0-9]*)=(\S+)$/.exec(l);
      if (m) vars.set(m[1], m[2]);
    }
    const resolve = (p) => p.replace(/^\$\{(\w+)\}$/, (_, v) => vars.get(v) ?? `\${${v}}`);
    const compares = [];
    lines.forEach((l, i) => {
      const m = COMPARE.exec(l);
      if (m) compares.push({ path: resolve(m[1]), name: m[2], at: i });
    });
    for (const c of compares) {
      assert.ok(vars.has(c.name), `${stage} compares ${c.path} against \${${c.name}}, which the block never sets`);
      assert.ok(c.path in real, `${stage} compares ${c.path}, which is not a file the document pins`);
      assert.equal(vars.get(c.name), real[c.path], `${c.name} in ${stage} is not the sha256 of ${c.path}`);
    }
    const until = stage === "STAGE 0" ? lines.findIndex((l) => l.includes("> /tmp/0097-head.sha")) : lines.indexOf(CREDENTIALS);
    assert.ok(until >= 0, `${stage} has no ${stage === "STAGE 0" ? "head record" : "credentials line"} to be compared before`);
    for (const p of STAGE_PINS[stage]) {
      assert.ok(compares.some((c) => c.path === p && c.at < until),
        `${stage} does not compare ${p} by sha256 before it ${stage === "STAGE 0" ? "records the head" : "loads the production credentials"}`);
    }
    for (const name of vars.keys()) {
      if (/^SHA/.test(name)) assert.ok(compares.some((c) => c.name === name), `${stage} sets ${name} but never compares it`);
    }
    if (stage !== "STAGE 2") {
      const checksSidecar = lines.some((l) => {
        const m = /^shasum -a 256 -c (\S+) \|\| \{ echo "STOP: [^"]+"; exit 1; \}$/.exec(l);
        return m !== null && resolve(m[1]) === SIDECAR_PATH;
      });
      assert.ok(checksSidecar, `${stage} does not check the document against ${SIDECAR_PATH}`);
    }
  }
}

/** The facts table quotes each pinned file with its real sha256. */
function assertFactsQuote(text, real) {
  const rows = text.split("\n").filter((l) => l.startsWith("| "));
  for (const p of [PENDING_PATH, PRE, POST, VM_PATH, GUARD_PATH]) {
    const quoted = rows.map((l) => l.indexOf(`\`${p}\``)).map((i, n) => (i < 0 ? null : /sha256 `([0-9a-f]{64})`/.exec(rows[n].slice(i))?.[1]))
      .filter((h) => h != null);
    assert.ok(quoted.length > 0, `the facts table does not quote ${p} with its sha256`);
    for (const h of quoted) assert.equal(h, real[p], `the facts table quotes ${p} with a sha256 that is not the file's`);
  }
}

/** Every 64-hex string in the document is the sha256 of a file it pins. */
function assertNoOtherHash(text, real) {
  const known = new Set(Object.values(real));
  const unknown = [...new Set(text.match(/\b[0-9a-f]{64}\b/g) ?? [])].filter((h) => !known.has(h));
  assert.deepEqual(unknown, [], `the apply document quotes a sha256 that is no pinned file's: ${unknown}`);
}

/** The sidecar is exactly `shasum -a 256 docs/migration-apply-0097.md`. */
function assertSidecar(text, side) {
  assert.equal(side, `${sha256(text)}  ${DOC_PATH}\n`, `${SIDECAR_PATH} is not the sha256 of ${DOC_PATH}`);
}

test("the apply document: every block's pin is the real sha256 of its file, compared before the stage loads production credentials", () => {
  assertDocPins(doc, REAL);
});

test("the apply document: the facts table quotes each file's real sha256, and no other 64-hex string appears", () => {
  assertFactsQuote(doc, REAL);
  assertNoOtherHash(doc, REAL);
});

test("the apply document: the sidecar is the document's sha256", () => {
  assertSidecar(doc, sidecar);
});

/** The document's lines that set a pin, each once, for the sweep. */
const pinLines = () => doc.split("\n").map((l, i) => [l, i]).filter(([l]) => /^SHA[A-Z0-9]*=[0-9a-f]{64}$/.test(l));
const withLine = (i, to) => doc.split("\n").map((l, n) => (n === i ? to : l)).join("\n");
const withoutLine = (i) => doc.split("\n").filter((_, n) => n !== i).join("\n");
const stale = (h) => (h[0] === "0" ? "1" : "0") + h.slice(1);

test("SWEEP apply document: each pin a block sets, made stale in turn, is red on that pin", () => {
  const lines = pinLines();
  assert.equal(lines.length, 9, `the sweep expects 9 pin lines (stage 0: 1, stage 1: 5, stage 2: 3); found ${lines.length}`);
  for (const [l, i] of lines) {
    const [name, value] = l.split("=");
    red(() => assertDocPins(withLine(i, `${name}=${stale(value)}`), REAL), new RegExp(`^${name} in STAGE \\d is not the sha256 of `));
  }
});

test("SWEEP apply document: each sha256 comparison, deleted in turn, is red on that file", () => {
  const all = doc.split("\n");
  const at = all.map((l, i) => [l, i]).filter(([l]) => COMPARE.test(l));
  assert.equal(at.length, 9, `the sweep expects 9 sha256 comparisons; found ${at.length}`);
  for (const [, i] of at) red(() => assertDocPins(withoutLine(i), REAL), /does not compare .* by sha256 before/);
});

test("CONTROL apply document: stage 1 as it stood before round 2 (no post-check pin) is red; so is a post-check edited on the branch", () => {
  let old = doc;
  for (const l of [
    `SHAPOST=${REAL[POST]}\n`,
    `test -f ${POST} || { echo "STOP: the post-check is not on disk"; exit 1; }\n`,
    `[ "$(shasum -a 256 ${POST} | cut -d' ' -f1)" = "\${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }\n`,
  ]) {
    const i = old.indexOf(l, old.indexOf("\n## STAGE 1:"));
    assert.ok(i >= 0 && i < old.indexOf("\n## STAGE 2:"), `the plant did not find stage 1's line: ${l.slice(0, 60)}`);
    old = old.slice(0, i) + old.slice(i + l.length);
  }
  red(() => assertDocPins(old, REAL), new RegExp(`^STAGE 1 does not compare ${POST} by sha256 before it loads the production credentials`));
  red(() => assertDocPins(doc, { ...REAL, [POST]: stale(REAL[POST]) }), new RegExp(`^SHAPOST in STAGE 1 is not the sha256 of ${POST}`));
});

test("CONTROL apply document: a comparison moved after the credentials, a pin compared under another name, an unset pin and an unused pin are each red", () => {
  const all = doc.split("\n");
  const s1 = all.indexOf("## STAGE 1: the run window, pre-flight, the queue, the pre-check, apply");
  const post = all.findIndex((l, i) => i > s1 && l.startsWith(`[ "$(shasum -a 256 ${POST} `));
  const cred = all.indexOf(CREDENTIALS, s1);
  assert.ok(s1 >= 0 && post > s1 && cred > post, "the plants did not find stage 1's post-check comparison and credentials line");
  const moved = [...all.slice(0, post), ...all.slice(post + 1, cred + 1), all[post], ...all.slice(cred + 1)].join("\n");
  red(() => assertDocPins(moved, REAL), new RegExp(`^STAGE 1 does not compare ${POST} by sha256 before`));
  red(() => assertDocPins(withLine(post, all[post].replace("${SHAPOST}", "${SHAPRE}")), REAL), new RegExp(`^SHAPRE in STAGE 1 is not the sha256 of ${POST}`));
  const setAt = all.findIndex((l, i) => i > s1 && l.startsWith("SHAPOST="));
  red(() => assertDocPins(withoutLine(setAt), REAL), /^STAGE 1 compares .* against \$\{SHAPOST\}, which the block never sets/);
  red(() => assertDocPins(withLine(setAt, `${all[setAt]}\nSHAEXTRA=${REAL[PRE]}`), REAL), /^STAGE 1 sets SHAEXTRA but never compares it/);
});

test("CONTROL apply document: a sidecar check deleted from stage 0 or stage 1 is red", () => {
  for (const [stage, l] of [["STAGE 0", 'shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }'],
    ["STAGE 1", `shasum -a 256 -c ${SIDECAR_PATH} || { echo "STOP: this document is not the approved one"; exit 1; }`]]) {
    red(() => assertDocPins(plant(doc, `\n${l}\n`, "\n"), REAL), new RegExp(`^${stage} does not check the document against`));
  }
});

test("CONTROL apply document: a stale sha256 in the facts table, an unknown 64-hex string, and a sidecar that is not the document's are each red", () => {
  const preRow = doc.split("\n").find((l) => l.startsWith("| Pre-check |"));
  assert.ok(preRow, "the plant did not find the facts table's pre-check row");
  red(() => assertFactsQuote(plant(doc, preRow, preRow.replace(REAL[PRE], stale(REAL[PRE]))), REAL),
    new RegExp(`^the facts table quotes ${PRE} with a sha256 that is not the file's`));
  red(() => assertFactsQuote(plant(doc, preRow, preRow.replace(`sha256 \`${REAL[PRE]}\``, "")), REAL),
    new RegExp(`^the facts table does not quote ${PRE} with its sha256`));
  red(() => assertNoOtherHash(`${doc}\nan old pin: ${stale(REAL[POST])}\n`, REAL), /quotes a sha256 that is no pinned file's/);
  red(() => assertSidecar(`${doc} `, sidecar), /is not the sha256 of/);
  red(() => assertSidecar(doc, sidecar.replace(/^[0-9a-f]/, (c) => (c === "0" ? "1" : "0"))), /is not the sha256 of/);
});

test("GREEN apply document: a prose edit with its sidecar rewritten stays green on every document rule", () => {
  const edited = plant(doc, "**Apply before merge.**", "**Apply before merge, always.**");
  assertDocPins(edited, REAL);
  assertFactsQuote(edited, REAL);
  assertNoOtherHash(edited, REAL);
  assertSidecar(edited, `${sha256(edited)}  ${DOC_PATH}\n`);
});
