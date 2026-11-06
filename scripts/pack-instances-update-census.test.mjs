// THE CENSUS OF EVERY WRITER THAT UPDATES patient_pack_instances.
//
// Strategy, 2026-11-06, on pack payments (0115, PR #1732): before its READY
// line the item needs a census of every writer that UPDATEs
// `patient_pack_instances` as `authenticated` (or as any role a request runs
// as), and a test that fails when a new one appears that the census does not
// name. The ruling was written against round 1, whose migration revoked 0037's
// table-level UPDATE from `authenticated`. Round 2 moved the agreed price to
// its own insert-only table and dropped that revoke, so today 0115 breaks no
// writer. The census stays, because the question it answers ("who writes this
// row, as whom") is asked again by any future revoke, column grant or policy on
// the table, and an answer that lives in a PR body goes stale silently.
//
// WHAT COUNTS AS AN UPDATE WRITER, read from code with comments stripped:
//   1. a drizzle `.update(patientPackInstances)`;
//   2. an SQL `UPDATE [ONLY] [public.]patient_pack_instances` (raw SQL in
//      TypeScript, a migration, a function body, an owner-run script);
//   3. a supabase-js `.from("patient_pack_instances")` chain that calls
//      `.update(` or `.upsert(`;
//   4. an upsert: `.insert(patientPackInstances)` with `.onConflictDoUpdate(`,
//      or `INSERT INTO patient_pack_instances ... ON CONFLICT ... DO UPDATE`;
//   5. a row lock (`FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, `FOR KEY
//      SHARE`, or drizzle `.for(`) on a read of the table: Postgres requires
//      UPDATE privilege for those, so a future UPDATE revoke would break them;
//   6. a trigger created ON the table (it runs on every write).
// The live database is asked the same question in
// packages/db/tests/pack-instance-payments.db.test.ts: no user trigger on the
// table, no function body that UPDATEs it, no foreign key action that rewrites
// it.
//
// WHERE: apps/, packages/, supabase/ and scripts/, every .ts, .tsx, .mjs, .js
// and .sql file. NOT tests (`*.test.*`, `tests/`, `e2e/`, `fixtures/`): a test
// is not a request path, and its fixtures run as the owning connection.
//
// THE CENSUS BELOW IS EXACT, both ways: a writer the census does not name
// fails, and a census entry with no writer behind it fails too, so the list
// cannot rot into a superset.
//
// Run: pnpm test:scripts (node --test), in the REQUIRED quality job.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * file -> { count, role, columns, why }. `count` is how many writes the
 * detector finds in the file; the other fields are the census row.
 */
export const CENSUS = Object.freeze({
  "packages/db/migrations/0067_followup_packs_and_provenance.sql": {
    count: 1,
    role: "the migration role (postgres), once, at 0067's apply; never a request",
    columns: ["legacy_consumed"],
    why: "the one-time backfill legacy_consumed = sessions_total - sessions_remaining; 0115 does not touch it",
  },
  "supabase/migrations/0067_followup_packs_and_provenance.sql": {
    count: 1,
    role: "the migration role (postgres), the byte mirror of the file above",
    columns: ["legacy_consumed"],
    why: "the mirror CI and the lanes apply; same statement",
  },
});

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/^\s*--.*$/gm, " ")
    .replace(/([^-])--[^\n'"]*$/gm, "$1 ");

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage", "tests", "e2e", "fixtures"]);

const isTestFile = (name) => /\.test\.|\.spec\./.test(name);

/** Every non-test source file under the searched roots, repo-relative. */
function sources(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e) || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js|sql)$/.test(e) && !isTestFile(e)) out.push(full.slice(root.length + 1));
    }
  };
  for (const d of ["apps", "packages", "supabase", "scripts"]) walk(join(root, d));
  return out.sort();
}

// The table, in SQL: optional schema, optional quotes.
const T = String.raw`(?:"?public"?\s*\.\s*)?"?patient_pack_instances"?\b`;

/** Each detector is global so every occurrence in a file is counted. */
export const DETECTORS = Object.freeze([
  ["drizzle update", /\.update\(\s*patientPackInstances\b/g],
  ["sql update", new RegExp(String.raw`\bupdate\s+(?:only\s+)?${T}`, "gi")],
  ["supabase-js update or upsert", /\.from\(\s*["'`]patient_pack_instances["'`]\s*\)[^;]{0,400}?\.(?:update|upsert)\(/g],
  ["drizzle upsert", /\.insert\(\s*patientPackInstances\b[^;]{0,400}?\.onConflictDoUpdate\(/g],
  ["sql upsert", new RegExp(String.raw`\binsert\s+into\s+${T}[^;]{0,2000}?\bon\s+conflict\b[^;]{0,400}?\bdo\s+update\b`, "gi")],
  ["drizzle row lock", /\.from\(\s*patientPackInstances\b[^;]{0,400}?\.for\(/g],
  [
    "sql row lock",
    new RegExp(String.raw`\bfrom\s+${T}[^;\`]{0,1000}?\bfor\s+(?:no\s+key\s+update|update|key\s+share|share)\b`, "gi"),
  ],
  ["trigger on the table", new RegExp(String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\b[^;]{0,400}?\bon\s+${T}`, "gi")],
]);

/** The writes the detectors find in one source text, comments stripped. */
export function writesIn(code) {
  const src = stripComments(code);
  const hits = [];
  for (const [name, re] of DETECTORS) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) hits.push({ name, at: m.index });
  }
  return hits;
}

function census(root) {
  const found = {};
  for (const path of sources(root)) {
    const hits = writesIn(readFileSync(join(root, path), "utf8"));
    if (hits.length > 0) found[path] = hits.length;
  }
  return found;
}

test("every UPDATE writer of patient_pack_instances is in the census, and every census row has a writer", () => {
  const found = census(ROOT);
  const expected = Object.fromEntries(Object.entries(CENSUS).map(([f, r]) => [f, r.count]));
  assert.deepEqual(
    found,
    expected,
    "The UPDATE writers of patient_pack_instances changed.\n" +
      `found:    ${JSON.stringify(found, null, 2)}\n` +
      `expected: ${JSON.stringify(expected, null, 2)}\n` +
      "A NEW writer: add it to CENSUS with the role it runs as and the columns it writes, and check " +
      "whether any revoke, column grant or policy on patient_pack_instances (0037 grants authenticated " +
      "table-level UPDATE; 0115 does not change it) still lets it through. A REMOVED writer: drop its row.",
  );
});

test("no application or package code writes patient_pack_instances by UPDATE today: the census is migrations only", () => {
  for (const f of Object.keys(CENSUS)) {
    assert.match(f, /^(packages\/db|supabase)\/migrations\/\d{4}_[a-z0-9_]+\.sql$/, `${f} is not a migration`);
  }
});

test("each detector fires on a planted writer, and none fires on the clean controls", () => {
  const planted = [
    ["drizzle update", "await tx.update(patientPackInstances).set({ switchAmountCents: 1 }).where(eq(x, y));"],
    ["drizzle update", "await tx\n  .update(\n    patientPackInstances\n  )\n  .set({ switchReason: 'r' });"],
    ["sql update", "await tx`update patient_pack_instances set switch_reason = ${r} where id = ${id}`;"],
    ["sql update", 'await tx.execute(sql`UPDATE public."patient_pack_instances" SET legacy_consumed = 1`);'],
    ["sql update", "UPDATE ONLY public.patient_pack_instances\n  SET legacy_consumed = 0;"],
    ["sql update", "create function f() returns void language sql as $$ update public.patient_pack_instances set legacy_consumed = 0 $$;"],
    ["supabase-js update or upsert", 'await db.from("patient_pack_instances").update({ legacy_consumed: 1 }).eq("id", id);'],
    ["supabase-js update or upsert", "await db.from('patient_pack_instances').upsert(row);"],
    ["drizzle upsert", "await tx.insert(patientPackInstances).values(v).onConflictDoUpdate({ target: x, set: y });"],
    ["sql upsert", "insert into patient_pack_instances (id) values ($1) on conflict (id) do update set legacy_consumed = 0;"],
    ["drizzle row lock", "await tx.select().from(patientPackInstances).where(eq(a, b)).for(\"update\");"],
    ["sql row lock", "select id from public.patient_pack_instances where id = $1 for no key update;"],
    ["sql row lock", "select id from patient_pack_instances where id = $1 for share;"],
    ["trigger on the table", "CREATE TRIGGER t BEFORE UPDATE ON public.patient_pack_instances FOR EACH ROW EXECUTE FUNCTION f();"],
  ];
  for (const [want, code] of planted) {
    const names = writesIn(code).map((h) => h.name);
    assert.ok(names.includes(want), `the "${want}" detector missed:\n${code}`);
  }
  const clean = [
    "await tx.insert(patientPackInstances).values(v).returning({ id: patientPackInstances.id });",
    "await tx.select().from(patientPackInstances).where(eq(a, b));",
    "await tx.update(appointments).set({ packInstanceId: id });",
    "update appointments set pack_instance_id = null where pack_instance_id = $1;",
    "select i.id from patient_pack_instances i join appointments a on a.pack_instance_id = i.id;",
    "select 1 from appointments a for update;",
    "// await tx.update(patientPackInstances).set({ x: 1 });",
    "/* UPDATE public.patient_pack_instances SET legacy_consumed = 0; */",
    "-- update patient_pack_instances set legacy_consumed = 0;",
    "update patient_pack_instances_archive set x = 1;",
    "await tx.insert(packInstanceAgreedPrices).values(v);",
  ];
  for (const code of clean) {
    assert.deepEqual(writesIn(code), [], `a detector fired on a clean control:\n${code}`);
  }
});

test("the census reaches the real tree: the files it must read are read, and no test file is", () => {
  const files = new Set(sources(ROOT));
  for (const f of [
    "apps/web/lib/packs/instances.ts",
    "apps/web/lib/packs/sell.ts",
    "apps/web/lib/scheduling/uncancel-db.ts",
    "packages/db/migrations/0037_service_packs.sql",
    "packages/db/migrations/0108_pack_instance_consuming_sessions.sql",
    "supabase/migrations/0083_pack_switch_amount.sql",
  ]) {
    assert.ok(files.has(f), `${f} is not read by the census`);
  }
  for (const f of files) assert.ok(!isTestFile(f), `${f} is a test and must not be read`);
});
