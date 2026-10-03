// The BOOK-CONFIRM measurement (scripts/db/measure-book-confirm.sql) is a READ
// ONLY, COUNTS ONLY profile GREEN runs on production: an online request reception
// accepted, and the confirmation message it should have produced. Its transcript
// is pasted back into a session, so it must carry no patient data. These tests
// hold the file to that: it writes nothing, it opens and ends no transaction of
// its own, its first row prints that the transaction is READ ONLY, and every
// printed expression is a count, a fixed label, a Lisbon date, a clinic's opening
// hour, or one of a short list of columns that cannot hold a person's data.
// Section H (what a location carries, for the third location) is held to the
// same rule: a location's name and a role's key may print, a staff name may not.
//
// The server is the real guard for writes: GREEN's block runs the file between
// `begin read only` and `rollback`, so a write would be refused. That block is
// the one transaction; the file holds no BEGIN, COMMIT or ROLLBACK. These tests
// catch a writing line, or a printed column, before it reaches a sitting.
//
// A READ ONLY TRANSACTION DOES NOT REFUSE EVERYTHING. psql's own meta-commands
// (\copy to a file, \!, \o, \g, \gexec) run on the client, and pg_notify, an
// advisory lock, pg_sleep or a file-reading function are not writes to the
// server. So the write check also holds the file to one meta-command, an exact
// \echo of a fixed string, and to a closed list of function calls.
//
// WHAT THE PRINTED-EXPRESSION CHECK IS, AND IS NOT. It reads the select list of
// every statement that prints (a `select` outside every parenthesis) and refuses
// any expression that is not on a closed list of shapes. It is a tripwire with
// its own red arms below, not a proof: a reviewer still reads the twenty-six
// printed lists. Since the review of 2026-10-03 it also binds every alias to
// the one relation it may name, allows no subquery in a FROM and no CTE outside
// a pinned list of names, and holds `patients` and `users` to a pinned list of
// columns anywhere in the file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "scripts/db/measure-book-confirm.sql";
const SQL = readFileSync(join(ROOT, FILE), "utf8");

// The one psql meta-command the file may hold: an \echo of one single-quoted,
// fixed string. No backtick (psql runs it as a shell command), no backslash
// inside, and no `:name`, `:'name'`, `:"name"` or `:{?name}` interpolation.
const ECHO = /^\\echo '[^'`\\]*'$/;
const isEcho = (l) => ECHO.test(l) && !/:[A-Za-z_'"{]/.test(l);

/**
 * The SQL with comments and exact \echo lines removed. Any OTHER line holding a
 * backslash stays in, so the checks below see it and metaProblems reports it.
 */
const codeOf = (sql) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l) && !isEcho(l))
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

/** Every string literal replaced by a numbered placeholder, and the literals. */
function mask(code) {
  const literals = [];
  const masked = code.replace(/'(?:[^']|'')*'/g, (m) => {
    literals.push(m);
    return `\u00a7${literals.length - 1}\u00a7`;
  });
  return { masked, literals };
}
const unmask = (s, literals) => s.replace(/\u00a7(\d+)\u00a7/g, (_, i) => literals[Number(i)]);
const squash = (s) => s.replace(/\s+/g, " ").trim();

/** A backslash outside a comment that is not an exact \echo line: a psql meta-command. */
export function metaProblems(sql) {
  const problems = [];
  for (const line of sql.split("\n")) {
    if (/^\s*--/.test(line) || isEcho(line)) continue;
    if (line.replace(/--.*$/, "").includes("\\")) problems.push(`a psql meta-command or a backslash that is not an exact \\echo line: ${line.trim().slice(0, 80)}`);
  }
  return problems;
}

// Every word that may stand directly before an opening parenthesis: nine
// functions, none with a side effect, and six keywords.
const CALLS = new Set(["count", "coalesce", "btrim", "dense_rank", "jsonb_typeof", "to_char", "now", "min", "max", "current_setting", "bool_or", "exists", "as", "filter", "in", "over"]);

// Words that write, lock, wait, signal, read a file or change the session. A
// READ ONLY transaction refuses the first group and allows the rest.
const FORBIDDEN_WORDS =
  /\b(insert|update|delete|merge|truncate|into|share|copy|do|call|listen|unlisten|notify|vacuum|analyze|cluster|reindex|refresh|lock|grant|revoke|create|alter|drop|commit|begin|rollback|savepoint|prepare|execute|declare|fetch|discard|set|reset|load|checkpoint|nextval|setval|currval|lastval|set_config|pg_notify|pg_advisory\w*|pg_try_advisory\w*|pg_sleep\w*|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_file|pg_reload_conf|pg_logical_emit_message|dblink\w*|lo_\w+)\b/i;

/** No statement writes, locks, waits, signals, reads a file, changes the session or leaves psql. */
export function writeProblems(sql) {
  const problems = [...metaProblems(sql)];
  const code = codeOf(sql);
  for (const line of code.split("\n")) {
    const t = line.trim();
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|SET|RESET|DO|BEGIN|ROLLBACK|LISTEN|NOTIFY)\b/i.test(t)) {
      problems.push(`a statement that writes or changes the session: ${t.slice(0, 80)}`);
    }
    for (const m of t.matchAll(/'([^']*)'/g)) {
      if (/^\s*(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET|TRUNCATE\s|MERGE\s+INTO|COPY\s|GRANT\s|REVOKE\s)/i.test(m[1])) {
        problems.push(`a writing statement in a string: '${m[1].slice(0, 60)}'`);
      }
    }
  }
  // Outside every string: each statement starts with SELECT or WITH, no forbidden
  // word appears at all, and nothing is called that is not on the closed list.
  const { masked } = mask(code);
  for (const stmt of masked.split(";").map((s) => s.trim()).filter(Boolean)) {
    if (!/^(select|with)\b/i.test(stmt)) problems.push(`a statement that is not a SELECT: ${squash(stmt).slice(0, 80)}`);
    const word = stmt.match(FORBIDDEN_WORDS);
    if (word) problems.push(`a writing, locking, waiting, signalling or file-reading word outside a string: ${word[1]}`);
    for (const m of stmt.matchAll(/([a-z_][a-z0-9_]*)\s*\(/gi)) {
      if (!CALLS.has(m[1].toLowerCase())) problems.push(`a call that is not on the closed list: ${m[1]}`);
    }
  }
  return problems;
}

/** The select lists that PRINT: a `select` outside every parenthesis, up to its `from`. */
function printedLists(masked) {
  const lists = [];
  for (const stmt of masked.split(";")) {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < stmt.length; i++) {
      const c = stmt[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (depth === 0 && /[a-z]/i.test(c) && (i === 0 || /[^a-z0-9_.]/i.test(stmt[i - 1]))) {
        const word = stmt.slice(i).match(/^[a-z_]+/i)[0].toLowerCase();
        if (word === "select" && start === -1) start = i + word.length;
        else if (word === "from" && start !== -1) {
          lists.push(stmt.slice(start, i));
          start = -1;
        }
        i += word.length - 1;
      }
    }
    if (start !== -1) lists.push(stmt.slice(start));
  }
  return lists;
}

/** One select list split at the commas outside every parenthesis, aliases removed. */
function expressionsOf(list) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const c of list) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((e) => squash(e).replace(/ as "?[a-z_0-9]+"?$/i, "")).filter((e) => e !== "");
}

// A column printed as it is stored. Each is on this list for a stated reason.
const BARE = new Map([
  ["current_setting('transaction_read_only')", "row 0, the read-only reading"],
  ["dense_rank() over (order by t.created_at, t.id)", "a tenant's ordinal, oldest first: a number, not its name or id"],
  ["l.name", "a location's name: a clinic, not a person"],
  ["a.status::text", "the appointment_status enum: five fixed values"],
  ["d.channel", "CHECK-pinned by 0075 to sms or email"],
  ["d.outcome", "CHECK-pinned by 0075 to sent, suppressed or provider_error"],
  ["l.slot_granularity_min", "a location's slot size in minutes: a number about a clinic"],
  ["labelled.door", "a label the door CASE builds from fixed strings (pinned below)"],
  ["acc_all_origins.door", "a label the door CASE builds from fixed strings (pinned below)"],
  ["flagged.door", "a label the door CASE builds from fixed strings (pinned below)"],
]);

// A text column printed only when its value is a plain lower-case code, and
// counted as "other (not printed)" otherwise. A phone number starts with a digit
// or a plus, and an email address holds an at sign: neither can pass.
const SHIELDS = new Set([
  "case when d.template_id ~ '^[a-z][a-z0-9_]*([.][a-z0-9_]+)+$' then d.template_id else 'other (not printed)' end",
  "case when d.suppression_reason is null then '(none)' when d.suppression_reason ~ '^[a-z][a-z0-9_]*$' then d.suppression_reason else 'other (not printed)' end",
  "case when d.provider_status is null then '(none)' when d.provider_status ~ '^[a-z][a-z0-9_]*$' then d.provider_status else 'other (not printed)' end",
  "case when g.status in ('pending', 'confirmed', 'declined') then g.status else 'other (not printed)' end",
  // A role's key (roles.slug: owner, admin, therapist, reception), never the person who holds it.
  "case when staff.is_shared_resource then '(shared resource, not staff)' when r.slug is null then '(no role)' when r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end",
  "case when sl.id is null then '(no staff_locations row)' when u.is_shared_resource then '(shared resource, not staff)' when r.slug is null then '(no role)' when r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end",
]);

// A timestamp is printed only as a Lisbon calendar date.
const DATE = /^to_char\((?:(?:min|max)\((?:d|al)\.created_at\)|now\(\)|\(now\(\) - interval '30 days'\)) at time zone 'Europe\/Lisbon', 'YYYY-MM-DD'\)$/;

// A clinic's hours: a LOCATION's four time columns, as HH:MM. No other time prints.
const HOURS = /^(?:to_char\(l\.(?:opens_at|closes_at), 'HH24:MI'\)|coalesce\(to_char\(l\.(?:midday_closed_from|midday_closed_to), 'HH24:MI'\), '\(none\)'\))$/;

/** The index of the parenthesis that closes the one opened at `open`, or -1. */
function closeOf(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * True when `expr` (masked) is `count( ... )` and nothing else, or
 * `count( ... ) filter ( ... )` and nothing else. The FILTER's own closing
 * parenthesis must be the last character: `count(*) filter (where true) || (x)`
 * ends in a parenthesis too, and is refused.
 */
function isCount(expr) {
  if (!/^count\(/i.test(expr)) return false;
  const end = closeOf(expr, 5);
  if (end === -1) return false;
  const rest = expr.slice(end + 1).trim();
  if (rest === "") return true;
  if (!/^filter \(/i.test(rest)) return false;
  return closeOf(rest, rest.indexOf("(")) === rest.length - 1;
}

/** True when every THEN and ELSE of a single, un-nested CASE yields a string literal. */
function isLiteralCase(expr) {
  if (!/^case\b/i.test(expr) || !/\bend$/i.test(expr)) return false;
  if ((expr.match(/\bcase\b/gi) ?? []).length !== 1) return false;
  const results = [...expr.matchAll(/\b(?:then|else)\s+(.*?)(?=\s+(?:when|else|end)\b)/gi)].map((m) => m[1]);
  return results.length > 0 && results.every((r) => /^\u00a7\d+\u00a7$/.test(r));
}

// THE ALLOW-LISTS ABOVE NAME AN ALIAS, SO THE ALIAS IS BOUND TO ITS RELATION.
// `l.name` is safe only while `l` is `locations`. Each alias may name exactly
// one relation, in every statement, subquery and CTE of the file.
const TABLE_OF = new Map([
  ["l", "locations"], ["t", "tenants"], ["a", "appointments"], ["al", "audit_log"],
  ["d", "reminder_dispatches"], ["g", "guest_booking_requests"], ["p", "patients"],
  ["u", "users"], ["r", "roles"], ["sl", "staff_locations"], ["av", "availability_templates"],
  ["sp", "service_location_prices"], ["pp", "service_pack_location_prices"], ["n", "staff_notifications"],
]);
// The CTEs the file may define. A CTE is named as itself, and one has a short alias.
const CTES = new Set(["acc", "labelled", "pat", "per_door", "flagged", "staff", "presence", "acc_all_origins", "acc_of_window_requests", "seen"]);
const CTE_ALIAS = new Map([["x", "acc_of_window_requests"]]);
const TABLES = new Set(TABLE_OF.values());
// A relation after FROM or JOIN, and its alias when one follows. The word after
// the relation is not an alias when it is a keyword, and is then left unread so
// that `from pat join patients p` yields both relations.
const RELATION = /\b(?:from|join)\s+(\(|[a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?(?!(?:where|join|left|right|inner|full|cross|on|group|order|union|limit|having|window)\b)([a-z_][a-z0-9_]*))?/gi;

// The only columns of `patients` and of `users` the file may touch, anywhere.
const PATIENT_COLUMNS = new Set(["id", "email", "phone", "phone_e164", "reminder_email_enabled", "reminder_sms_enabled", "deleted_at"]);
const USER_COLUMNS = new Set(["id", "role_id", "is_active", "is_bookable", "is_shared_resource"]);
// A contact column of a patient is only ever tested for presence, never selected.
const PRESENCE = [
  [/\bp\.email\b/g, /coalesce\(p\.email, ''\) (?:<>|=) ''/g, "p.email"],
  [/\bp\.phone\b/g, /coalesce\(p\.phone, ''\) (?:<>|=) ''/g, "p.phone"],
  [/\bp\.phone_e164\b/g, /p\.phone_e164 like '\+3519%'/g, "p.phone_e164"],
];
// A column name that could hold a person's data is never written without its alias.
const UNQUALIFIED = /(?<![.\w])(email|phone|phone_e164|full_name|first_name|last_name|name|address|notes|nif|date_of_birth|job_title|metadata|settings|ip|slug|title|description|color)\b/i;

/** Every alias, relation, CTE or column that is not the one the allow-lists assume. */
export function bindingProblems(sql) {
  const code = codeOf(sql);
  const { masked } = mask(code);
  const problems = [];
  for (const stmt of masked.split(";").map((s) => s.trim()).filter(Boolean)) {
    const ctes = new Set();
    for (const m of stmt.matchAll(/(?:\bwith|,)\s*([a-z_][a-z0-9_]*)\s+as\s*\(/gi)) {
      const name = m[1].toLowerCase();
      if (!CTES.has(name)) problems.push(`a CTE that is not on the pinned list: ${name}`);
      ctes.add(name);
    }
    const bound = new Set();
    for (const m of stmt.matchAll(RELATION)) {
      if (m[1] === "(") {
        problems.push("a subquery in a FROM or a JOIN");
        continue;
      }
      const rel = m[1].toLowerCase();
      const alias = m[2] ? m[2].toLowerCase() : rel;
      if (/^\s*,/.test(stmt.slice(m.index + m[0].length))) problems.push(`a comma join after ${rel}`);
      if (!TABLES.has(rel) && !ctes.has(rel)) problems.push(`a relation that is neither a pinned table nor a CTE of its statement: ${rel}`);
      const wanted = TABLE_OF.get(alias) ?? CTE_ALIAS.get(alias) ?? (CTES.has(alias) ? alias : null);
      if (wanted !== rel) problems.push(`the alias ${alias} names ${rel}`);
      bound.add(alias);
    }
    for (const m of stmt.matchAll(/(?<![a-z0-9_.\u00a7])([a-z_][a-z0-9_]*)\.([a-z_*][a-z0-9_]*)/gi)) {
      const [alias, column] = [m[1].toLowerCase(), m[2].toLowerCase()];
      if (!bound.has(alias)) problems.push(`a column of an alias its statement does not bind: ${alias}.${column}`);
      if (column === "*") problems.push(`every column of ${alias}`);
      if (alias === "p" && !PATIENT_COLUMNS.has(column)) problems.push(`a column of patients that is not on the pinned list: ${column}`);
      if (alias === "u" && !USER_COLUMNS.has(column)) problems.push(`a column of users that is not on the pinned list: ${column}`);
    }
    const bare = stmt.match(UNQUALIFIED);
    if (bare) problems.push(`a column name without its alias: ${bare[1]}`);
    if (/(?<!\()\*|\*(?!\))/.test(stmt)) problems.push("a star that is not count(*)");
  }
  for (const [every, tested, name] of PRESENCE) {
    const n = (code.match(every) ?? []).length;
    const ok = (code.match(tested) ?? []).length;
    if (n !== ok) problems.push(`${name} is read ${n} times and only ${ok} of them are the presence test`);
  }
  return problems;
}

/** Every printed expression that is not on the closed list of shapes, and every binding problem. */
export function printedProblems(sql) {
  const { masked, literals } = mask(codeOf(sql));
  const problems = [...bindingProblems(sql)];
  for (const list of printedLists(masked)) {
    for (const e of expressionsOf(list)) {
      const plain = unmask(e, literals);
      const ok =
        /^\u00a7\d+\u00a7$/.test(e) ||
        isCount(e) ||
        isLiteralCase(e) ||
        BARE.has(plain) ||
        SHIELDS.has(plain) ||
        DATE.test(plain) ||
        HOURS.test(plain);
      if (!ok) problems.push(`a printed expression that is not on the closed list: ${plain.slice(0, 140)}`);
    }
  }
  return problems;
}

test("the measurement writes nothing and opens or ends no transaction of its own", () => {
  assert.deepEqual(writeProblems(SQL), []);
});

test("CONTROL: the write check is red on each thing a sitting must not run, and green on the real file", () => {
  // `want` is a piece of the problem the arm must raise. `want: null` is a green
  // arm: no problem at all. Without a green arm a check that refuses everything
  // would pass every red one.
  const arms = [
    { sql: SQL, want: null },
    { sql: "-- delete in a comment, and a \\! in one too\nselect count(*)\nfrom patients p\nwhere p.deleted_at is null;", want: null },
    { sql: "\\echo '--- A. A LABEL: fixed text (with a colon and a parenthesis)'\nselect count(*)\nfrom patients p;", want: null },
    // What the server's READ ONLY transaction refuses anyway.
    { sql: "delete from reminder_dispatches;", want: "writes or changes the session" },
    { sql: "select 'update patients set email = null';", want: "a writing statement in a string" },
    { sql: "with w as (\n  update patients set email = null returning 1\n)\nselect count(*)\nfrom w;", want: "outside a string: update" },
    { sql: "with w as (delete from patients returning 1)\nselect count(*)\nfrom w;", want: "outside a string: delete" },
    { sql: "select count(*) into t2\nfrom patients p;", want: "outside a string: into" },
    { sql: "select nextval('patient_number_seq');", want: "outside a string: nextval" },
    { sql: "select setval('patient_number_seq', 1);", want: "outside a string: setval" },
    { sql: "copy patients to stdout;", want: "writes or changes the session" },
    { sql: "select count(*)\nfrom patients p;\ncopy (select count(*) from patients p) to program 'x';", want: "outside a string: copy" },
    { sql: "do $$ begin perform 1; end $$;", want: "writes or changes the session" },
    { sql: "call some_procedure();", want: "writes or changes the session" },
    // What it does NOT refuse: the transaction, the session, locks, waits, signals, files.
    { sql: "begin read only;", want: "writes or changes the session" },
    { sql: "rollback;", want: "writes or changes the session" },
    { sql: "commit;", want: "writes or changes the session" },
    { sql: "set local statement_timeout = '60s';", want: "writes or changes the session" },
    { sql: "select set_config('statement_timeout', '0', false);", want: "outside a string: set_config" },
    { sql: "select count(*)\nfrom patients p\nfor update;", want: "outside a string: update" },
    { sql: "select count(*)\nfrom patients p\nfor share;", want: "outside a string: share" },
    { sql: "select pg_notify('c','p');", want: "outside a string: pg_notify" },
    { sql: "notify c;", want: "writes or changes the session" },
    { sql: "listen c;", want: "writes or changes the session" },
    { sql: "select pg_try_advisory_lock(1);", want: "outside a string: pg_try_advisory_lock" },
    { sql: "select pg_advisory_xact_lock(1);", want: "outside a string: pg_advisory_xact_lock" },
    { sql: "select pg_sleep(600);", want: "outside a string: pg_sleep" },
    { sql: "select pg_terminate_backend(1);", want: "outside a string: pg_terminate_backend" },
    { sql: "select pg_cancel_backend(1);", want: "outside a string: pg_cancel_backend" },
    { sql: "select pg_read_file('/etc/passwd');", want: "outside a string: pg_read_file" },
    { sql: "select pg_ls_dir('.');", want: "outside a string: pg_ls_dir" },
    { sql: "select dblink_exec('c', 'x');", want: "outside a string: dblink_exec" },
    { sql: "select lo_import('/tmp/x');", want: "outside a string: lo_import" },
    { sql: "select lo_export(1, '/tmp/x');", want: "outside a string: lo_export" },
    { sql: "select some_function_nobody_listed(1);", want: "not on the closed list: some_function_nobody_listed" },
    { sql: "select query_to_xml('select 1', true, true, '');", want: "not on the closed list: query_to_xml" },
    // What psql runs on the client, where no transaction applies.
    { sql: "\\copy (select * from patients) to '/tmp/x.csv'", want: "a psql meta-command" },
    { sql: "\\! echo hi", want: "a psql meta-command" },
    { sql: "\\o /tmp/out.txt", want: "a psql meta-command" },
    { sql: "select 'drop table patients'\n\\gexec", want: "a psql meta-command" },
    { sql: "select count(*)\nfrom patients p\n\\g /tmp/x", want: "a psql meta-command" },
    { sql: "select count(*) as n\nfrom patients p \\gset", want: "a psql meta-command" },
    { sql: "select count(*)\nfrom patients p \\watch 1", want: "a psql meta-command" },
    { sql: "select count(*)\nfrom patients p \\g /tmp/x", want: "a psql meta-command" },
    { sql: "\\i /tmp/other.sql", want: "a psql meta-command" },
    { sql: "\\set x 1", want: "a psql meta-command" },
    { sql: "\\echo `cat /etc/passwd`", want: "a psql meta-command" },
    { sql: "\\echo 'a label' `id`", want: "a psql meta-command" },
    { sql: "\\echo 'a label with :DBNAME in it'", want: "a psql meta-command" },
    { sql: "\\echo :'HOST'", want: "a psql meta-command" },
    { sql: "\\echo a label with no quotes", want: "a psql meta-command" },
    { sql: "  \\echo 'indented'", want: "a psql meta-command" },
  ];
  for (const { sql, want } of arms) {
    const got = writeProblems(sql);
    if (want === null) assert.deepEqual(got, [], `a green arm is refused: ${sql.slice(0, 60)}`);
    else assert.ok(got.some((g) => g.includes(want)), `not refused as "${want}": ${sql} (got ${JSON.stringify(got)})`);
  }
  // The real file's meta-commands are \echo lines and nothing else.
  const backslashed = SQL.split("\n").filter((l) => l.includes("\\"));
  assert.equal(backslashed.length, 25, "the file holds 25 \\echo lines: the title (which heads row 0), one for each of the 23 other statements, and a last line");
  for (const l of backslashed) assert.equal(isEcho(l), true, `not an exact \\echo: ${l.slice(0, 60)}`);
  // The one setting it reads is the read-only reading of row 0.
  assert.equal(codeOf(SQL).split("current_setting(").length - 1, 1);
});

test("its first query prints whether the transaction is READ ONLY, in the row the dispatch greps", () => {
  const first = codeOf(SQL).split(";")[0];
  assert.match(first, /current_setting\('transaction_read_only'\)/);
  assert.match(first, /select '0\. this transaction is READ ONLY \(the server refuses writes\)' as check/);
});

test("it prints counts only: every printed expression is a count, a fixed label, a Lisbon date or a listed column", () => {
  assert.deepEqual(printedProblems(SQL), []);
  const { masked } = mask(codeOf(SQL));
  const lists = printedLists(masked);
  // 24 statements (17 in sections 0 to G, 7 in H); F and G each print through
  // two selects joined by UNION ALL.
  assert.equal(masked.split(";").filter((s) => s.trim() !== "").length, 24);
  assert.equal(lists.length, 26, `expected 26 printed select lists, found ${lists.length}`);
  // Postgres cuts an identifier at 63 bytes and says so in a NOTICE: no alias is longer.
  for (const m of codeOf(SQL).matchAll(/ as ([a-z_][a-z0-9_]*)/g)) assert.ok(m[1].length <= 63, `an alias longer than 63: ${m[1]}`);
});

test("CONTROL: the printed-columns check is red on each way a person's data could print, and green on a count", () => {
  const red = [
    "select p.email\nfrom patients p;",
    "select p.full_name as name, count(*)\nfrom patients p\ngroup by 1;",
    "select max(p.email) as newest\nfrom patients p;",
    "select string_agg(p.phone, ',')\nfrom patients p;",
    "select a.id, count(*)\nfrom appointments a\ngroup by 1;",
    "select count(*), a.patient_id\nfrom appointments a\ngroup by 2;",
    "select l.phone\nfrom locations l;",
    "select l.address\nfrom locations l;",
    "select t.name\nfrom tenants t;",
    "select *\nfrom patients;",
    "select min(d.created_at)\nfrom reminder_dispatches d;",
    "select to_char(min(d.created_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')\nfrom reminder_dispatches d;",
    "select d.template_id, count(*)\nfrom reminder_dispatches d\ngroup by 1;",
    "select d.provider_message_id\nfrom reminder_dispatches d;",
    "select case when p.email is null then 'none' else p.email end\nfrom patients p;",
    "select count(*) || p.email\nfrom patients p\ngroup by p.email;",
    "select count(*), (select p.email from patients p limit 1)\nfrom appointments a;",
    "select al.metadata\nfrom audit_log al;",
    "with c as (\n  select p.email as door\n  from patients p\n)\nselect c.door\nfrom c;",
    // A count with something glued on after its FILTER.
    "select count(*) filter (where true) || (p.email)\nfrom patients p\ngroup by p.email;",
    "select count(*) filter (where true) || min(p.email)\nfrom patients p;",
    "select count(*) filter (where true) filter (where p.email <> '')\nfrom patients p;",
    // An allowed alias over another relation, a renaming subquery, a renaming CTE,
    // a CTE that takes a table's name, and a shield fed by a subquery.
    "select l.name as location_name\nfrom patients l;",
    "select d.channel, count(*)\nfrom (select p.email as channel from patients p) d\ngroup by 1;",
    "with d as (\n  select p.email as channel\n  from patients p\n)\nselect d.channel, count(*)\nfrom d\ngroup by 1;",
    "with reminder_dispatches as (\n  select p.email as channel\n  from patients p\n)\nselect d.channel, count(*)\nfrom reminder_dispatches d\ngroup by 1;",
    "select case when r.slug is null then '(no role)' when r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end as role, count(*)\nfrom (select u.full_name as slug from users u) r\ngroup by 1;",
    "with labelled as (\n  select p.email as door\n  from patients p\n)\nselect labelled.door, count(*)\nfrom labelled\ngroup by 1;",
    "select a.status::text, count(*)\nfrom patients a\ngroup by 1;",
    "select l.slot_granularity_min\nfrom users l;",
    // A patient or staff column off the pinned list, anywhere, printed or not.
    "with pat as (\n  select p.full_name\n  from patients p\n)\nselect count(*)\nfrom pat;",
    "select count(*) filter (where u.email <> '')\nfrom users u;",
    "select count(*)\nfrom patients p\nwhere p.email like 'a%';",
    "select count(distinct p.email)\nfrom patients p;",
    "select count(*)\nfrom patients\nwhere email is not null;",
    "select count(*)\nfrom patients p\nwhere exists (select 1 from users u where u.full_name = 'x');",
    "select count(*)\nfrom users u\ncross join lateral (select u.*) z;",
    "select count(*)\nfrom appointments a\nwhere a.id in (select q.id from appointments q);",
    "select count(*)\nfrom appointments a\nunion all\nselect p.phone\nfrom patients p;",
    // Section H's ways: a staff name, a staff contact, a staff id, a role's free-text
    // name, an unshielded role key, and a time that is not a clinic's hours.
    "select u.full_name, count(*)\nfrom users u\ngroup by 1;",
    "select u.email\nfrom users u;",
    "select u.phone\nfrom users u;",
    "select u.job_title\nfrom users u;",
    "select sl.user_id, count(*)\nfrom staff_locations sl\ngroup by 1;",
    "select min(u.full_name)\nfrom users u;",
    "select r.name, count(*)\nfrom roles r\ngroup by 1;",
    "select r.slug, count(*)\nfrom roles r\ngroup by 1;",
    "select l.id\nfrom locations l;",
    "select to_char(a.starts_at, 'HH24:MI')\nfrom appointments a;",
    "select to_char(l.opens_at, 'HH24:MI') || u.full_name\nfrom locations l, users u;",
    "select coalesce(to_char(l.midday_closed_from, 'HH24:MI'), u.full_name)\nfrom locations l, users u;",
    "select av.start_time\nfrom availability_templates av;",
    "select sp.price_cents\nfrom service_location_prices sp;",
  ];
  for (const sql of red) assert.equal(printedProblems(sql).length >= 1, true, `not refused: ${sql}`);
  const green = [
    "select count(distinct a.patient_id) as patients\nfrom appointments a;",
    "select 'a label' as item, count(*) filter (where coalesce(p.email, '') <> '') as with_email\nfrom patients p;",
    "select case when coalesce(btrim(l.phone), '') = '' then 'no' else 'yes' end as phone_present\nfrom locations l;",
    "with pat as (\n  select distinct a.patient_id\n  from appointments a\n)\nselect count(*) filter (where coalesce(p.phone, '') = '') as no_phone\nfrom pat\njoin patients p on p.id = pat.patient_id;",
    "select count(distinct u.id) filter (where u.is_active and not u.is_shared_resource) as staff\nfrom users u;",
    "select to_char(l.opens_at, 'HH24:MI') as opens_at, coalesce(to_char(l.midday_closed_to, 'HH24:MI'), '(none)') as midday_closed_to\nfrom locations l;",
    "select l.slot_granularity_min, count(distinct sl.user_id) as staff\nfrom locations l\nleft join staff_locations sl on sl.location_id = l.id\ngroup by 1;",
  ];
  for (const sql of green) assert.deepEqual(printedProblems(sql), [], `refused: ${sql}`);
});

test("the one stored name it prints is a location's, and a location's address and phone print only as yes or no", () => {
  const code = codeOf(SQL);
  // Seven printed lists carry it (A, H1, H3a, H3b, H3c, H3d, H4), and the five
  // per-location lists that aggregate also group by it. Nothing else names it.
  assert.equal(code.split("l.name as location_name,").length - 1, 7);
  assert.equal(code.split("l.id, l.name, l.is_active").length - 1, 5);
  assert.equal(code.split("l.name").length - 1, 12, "a location's name is used somewhere that is neither");
  assert.equal(code.split("then 'no' else 'yes' end as address_present").length - 1, 2);
  assert.equal(code.split("case when coalesce(btrim(l.address), '') = '' then 'no' else 'yes' end as address_present").length - 1, 2);
  assert.equal(code.split("case when coalesce(btrim(l.phone), '') = '' then 'no' else 'yes' end as phone_present").length - 1, 2);
  assert.equal(code.split("l.address").length - 1, 2, "a location's address is read outside the yes or no test");
  assert.equal(code.split("l.phone").length - 1, 2, "a location's phone is read outside the yes or no test");
  for (const col of ["full_name", "first_name", "last_name", "date_of_birth", "nif", "notes", "provider_message_id", "ip", "job_title", "color"]) {
    assert.doesNotMatch(code, new RegExp(`\\.${col}\\b`), `${col} is read`);
  }
  // A staff user is counted, never described: no column of `users` but these five is read.
  const userColumns = [...new Set([...code.matchAll(/\bu\.([a-z_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(userColumns, ["id", "is_active", "is_bookable", "is_shared_resource", "role_id"]);
  const patientColumns = [...new Set([...code.matchAll(/\bp\.([a-z_0-9]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(patientColumns, ["deleted_at", "email", "id", "phone", "phone_e164", "reminder_email_enabled", "reminder_sms_enabled"]);
  assert.deepEqual(bindingProblems(SQL), []);
  assert.doesNotMatch(code, /\br\.name\b/, "a role's free-text name is read");
});

test("a door label is built from fixed strings only, and the six readings of the audit log are the same text", () => {
  const code = codeOf(SQL);
  const cases = [...code.matchAll(/\n( +case\n[\s\S]*?\n +end) as door\n/g)].map((m) => m[1]);
  assert.equal(cases.length, 6, "the door CASE is not read six times (C2, C2b, C3, D1, D2, F)");
  assert.equal(new Set(cases).size, 1, "the door CASE differs between sections");
  const { masked } = mask(cases[0]);
  assert.equal(isLiteralCase(squash(masked)), true, "a door label is not a fixed string");
  assert.equal(code.split(" as door").length - 1, 7, "an eighth definition of door");
  assert.match(code, /select coalesce\(acc\.door, '0 not an acceptance: every other audit row on an online request \(the comparand\)'\) as door,/);
  // The window's accepted set is the same text in C2, D1, D2 and F.
  const acc = [...code.matchAll(/with acc as \(\n([\s\S]*?)\n\)/g)].map((m) => m[1]);
  assert.equal(acc.length, 4);
  assert.equal(new Set(acc).size, 1, "the accepted set differs between sections");
  for (const door of ["via' = 'portal_request_confirm'", "'fromStatus' = 'scheduled' and al.metadata ->> 'toStatus' = 'confirmed'", "al.action = 'appointment.sms_reply_reviewed'", "al.action = 'appointment.patient_sms_reply'", "al.action = 'appointment.confirm.sms_code'"]) {
    assert.ok(cases[0].includes(door), `the door CASE does not read ${door}`);
  }
});

test("it reads the tenant switches as parseTenantConfig does, and the window is one expression", () => {
  const code = codeOf(SQL);
  assert.match(code, /case when t\.settings #> '\{reminders,emailEnabled\}' = 'false'::jsonb then 'false' else 'true' end as email_enabled,/);
  assert.match(code, /case when t\.settings #> '\{reminders,smsEnabled\}' = 'false'::jsonb then 'false' else 'true' end as sms_enabled,/);
  const intervals = [...code.matchAll(/interval '([^']*)'/g)].map((m) => m[1]);
  assert.ok(intervals.length >= 10);
  assert.deepEqual([...new Set(intervals)], ["30 days"]);
  assert.equal(code.split("now() - interval '30 days'").length - 1, intervals.length, "an interval that is not the window");
});

test("the confirmation rows are printed beside every other template, and a zero has its base", () => {
  const code = codeOf(SQL);
  assert.equal(code.split("and d.template_id like 'confirmation.%'").length - 1, 1, "E1 is not the one confirmation-only listing");
  assert.match(code, /count\(\*\) as all_rows_in_window,\n +count\(\*\) filter \(where d\.template_id like 'confirmation\.%'\) as confirmation_rows_in_window,/);
  assert.match(code, /as with_a_row_of_any_template\n/);
  assert.match(code, /select 'ALL DOORS \(distinct requests\)',/);
  assert.match(code, /select 'reminder_dispatches' as rows_of,\n +count\(\*\) as total_rows,/);
});

test("section H: every location with its hours, staff per role by number of locations, and each per-location count beside its base", () => {
  const code = codeOf(SQL);
  const h = code.slice(code.indexOf("to_char(l.opens_at, 'HH24:MI') as opens_at"));
  assert.ok(h.length > 0 && h.length < code.length);
  // H1 lists EVERY location: no statement of section H filters on l.is_active.
  assert.doesNotMatch(h, /where l\.is_active/);
  assert.equal(code.split("\nwhere l.is_active\n").length - 1, 1, "only section A is active-only");
  for (const col of ["to_char(l.opens_at, 'HH24:MI') as opens_at", "to_char(l.closes_at, 'HH24:MI') as closes_at", "coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '(none)') as midday_closed_from", "coalesce(to_char(l.midday_closed_to, 'HH24:MI'), '(none)') as midday_closed_to", "l.slot_granularity_min,"]) {
    assert.equal(code.split(col).length - 1, 1, `H1 does not print ${col} once`);
  }
  assert.equal(code.split("case when l.is_active then 'yes' else 'no' end as active,").length - 1, 6, "H1, H3a to H3d and H4 each say whether the location is active");
  // H2: the role key through its shield, the no-row count, and 1, 2, 3 or more.
  assert.match(h, /\(select count\(\*\) from staff_locations sl where sl\.user_id = u\.id\) as n_locations/);
  for (const [n, name] of [["= 0", "with_no_staff_locations_row"], ["= 1", "with_1_location"], ["= 2", "with_2_locations"], [">= 3", "with_3_or_more_locations"]]) {
    assert.ok(h.includes(`count(*) filter (where staff.is_active and staff.n_locations ${n}) as ${name},`), `H2 does not count ${name}`);
  }
  assert.ok(h.includes("count(*) filter (where staff.is_active) as active_staff,"));
  assert.ok(h.includes("count(*) filter (where not staff.is_active) as inactive_staff"));
  assert.equal(code.split("r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end as role,").length - 1, 2);
  // H3 and H4: the five tables, each joined on the location.
  for (const join of ["left join staff_locations sl on sl.location_id = l.id", "left join availability_templates av on av.location_id = l.id", "left join service_location_prices sp on sp.location_id = l.id", "left join service_pack_location_prices pp on pp.location_id = l.id", "left join presence on presence.location_id = l.id", "left join appointments a on a.location_id = l.id"]) {
    assert.equal(h.split(join).length - 1, 1, `section H does not read: ${join}`);
  }
  // A shared resource (users.is_shared_resource) is a room or a machine: its own
  // row in H2 and H3a, its own column in H3b and H3d, outside every staff count.
  assert.ok(h.includes("select case when staff.is_shared_resource then '(shared resource, not staff)' when r.slug is null then '(no role)'"));
  assert.ok(h.includes("case when sl.id is null then '(no staff_locations row)' when u.is_shared_resource then '(shared resource, not staff)' when r.slug is null then '(no role)'"));
  assert.ok(h.includes("         u.is_bookable,\n         u.is_shared_resource,\n"));
  assert.ok(h.includes("count(distinct av.user_id) filter (where av.is_active and not u.is_shared_resource) as distinct_therapists_with_active_hours,"));
  assert.ok(h.includes("count(distinct av.user_id) filter (where av.is_active and u.is_shared_resource) as shared_resources_with_active_hours"));
  assert.ok(h.includes("left join availability_templates av on av.location_id = l.id\nleft join users u on u.id = av.user_id"));
  assert.ok(h.includes("count(distinct u.id) filter (where u.is_active and u.is_bookable and not u.is_shared_resource) as bookable_users_with_membership_or_hours,"));
  assert.ok(h.includes("count(distinct u.id) filter (where u.is_shared_resource) as shared_resources_with_membership_or_hours,"));
  assert.ok(h.includes("count(a.id) filter (where a.origin = 'patient_portal' and a.created_at >= now() - interval '30 days') as online_requests_created_in_window,"));
  assert.ok(h.includes("count(a.id) as all_at_any_time"));
  // Each remaining count of section H, as written: what it counts and what it is filtered on.
  for (const line of [
    "count(*) filter (where staff.is_active and staff.is_bookable) as of_active_bookable,",
    "count(sl.id) as staff_locations_rows,",
    "count(sl.id) filter (where u.is_active) as of_active_users",
    "count(av.id) as template_rows,",
    "count(av.id) filter (where av.is_active) as active_template_rows,",
    "count(av.id) filter (where av.is_active and coalesce(av.valid_from, current_date) <= current_date and coalesce(av.valid_until, current_date) >= current_date) as active_and_valid_today,",
    "count(distinct sp.id) as service_price_rows,",
    "count(distinct sp.id) filter (where sp.is_active) as active_service_price_rows,",
    "count(distinct pp.id) as pack_price_rows,",
    "count(distinct pp.id) filter (where pp.is_active) as active_pack_price_rows",
    "select sl.location_id, sl.user_id, true as by_membership, false as by_hours\n  from staff_locations sl\n  union all\n  select av.location_id, av.user_id, false, true\n  from availability_templates av\n  where av.is_active\n)",
    "count(distinct u.id) filter (where u.is_active and u.is_bookable and not u.is_shared_resource and presence.by_membership) as of_those_by_membership,",
    "count(distinct u.id) filter (where u.is_active and u.is_bookable and not u.is_shared_resource and presence.by_hours) as of_those_by_active_hours,",
    "count(distinct u.id) as all_rows_of_users_with_membership_or_hours",
    "count(a.id) filter (where a.origin <> 'patient_portal' and a.created_at >= now() - interval '30 days') as staff_appointments_created_in_window,",
    "count(a.id) filter (where a.created_at >= now() - interval '30 days') as all_created_in_window,",
    "left join users u on u.id = sl.user_id\nleft join roles r on r.id = u.role_id",
    "left join users u on u.id = presence.user_id",
    "from staff\nleft join roles r on r.id = staff.role_id",
  ]) {
    assert.equal(h.split(line).length - 1, 1, `section H does not hold once: ${line}`);
  }
});

test("C2b measures the origin the other sections presuppose, and C3 keeps a visible drawer move apart from the unseen door", () => {
  const code = codeOf(SQL);
  // C2, D1, D2 and F read online requests only: the accepted set filters on origin.
  assert.equal(code.split("    and al.created_at >= now() - interval '30 days'\n    and a.origin = 'patient_portal'\n)").length - 1, 4);
  // C2b reads the same doors with NO origin filter, and splits by origin.
  const c2b = code.slice(code.indexOf("with acc_all_origins as ("), code.indexOf("with acc_of_window_requests as ("));
  assert.ok(c2b.length > 0);
  assert.doesNotMatch(c2b.slice(0, c2b.indexOf("\n)\n")), /a\.origin = 'patient_portal'\n/, "C2b filters on origin");
  for (const line of [
    "a.origin = 'patient_portal' as is_online_request,",
    "exists (select 1 from staff_notifications n where n.appointment_id = a.id and n.kind = 'appointment_request') as has_request_notification,",
    "  where al.entity_type = 'appointment'\n    and al.created_at >= now() - interval '30 days'\n)",
    "count(*) filter (where acc_all_origins.is_online_request) as audit_rows_origin_patient_portal,",
    "count(*) filter (where not acc_all_origins.is_online_request) as audit_rows_origin_staff,",
    "count(distinct acc_all_origins.appointment_id) filter (where acc_all_origins.is_online_request) as distinct_online_requests,",
    "count(distinct acc_all_origins.appointment_id) filter (where not acc_all_origins.is_online_request) as distinct_staff_origin_appointments,",
    "count(distinct acc_all_origins.appointment_id) filter (where not acc_all_origins.is_online_request and acc_all_origins.has_request_notification) as staff_origin_with_a_request_notification,",
    "count(distinct acc_all_origins.appointment_id) filter (where acc_all_origins.is_online_request and not acc_all_origins.has_request_notification) as online_requests_with_no_request_notification",
    "from acc_all_origins\nwhere acc_all_origins.door is not null\ngroup by 1",
  ]) {
    assert.equal(c2b.split(line).length - 1, 1, `C2b does not hold once: ${line}`);
  }
  // C3: three counts that add up to the first, and a NULL reads as false, never as a row dropped.
  const c3 = code.slice(code.indexOf("with acc_of_window_requests as ("), code.indexOf("from guest_booking_requests g"));
  for (const line of [
    "(al.action = 'appointment.update' and al.metadata ->> 'fromStatus' = 'scheduled' and al.metadata ->> 'toStatus' in ('completed', 'no_show')) as straight_to_final,",
    "bool_or(x.door is not null) as accepted,",
    "bool_or(x.straight_to_final) as straight_to_final",
    "select count(*) as now_confirmed_completed_or_no_show,",
    "count(*) filter (where coalesce(seen.accepted, false)) as with_an_acceptance_row,",
    "count(*) filter (where not coalesce(seen.accepted, false) and coalesce(seen.straight_to_final, false)) as drawer_straight_to_completed_or_no_show_and_no_acceptance_row,",
    "count(*) filter (where not coalesce(seen.accepted, false) and not coalesce(seen.straight_to_final, false)) as neither_which_is_the_unseen_door",
    "from appointments a\nleft join seen on seen.appointment_id = a.id\nwhere a.origin = 'patient_portal'\n  and a.created_at >= now() - interval '30 days'\n  and a.status in ('confirmed', 'completed', 'no_show')",
    "    and a.origin = 'patient_portal'\n    and a.created_at >= now() - interval '30 days'\n),\nseen as (",
  ]) {
    assert.equal(c3.split(line).length - 1, 1, `C3 does not hold once: ${line}`);
  }
});
