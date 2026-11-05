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
// here, by reading every source file under apps/ and packages/:
//
//   1. NO FILE THAT READS A PACK MONEY TABLE WRITES `invoices`. A file that names
//      `pack_instance_payments` or `pack_instance_agreed_prices` (or their
//      drizzle names) in code may not insert, update or delete an `invoices`
//      row, by drizzle or by SQL.
//   2. THE REVENUE FILES NEVER READ PACK MONEY, NOR IMPORT ITS MODULES. Nothing
//      under lib/statistics, lib/invoices, app/invoicing, app/estatisticas or
//      app/dashboard (the Painel) names either table or imports
//      lib/packs/payments* (P7).
//   3. THE STYLUS POSTING MODULE NEVER DOES EITHER. It does not exist yet; the
//      rule holds from its first commit: no file whose path names Stylus, and
//      nothing under an integrations folder, names either table or imports
//      lib/packs/payments* (S2's exclusion of pacote sales, in code).
//   4. EACH RULE FIRES ON A PLANTED OFFENDER, as REAL FILES in a fixture tree
//      (scripts/fixtures/pack-payments-census/, laid out like the repository)
//      that the same census function walks, beside a clean file it must pass;
//      and the census finds the real readers, so a green run is not a predicate
//      that matches nothing.
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
const FIXTURE_ROOT = join(ROOT, "scripts", "fixtures", "pack-payments-census");

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/^\s*--.*$/gm, " ");

const SKIP = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage"]);

/** Every source file under <root>/apps and <root>/packages, repo-relative, comments stripped. */
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
      if (SKIP.has(e) || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js|sql)$/.test(e)) {
        out.push({ path: full.slice(root.length + 1), code: stripComments(readFileSync(full, "utf8")) });
      }
    }
  };
  walk(join(root, "apps"));
  walk(join(root, "packages"));
  return out;
}

/** Names a pack money table in code. */
export const READS_PACK_MONEY =
  /\bpack_instance_payments\b|\bpackInstancePayments\b|\bpack_instance_agreed_prices\b|\bpackInstanceAgreedPrices\b/;

/** Imports a pack payments module (lib/packs/payments, payments-read, payments-write, payment-actions). */
export const IMPORTS_PACK_MONEY =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'][^"']*\/?packs\/(?:payments|payment-actions)[^"']*["']|(?:\bfrom\s+|\bimport\s*\(\s*)["']\.\/(?:payments|payment-actions)[^"']*["']/;

/** Writes an invoices row, by drizzle or by SQL. */
export const WRITES_INVOICES =
  /\.(insert|update|delete)\(\s*invoices\b|\b(insert\s+into|update|delete\s+from)\s+(only\s+)?("?public"?\.)?"?invoices"?(\s|\(|$)/i;

export const REVENUE_DIRS = Object.freeze([
  "apps/web/lib/statistics/",
  "apps/web/lib/invoices/",
  "apps/web/app/invoicing/",
  "apps/web/app/estatisticas/",
  "apps/web/app/dashboard/",
]);

/** The Stylus posting module, wherever it lands: a path naming Stylus, or an integrations folder. */
export const IS_POSTING_PATH = (p) => /stylus/i.test(p) || /(^|\/)integrations\//.test(p);

/** The whole census over one tree. Each list is the offending paths, sorted. */
export function census(root) {
  const files = sources(root);
  const pick = (pred) => files.filter(pred).map((f) => f.path).sort();
  const inRevenue = (p) => REVENUE_DIRS.some((d) => p.startsWith(d));
  return {
    files,
    writesInvoices: pick((f) => READS_PACK_MONEY.test(f.code) && WRITES_INVOICES.test(f.code)),
    revenueReads: pick((f) => inRevenue(f.path) && READS_PACK_MONEY.test(f.code)),
    revenueImports: pick((f) => inRevenue(f.path) && IMPORTS_PACK_MONEY.test(f.code)),
    postingReads: pick((f) => IS_POSTING_PATH(f.path) && READS_PACK_MONEY.test(f.code)),
    postingImports: pick((f) => IS_POSTING_PATH(f.path) && IMPORTS_PACK_MONEY.test(f.code)),
  };
}

const REAL = census(ROOT);

test("1. no file that reads a pack money table writes the invoices table", () => {
  assert.deepEqual(REAL.writesInvoices, [], `pack money must never touch invoices (ruling B4):\n  ${REAL.writesInvoices.join("\n  ")}`);
});

const REVENUE_READERS = [
  "apps/web/lib/statistics/kpi-queries.ts",
  "apps/web/lib/statistics/queries.ts",
  "apps/web/lib/invoices/queries.ts",
];

test("2. the revenue files never read pack money nor import its modules (P7: out of Faturação and the Painel)", () => {
  for (const p of REVENUE_READERS) {
    assert.ok(REAL.files.some((f) => f.path === p), `${p} is gone: this census must be pointed at the file that replaced it`);
  }
  assert.deepEqual(REAL.revenueReads, [], `revenue files read pack money:\n  ${REAL.revenueReads.join("\n  ")}`);
  assert.deepEqual(REAL.revenueImports, [], `revenue files import a pack payments module:\n  ${REAL.revenueImports.join("\n  ")}`);
  // Non-vacuous: every revenue directory exists and holds files.
  for (const d of REVENUE_DIRS) assert.ok(REAL.files.some((f) => f.path.startsWith(d)), `${d} holds no file: the rule would match nothing there`);
});

test("3. no Stylus posting or integration file reads pack money or imports its modules (S2)", () => {
  assert.deepEqual(REAL.postingReads, [], `posting files read pack money:\n  ${REAL.postingReads.join("\n  ")}`);
  assert.deepEqual(REAL.postingImports, [], `posting files import a pack payments module:\n  ${REAL.postingImports.join("\n  ")}`);
  assert.ok(REAL.files.some((f) => IS_POSTING_PATH(f.path)), "no integration file found: the rule would match nothing");
});

test("4a. EACH RULE FIRES ON A PLANTED FILE: the fixture tree, walked by the same census function", () => {
  const F = census(FIXTURE_ROOT);
  // The fixture tree is what it claims to be: seven files, one of them clean.
  assert.equal(F.files.length, 7, F.files.map((f) => f.path).join(", "));
  assert.deepEqual(F.writesInvoices, ["apps/web/lib/packs/planted-writes-invoices.ts"]);
  assert.deepEqual(F.revenueReads, ["apps/web/lib/statistics/planted-reads-payments.ts"]);
  assert.deepEqual(F.revenueImports, [
    "apps/web/app/dashboard/planted-imports-payments-read.tsx",
    "apps/web/lib/invoices/planted-imports-relative.ts",
  ]);
  assert.deepEqual(F.postingReads, ["packages/integrations/src/planted-reads-agreed-prices.ts"]);
  assert.deepEqual(F.postingImports, ["apps/web/lib/stylus/planted-imports-payments-write.ts"]);
  // The clean file (prose naming both tables, a READ of invoices) offends nothing.
  const clean = "apps/web/lib/statistics/clean-control.ts";
  assert.ok(F.files.some((f) => f.path === clean));
  for (const list of [F.writesInvoices, F.revenueReads, F.revenueImports, F.postingReads, F.postingImports]) {
    assert.ok(!list.includes(clean), clean);
  }
});

test("4b. the predicates, one shape at a time", () => {
  for (const bad of [
    "await tx.insert(invoices).values({})",
    "tx.update( invoices ).set({ status: 'paid' })",
    "insert into invoices (id) values ($1)",
    'INSERT INTO public."invoices" (id) VALUES ($1)',
    "DELETE FROM invoices WHERE id = $1",
  ]) {
    assert.ok(WRITES_INVOICES.test(bad), `not caught: ${bad}`);
  }
  for (const ok of ["select * from invoices", "tx.select().from(invoices)", "update invoices_audit set x = 1"]) {
    assert.ok(!WRITES_INVOICES.test(ok), `false positive: ${ok}`);
  }
  for (const bad of [
    'import { x } from "@/lib/packs/payments";',
    'import { x } from "@/lib/packs/payments-read";',
    'import { x } from "../packs/payments-write";',
    'const m = await import("@/lib/packs/payment-actions");',
    'import "@/lib/packs/payments";',
    'export { y } from "./payments";',
  ]) {
    assert.ok(IMPORTS_PACK_MONEY.test(bad), `import not caught: ${bad}`);
  }
  for (const ok of ['import { x } from "@/lib/packs/in-use";', 'import { x } from "@/lib/invoices/payments-ledger";']) {
    assert.ok(!IMPORTS_PACK_MONEY.test(ok), `false import: ${ok}`);
  }
  assert.ok(!READS_PACK_MONEY.test("pack_instance_paymentsx"));
  assert.ok(IS_POSTING_PATH("apps/web/lib/stylus/post-visit.ts"));
  assert.ok(!IS_POSTING_PATH("apps/web/lib/packs/payments-read.ts"));
});

test("4c. the census finds the real readers of pack money", () => {
  const readers = REAL.files.filter((f) => READS_PACK_MONEY.test(f.code)).map((f) => f.path);
  for (const p of [
    "packages/db/src/schema.ts",
    "apps/web/lib/packs/payments-read.ts",
    "apps/web/lib/packs/payments-write.ts",
    "apps/web/lib/packs/sell.ts",
    "packages/db/migrations-pending/NEXT-AFTER-0114_pack_payments.sql",
  ]) {
    assert.ok(readers.includes(p), `${p} reads pack money but the census did not see it`);
  }
});
