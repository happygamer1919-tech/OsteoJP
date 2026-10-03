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
// WHAT THE PRINTED-EXPRESSION CHECK IS, AND IS NOT. It reads the select list of
// every statement that prints (a `select` outside every parenthesis) and refuses
// any expression that is not on a closed list of shapes. It is a tripwire with
// its own red arms below, not a proof: a reviewer still reads the twenty-five
// printed lists.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "scripts/db/measure-book-confirm.sql";
const SQL = readFileSync(join(ROOT, FILE), "utf8");

/** The SQL with comments and psql meta-commands removed. */
const codeOf = (sql) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l) && !/^\s*\\/.test(l))
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

/** Every string literal replaced by a numbered placeholder, and the literals. */
function mask(code) {
  const literals = [];
  const masked = code.replace(/'(?:[^']|'')*'/g, (m) => {
    literals.push(m);
    return `§${literals.length - 1}§`;
  });
  return { masked, literals };
}
const unmask = (s, literals) => s.replace(/§(\d+)§/g, (_, i) => literals[Number(i)]);
const squash = (s) => s.replace(/\s+/g, " ").trim();

/** No code line begins with a writing verb, and no string holds a writing statement. */
export function writeProblems(sql) {
  const problems = [];
  const code = codeOf(sql);
  for (const line of code.split("\n")) {
    const t = line.trim();
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|SET|RESET|DO|BEGIN|ROLLBACK)\b/i.test(t)) {
      problems.push(`a statement that writes or changes the session: ${t.slice(0, 80)}`);
    }
    for (const m of t.matchAll(/'([^']*)'/g)) {
      if (/^\s*(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET|TRUNCATE\s|MERGE\s+INTO|COPY\s|GRANT\s|REVOKE\s)/i.test(m[1])) {
        problems.push(`a writing statement in a string: '${m[1].slice(0, 60)}'`);
      }
    }
  }
  // Outside every string: each statement starts with SELECT or WITH, and no
  // writing or locking word, and no function with a side effect, appears at all.
  const { masked } = mask(code);
  for (const stmt of masked.split(";").map((s) => s.trim()).filter(Boolean)) {
    if (!/^(select|with)\b/i.test(stmt)) problems.push(`a statement that is not a SELECT: ${squash(stmt).slice(0, 80)}`);
    const word = stmt.match(/\b(insert|update|delete|merge|truncate|into|share|nextval|setval|set_config|pg_advisory\w*|pg_sleep|pg_terminate_backend|pg_cancel_backend|dblink\w*|lo_\w+|copy)\b/i);
    if (word) problems.push(`a writing, locking or side-effect word outside a string: ${word[1]}`);
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
  "case when r.slug is null then '(no role)' when r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end",
  "case when sl.id is null then '(no staff_locations row)' when r.slug is null then '(no role)' when r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end",
]);

// A timestamp is printed only as a Lisbon calendar date.
const DATE = /^to_char\((?:(?:min|max)\((?:d|al)\.created_at\)|now\(\)|\(now\(\) - interval '30 days'\)) at time zone 'Europe\/Lisbon', 'YYYY-MM-DD'\)$/;

// A clinic's hours: a LOCATION's four time columns, as HH:MM. No other time prints.
const HOURS = /^(?:to_char\(l\.(?:opens_at|closes_at), 'HH24:MI'\)|coalesce\(to_char\(l\.(?:midday_closed_from|midday_closed_to), 'HH24:MI'\), '\(none\)'\))$/;

/** True when `expr` (masked) is `count( ... )` with nothing after it but a FILTER. */
function isCount(expr) {
  if (!/^count\(/i.test(expr)) return false;
  let depth = 0;
  for (let i = 5; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    if (expr[i] === ")") {
      depth--;
      if (depth === 0) {
        const rest = expr.slice(i + 1).trim();
        return rest === "" || (/^filter \(/i.test(rest) && rest.endsWith(")"));
      }
    }
  }
  return false;
}

/** True when every THEN and ELSE of a single, un-nested CASE yields a string literal. */
function isLiteralCase(expr) {
  if (!/^case\b/i.test(expr) || !/\bend$/i.test(expr)) return false;
  if ((expr.match(/\bcase\b/gi) ?? []).length !== 1) return false;
  const results = [...expr.matchAll(/\b(?:then|else)\s+(.*?)(?=\s+(?:when|else|end)\b)/gi)].map((m) => m[1]);
  return results.length > 0 && results.every((r) => /^§\d+§$/.test(r));
}

/** Every printed expression that is not on the closed list of shapes. */
export function printedProblems(sql) {
  const { masked, literals } = mask(codeOf(sql));
  const problems = [];
  for (const list of printedLists(masked)) {
    for (const e of expressionsOf(list)) {
      const plain = unmask(e, literals);
      const ok =
        /^§\d+§$/.test(e) ||
        isCount(e) ||
        isLiteralCase(e) ||
        BARE.has(plain) ||
        SHIELDS.has(plain) ||
        DATE.test(plain) ||
        HOURS.test(plain);
      if (!ok) problems.push(plain.slice(0, 140));
    }
  }
  return problems;
}

test("the measurement writes nothing and opens or ends no transaction of its own", () => {
  assert.deepEqual(writeProblems(SQL), []);
});

test("CONTROL: the write check is red on a writing line, a writing string, a BEGIN, a ROLLBACK, a SET, a locking read and a writing CTE", () => {
  assert.equal(writeProblems("delete from reminder_dispatches;").length >= 1, true);
  assert.equal(writeProblems("select 'update patients set email = null';").length, 1);
  assert.equal(writeProblems("begin read only;").length >= 1, true);
  assert.equal(writeProblems("rollback;").length >= 1, true);
  assert.equal(writeProblems("set local statement_timeout = '60s';").length >= 1, true);
  assert.equal(writeProblems("select count(*)\nfrom patients p\nfor update;").length, 1);
  assert.equal(writeProblems("with w as (\n  update patients set email = null returning 1\n)\nselect count(*)\nfrom w;").length >= 1, true);
  assert.equal(writeProblems("with w as (delete from patients returning 1)\nselect count(*)\nfrom w;").length, 1);
  assert.equal(writeProblems("select count(*) into t2\nfrom patients p;").length, 1);
  assert.equal(writeProblems("-- delete in a comment\nselect count(*)\nfrom patients p\nwhere p.deleted_at is null;").length, 0);
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
  // 23 statements (16 in sections 0 to G, 7 in H); F and G each print through
  // two selects joined by UNION ALL.
  assert.equal(masked.split(";").filter((s) => s.trim() !== "").length, 23);
  assert.equal(lists.length, 25, `expected 25 printed select lists, found ${lists.length}`);
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
    "with c as (\n  select p.email\n  from patients p\n)\nselect count(*)\nfrom c;",
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
  // A staff user is counted, never described: no column of `users` but these four is read.
  const userColumns = [...new Set([...code.matchAll(/\bu\.([a-z_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(userColumns, ["id", "is_active", "is_bookable", "role_id"]);
  assert.doesNotMatch(code, /\br\.name\b/, "a role's free-text name is read");
});

test("a door label is built from fixed strings only, and the five readings of the audit log are the same text", () => {
  const code = codeOf(SQL);
  const cases = [...code.matchAll(/\n( +case\n[\s\S]*?\n +end) as door\n/g)].map((m) => m[1]);
  assert.equal(cases.length, 5, "the door CASE is not read five times (C2, C3, D1, D2, F)");
  assert.equal(new Set(cases).size, 1, "the door CASE differs between sections");
  const { masked } = mask(cases[0]);
  assert.equal(isLiteralCase(squash(masked)), true, "a door label is not a fixed string");
  assert.equal(code.split(" as door").length - 1, 6, "a sixth and seventh definition of door");
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
  assert.ok(h.includes("count(distinct av.user_id) filter (where av.is_active) as distinct_therapists_with_active_hours"));
  assert.ok(h.includes("count(distinct u.id) filter (where u.is_active and u.is_bookable) as bookable_users_with_membership_or_hours,"));
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
    "count(distinct u.id) filter (where u.is_active and u.is_bookable and presence.by_membership) as of_those_by_membership,",
    "count(distinct u.id) filter (where u.is_active and u.is_bookable and presence.by_hours) as of_those_by_active_hours,",
    "count(distinct u.id) as all_users_with_membership_or_hours",
    "count(a.id) filter (where a.origin <> 'patient_portal' and a.created_at >= now() - interval '30 days') as staff_appointments_created_in_window,",
    "count(a.id) filter (where a.created_at >= now() - interval '30 days') as all_created_in_window,",
    "left join users u on u.id = sl.user_id\nleft join roles r on r.id = u.role_id",
    "left join users u on u.id = presence.user_id",
    "from staff\nleft join roles r on r.id = staff.role_id",
  ]) {
    assert.equal(h.split(line).length - 1, 1, `section H does not hold once: ${line}`);
  }
});
