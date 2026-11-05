// PACK PAYMENTS: THE CENSUS THAT KEEPS PACK MONEY OUT OF INVOICING.
//
// Strategy's ruling B4 (2026-11-05): "Pack payments must reconcile with Stylus
// ruling S2 and never touch an invoices table." Stylus ruling S2 excludes pacote
// sales and pacote sessions from anything posted to Stylus automatically, and
// the posting design (docs/design/DESIGN-stylus-invoicing.md, 4.1) reads the
// `invoices` table as its input. The owner's P7 (2026-11-05): pack money stays
// out of Faturação and the Painel.
//
// A RULE THAT LIVES IN PROSE IS KEPT BY WHOEVER REMEMBERS IT, so it is pinned
// here, by reading every source file, in four parts:
//
//   1. NO FILE THAT READS THE PAYMENT TABLE WRITES `invoices`. A file that names
//      `pack_instance_payments` (or its drizzle name `packInstancePayments`) in
//      code may not insert, update or delete an `invoices` row, by drizzle or by
//      SQL. That is the shape a "record the pacote payment as an invoice too"
//      change would take.
//   2. THE REVENUE READERS NEVER READ THE PAYMENT TABLE. Faturação's and the
//      Painel's figures come from lib/invoices and lib/statistics; no file there,
//      and no page under app/invoicing or app/estatisticas, names it (P7).
//   3. THE STYLUS POSTING MODULE NEVER READS IT. No such module exists yet; the
//      rule is written now so it holds from that module's first commit: no file
//      whose path names Stylus, and nothing under an integrations folder, names
//      the payment table (S2's exclusion of pacote sales, in code).
//   4. EACH PREDICATE FIRES ON A PLANTED OFFENDER, and the census finds the real
//      readers, so a green run is not a predicate that matches nothing.
//
// Comments are stripped before every match: the reasoning above names both
// tables in prose, as do the files it guards.
//
// Run: pnpm test:scripts (node --test), in the REQUIRED quality job.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/^\s*--.*$/gm, " ");

const SKIP = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage"]);

function sources() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e) || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js|sql)$/.test(e)) out.push(full);
    }
  };
  walk(join(ROOT, "apps"));
  walk(join(ROOT, "packages"));
  return out;
}

const rel = (f) => f.slice(ROOT.length + 1);

/** Names the payment table in code. */
export const READS_PAYMENTS = /\bpack_instance_payments\b|\bpackInstancePayments\b/;

/** Writes an invoices row, by drizzle or by SQL. */
export const WRITES_INVOICES =
  /\.(insert|update|delete)\(\s*invoices\b|\b(insert\s+into|update|delete\s+from)\s+(only\s+)?("?public"?\.)?"?invoices"?(\s|\(|$)/i;

const FILES = sources().map((f) => ({ path: rel(f), code: stripComments(readFileSync(f, "utf8")) }));

test("1. no file that reads pack_instance_payments writes the invoices table", () => {
  const offenders = FILES.filter((f) => READS_PAYMENTS.test(f.code) && WRITES_INVOICES.test(f.code)).map((f) => f.path);
  assert.deepEqual(offenders, [], `pack money must never touch invoices (ruling B4). These files do both:\n  ${offenders.join("\n  ")}`);
});

const REVENUE_READERS = [
  "apps/web/lib/statistics/kpi-queries.ts",
  "apps/web/lib/statistics/queries.ts",
  "apps/web/lib/invoices/queries.ts",
];
const REVENUE_DIRS = ["apps/web/lib/statistics/", "apps/web/lib/invoices/", "apps/web/app/invoicing/", "apps/web/app/estatisticas/"];

test("2. the revenue readers exist and never read the payment table (P7: out of Faturação and the Painel)", () => {
  for (const p of REVENUE_READERS) {
    assert.ok(FILES.some((f) => f.path === p), `${p} is gone: this census must be pointed at the file that replaced it`);
  }
  const offenders = FILES.filter((f) => REVENUE_DIRS.some((d) => f.path.startsWith(d)) && READS_PAYMENTS.test(f.code)).map(
    (f) => f.path,
  );
  assert.deepEqual(offenders, [], `pack money is not invoiced revenue (P7). These revenue files read it:\n  ${offenders.join("\n  ")}`);
  // Non-vacuous: the revenue directories hold files, and the readers read invoices.
  assert.ok(FILES.filter((f) => REVENUE_DIRS.some((d) => f.path.startsWith(d))).length >= 10);
  assert.ok(FILES.some((f) => f.path === "apps/web/lib/invoices/queries.ts" && /\binvoices\b/.test(f.code)));
});

/** The Stylus posting module, wherever it lands: a path naming Stylus, or an integrations folder. */
export const IS_POSTING_PATH = (p) => /stylus/i.test(p) || /(^|\/)integrations\//.test(p);

test("3. no Stylus posting or integration file reads the payment table (S2)", () => {
  const offenders = FILES.filter((f) => IS_POSTING_PATH(f.path) && READS_PAYMENTS.test(f.code)).map((f) => f.path);
  assert.deepEqual(offenders, [], `S2 excludes pacote sales from Stylus posting. These files read pack money:\n  ${offenders.join("\n  ")}`);
  // Non-vacuous: the integrations folders the rule covers exist today.
  assert.ok(FILES.some((f) => IS_POSTING_PATH(f.path)), "no integration file found: the rule would match nothing");
});

test("4a. every predicate fires on a planted offender, and stays quiet on a clean one", () => {
  // Writes to invoices, each form.
  for (const bad of [
    "await tx.insert(invoices).values({})",
    "tx.update( invoices ).set({ status: 'paid' })",
    "await tx.delete(invoices)",
    "insert into invoices (id) values ($1)",
    'INSERT INTO public."invoices" (id) VALUES ($1)',
    "update public.invoices set status = 'paid'",
    "DELETE FROM invoices WHERE id = $1",
  ]) {
    assert.ok(WRITES_INVOICES.test(bad), `not caught: ${bad}`);
  }
  // Reads of invoices, and other tables, are not writes.
  for (const ok of [
    "select * from invoices",
    "tx.select().from(invoices)",
    "update invoices_audit set x = 1",
    "insert into pack_instance_payments (id) values ($1)",
  ]) {
    assert.ok(!WRITES_INVOICES.test(ok), `false positive: ${ok}`);
  }
  assert.ok(READS_PAYMENTS.test("from pack_instance_payments l"));
  assert.ok(READS_PAYMENTS.test("tx.insert(packInstancePayments)"));
  assert.ok(!READS_PAYMENTS.test("pack_instance_paymentsx"));
  assert.ok(IS_POSTING_PATH("apps/web/lib/stylus/post-visit.ts"));
  assert.ok(IS_POSTING_PATH("packages/integrations/src/stylus.ts"));
  assert.ok(!IS_POSTING_PATH("apps/web/lib/packs/payments-read.ts"));
  // Comments are stripped, so prose naming both tables is not an offender...
  const prose = stripComments("// never tx.insert(invoices) here\n/* pack_instance_payments */\nconst a = 1;");
  assert.ok(!WRITES_INVOICES.test(prose) && !READS_PAYMENTS.test(prose));
  // ...but a URL in code survives the stripping.
  assert.ok(stripComments('const u = "https://x.invalid/a";').includes("https://x.invalid/a"));
});

test("4b. the census finds the real readers of the payment table", () => {
  const readers = FILES.filter((f) => READS_PAYMENTS.test(f.code)).map((f) => f.path);
  for (const p of [
    "packages/db/src/schema.ts",
    "apps/web/lib/packs/payments-read.ts",
    "apps/web/lib/packs/payments-write.ts",
    "packages/db/migrations-pending/NEXT-AFTER-0114_pack_payments.sql",
  ]) {
    assert.ok(readers.includes(p), `${p} reads the payment table but the census did not see it`);
  }
});
