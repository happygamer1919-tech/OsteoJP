/**
 * pack-payments-migration.test.ts: the STATIC half of the pack payments proof.
 * No database: it reads the pending file and the drizzle declaration and pins
 * what a reviewer would otherwise have to re-read by eye.
 *
 * THE DATABASE HALF is pack-instance-payments.db.test.ts, which runs only on a
 * database the file was applied to. This half runs everywhere, so a later edit
 * that loosens a policy, opens UPDATE or DELETE, reorders the column grant
 * before the table revoke, or lets the drizzle table drift from the SQL is red
 * in the ordinary `pnpm test`.
 *
 * Every assertion is on the STATEMENTS (comments stripped), not on the prose,
 * and each policy is compared WHOLE (a `toContain` per clause let an added
 * `OR true` survive, R4 2026-11-02).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { packInstancePayments, patientPackInstances } from "../src/schema";
import {
  packPaymentsSchemaPresent,
  resetPackPaymentsSchemaCache,
} from "../src/pack-payments-schema";

const PENDING_DIR = join(__dirname, "..", "migrations-pending");
const FILE = "NEXT-AFTER-0114_pack_payments.sql";
const PATH = join(PENDING_DIR, FILE);

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The statements as the applier runs them, whitespace collapsed. */
function statements(sql: string): string[] {
  return stripComments(sql)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

const text = existsSync(PATH) ? readFileSync(PATH, "utf8") : "";
const stmts = statements(text);

describe(`pending migration ${FILE}`, () => {
  it("exists, flat in migrations-pending, and is the only file claiming the payment table", () => {
    expect(existsSync(PATH)).toBe(true);
    const claimants = readdirSync(PENDING_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /create table public\.pack_instance_payments/i.test(readFileSync(join(PENDING_DIR, f), "utf8")));
    expect(claimants).toEqual([FILE]);
  });

  it("no promoted migration creates the table or the column yet (a promotion moves this file)", () => {
    const dir = join(__dirname, "..", "migrations");
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /pack_instance_payments|agreed_price_cents/.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual([]);
  });

  it("opens with the SET LOCAL lines the 0100 gate requires, in order", () => {
    expect(stmts[0]).toBe("SET LOCAL lock_timeout = '5s'");
    expect(stmts[1]).toBe("SET LOCAL statement_timeout = '60s'");
  });

  it("has no transaction control, creates no function and touches no invoices object", () => {
    for (const s of stmts) {
      expect(s).not.toMatch(/^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START TRANSACTION|SAVEPOINT)\b/i);
      expect(s).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
      expect(s).not.toMatch(/\bDROP\b/i);
      // A COMMENT's string may say what the table is NOT read by; every other
      // statement must not name the invoices table at all.
      if (!/^COMMENT ON\b/i.test(s)) expect(s).not.toMatch(/\binvoices\b/i);
    }
    // Control: the filter above is not vacuous; there are non-COMMENT statements.
    expect(stmts.filter((s) => !/^COMMENT ON\b/i.test(s)).length).toBeGreaterThan(10);
  });

  it("the column: agreed_price_cents integer, nullable, >= 0, NO default, no IF NOT EXISTS", () => {
    const add = stmts.find((s) => /^ALTER TABLE public\.patient_pack_instances ADD COLUMN/i.test(s));
    expect(add).toBe(
      "ALTER TABLE public.patient_pack_instances ADD COLUMN agreed_price_cents integer " +
        "CONSTRAINT patient_pack_instances_agreed_price_nonneg CHECK (agreed_price_cents IS NULL OR agreed_price_cents >= 0)",
    );
    for (const s of stmts.filter((x) => !/^COMMENT ON\b/i.test(x))) {
      expect(s).not.toMatch(/agreed_price_cents[^;]*\bDEFAULT\b/i);
      expect(s).not.toMatch(/IF NOT EXISTS/i);
    }
    // No backfill: nothing writes a value into an existing row.
    expect(stmts.some((s) => /^UPDATE\b/i.test(s))).toBe(false);
  });

  it("the payment table: the kinds, the signs, the methods (P9), the Stylus reference, the reason", () => {
    const create = stmts.find((s) => /^CREATE TABLE public\.pack_instance_payments/i.test(s));
    expect(create).toBeDefined();
    for (const re of [
      /tenant_id uuid NOT NULL/,
      /pack_instance_id uuid NOT NULL/,
      /location_id uuid NOT NULL/,
      /kind text NOT NULL CONSTRAINT pack_instance_payments_kind_known CHECK \(kind IN \('pagamento', 'reembolso', 'correcao'\)\)/,
      /amount_cents integer NOT NULL CONSTRAINT pack_instance_payments_amount_bounded CHECK \(amount_cents BETWEEN -10000000 AND 10000000\)/,
      /received_on date NOT NULL/,
      /CHECK \(method IS NULL OR method IN \('numerario', 'mbway', 'multibanco', 'cartao', 'transferencia', 'outro'\)\)/,
      /CHECK \(stylus_ref IS NULL OR \(btrim\(stylus_ref\) <> '' AND char_length\(stylus_ref\) <= 40\)\)/,
      /CHECK \(reason IS NULL OR btrim\(reason\) <> ''\)/,
      /CONSTRAINT pack_instance_payments_amount_sign CHECK \( \(kind = 'pagamento' AND amount_cents > 0\) OR \(kind = 'reembolso' AND amount_cents < 0\) OR \(kind = 'correcao' AND amount_cents <> 0\) \)/,
      /CONSTRAINT pack_instance_payments_method_required CHECK \(kind = 'correcao' OR method IS NOT NULL\)/,
      /CONSTRAINT pack_instance_payments_reason_required CHECK \(kind = 'pagamento' OR reason IS NOT NULL\)/,
      /CONSTRAINT pack_instance_payments_payment_answers_nothing CHECK \(kind <> 'pagamento' OR corrects_id IS NULL\)/,
      /CONSTRAINT pack_instance_payments_id_instance_uq UNIQUE \(id, pack_instance_id\)/,
    ]) {
      expect(create).toMatch(re);
    }
    // Nothing fiscal on a payment line (design note 1.5).
    expect(create).not.toMatch(/\b(nif|vat|iva|invoice|fatura|serie|series|document_type)\b/i);
  });

  it("RLS is ENABLED (not forced) on the new table before any policy", () => {
    const enable = stmts.findIndex((s) => s === "ALTER TABLE public.pack_instance_payments ENABLE ROW LEVEL SECURITY");
    const firstPolicy = stmts.findIndex((s) => /^CREATE POLICY/i.test(s));
    expect(enable).toBeGreaterThan(-1);
    expect(firstPolicy).toBeGreaterThan(enable);
    expect(stmts.some((s) => /FORCE ROW LEVEL SECURITY/i.test(s))).toBe(false);
  });

  it("the grants, exactly and in order: append only on the new table; the table UPDATE revoke BEFORE the two-column grant", () => {
    const grants = stmts.filter((s) => /^(GRANT|REVOKE)\b/i.test(s));
    expect(grants).toEqual([
      "REVOKE ALL ON TABLE public.pack_instance_payments FROM PUBLIC, anon, authenticated, patient, service_role",
      "GRANT SELECT, INSERT ON TABLE public.pack_instance_payments TO authenticated",
      // A table-level REVOKE of UPDATE drops column grants too, so the column
      // grant must come AFTER it. Swapping these two lines ends the price write.
      "REVOKE UPDATE ON TABLE public.patient_pack_instances FROM PUBLIC, anon, authenticated, patient, service_role",
      "GRANT UPDATE (agreed_price_cents, updated_at) ON TABLE public.patient_pack_instances TO authenticated",
    ]);
    // APPEND ONLY: no UPDATE, DELETE or TRUNCATE on the payment table for anyone.
    for (const g of grants.filter((x) => /^GRANT/.test(x) && /pack_instance_payments/.test(x))) {
      expect(g).not.toMatch(/UPDATE|DELETE|TRUNCATE|ALL/);
    }
  });

  it("the keys: tenant, instance and clinic NO ACTION, creator SET NULL, the composite self key", () => {
    const fk = stmts.find((s) => /ADD CONSTRAINT pack_instance_payments_tenant_id_fkey/.test(s));
    expect(fk).toBe(
      "ALTER TABLE public.pack_instance_payments " +
        "ADD CONSTRAINT pack_instance_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id), " +
        "ADD CONSTRAINT pack_instance_payments_pack_instance_id_fkey FOREIGN KEY (pack_instance_id) REFERENCES public.patient_pack_instances(id), " +
        "ADD CONSTRAINT pack_instance_payments_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id), " +
        "ADD CONSTRAINT pack_instance_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL, " +
        "ADD CONSTRAINT pack_instance_payments_corrects_fkey FOREIGN KEY (corrects_id, pack_instance_id) REFERENCES public.pack_instance_payments(id, pack_instance_id)",
    );
  });

  it("the four CREATE POLICY statements are the LAST four, and none is FOR ALL", () => {
    const last4 = stmts.slice(-4);
    expect(last4.every((s) => /^CREATE POLICY/i.test(s))).toBe(true);
    expect(stmts.filter((s) => /^CREATE POLICY/i.test(s))).toHaveLength(4);
    expect(stmts.some((s) => /FOR ALL/i.test(s))).toBe(false);
    // 0037's FOR ALL policy on the instances is left exactly as it is.
    expect(stmts.some((s) => /(ALTER|DROP) POLICY/i.test(s))).toBe(false);
  });

  it("each CREATE POLICY is exactly the reviewed statement", () => {
    const tenant = "tenant_id = (SELECT public.jwt_tenant_id())";
    const money = "(SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')";
    expect(stmts.slice(-4)).toEqual([
      `CREATE POLICY pack_instance_payments_staff_select ON public.pack_instance_payments AS PERMISSIVE FOR SELECT TO authenticated USING ( ${tenant} AND ${money} )`,
      `CREATE POLICY pack_instance_payments_staff_insert ON public.pack_instance_payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ( ${tenant} AND ${money} AND created_by = (SELECT auth.uid()) AND (kind <> 'correcao' OR (SELECT public.jwt_role()) IN ('owner', 'admin')) AND EXISTS (SELECT 1 FROM public.patient_pack_instances i WHERE i.id = pack_instance_payments.pack_instance_id AND i.tenant_id = (SELECT public.jwt_tenant_id())) AND EXISTS (SELECT 1 FROM public.locations l WHERE l.id = pack_instance_payments.location_id AND l.tenant_id = (SELECT public.jwt_tenant_id())) )`,
      `CREATE POLICY patient_pack_instances_agreed_price_set_once ON public.patient_pack_instances AS RESTRICTIVE FOR UPDATE TO authenticated USING ( agreed_price_cents IS NULL AND ${money} ) WITH CHECK ( agreed_price_cents IS NOT NULL AND ${money} )`,
      `CREATE POLICY patient_pack_instances_agreed_price_on_insert ON public.patient_pack_instances AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ( agreed_price_cents IS NULL OR ${money} )`,
    ]);
  });

  it("a therapist is named in no policy of this file (P4: therapists see no amounts)", () => {
    for (const s of stmts.filter((x) => /^CREATE POLICY/i.test(x))) expect(s).not.toMatch(/therapist/);
  });

  it("the drizzle declaration names the same columns and constraints as the SQL", () => {
    const cfg = getTableConfig(packInstancePayments);
    expect(cfg.name).toBe("pack_instance_payments");
    expect(cfg.columns.map((c) => c.name).sort()).toEqual([
      "amount_cents",
      "corrects_id",
      "created_at",
      "created_by",
      "id",
      "kind",
      "location_id",
      "method",
      "pack_instance_id",
      "reason",
      "received_on",
      "stylus_ref",
      "tenant_id",
    ]);
    const notNull = cfg.columns.filter((c) => c.notNull).map((c) => c.name).sort();
    expect(notNull).toEqual([
      "amount_cents",
      "created_at",
      "id",
      "kind",
      "location_id",
      "pack_instance_id",
      "received_on",
      "tenant_id",
    ]);
    const sqlChecks = [...text.matchAll(/CONSTRAINT (pack_instance_payments_\w+)\s+CHECK/g)].map((m) => m[1]).sort();
    expect(cfg.checks.map((c) => c.name).sort()).toEqual(sqlChecks);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["pack_instance_payments_id_instance_uq"]);
    const create = stmts.find((s) => /^CREATE TABLE public\.pack_instance_payments/i.test(s)) ?? "";
    for (const c of cfg.columns) expect(create).toMatch(new RegExp(`\\b${c.name} `));
  });

  it("agreed_price_cents is NOT declared on the drizzle instance table until after the apply", () => {
    // Drizzle names every declared column in an INSERT; a declared column the
    // database lacks would break the booking path's instance INSERT (42703).
    const cols = getTableConfig(patientPackInstances).columns.map((c) => c.name);
    expect(cols).not.toContain("agreed_price_cents");
    // Control: the same read does see a column that IS declared.
    expect(cols).toContain("switch_amount_cents");
  });
});

describe("packPaymentsSchemaPresent", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetPackPaymentsSchemaCache();
  });

  const executor = (answers: boolean[]) => {
    const calls: unknown[] = [];
    return {
      calls,
      execute: async (q: unknown) => {
        calls.push(q);
        return [{ present: answers.shift() ?? false }];
      },
    };
  };

  it("present is cached for the life of the process", async () => {
    const db = executor([true, false]);
    expect(await packPaymentsSchemaPresent(db)).toBe(true);
    expect(await packPaymentsSchemaPresent(db)).toBe(true);
    expect(db.calls).toHaveLength(1);
  });

  it("absent is re-asked after a minute, so an apply takes effect without a redeploy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T22:00:00Z"));
    const db = executor([false, true]);
    expect(await packPaymentsSchemaPresent(db)).toBe(false);
    vi.setSystemTime(new Date("2026-11-05T22:00:59Z"));
    expect(await packPaymentsSchemaPresent(db)).toBe(false);
    expect(db.calls).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-05T22:01:01Z"));
    expect(await packPaymentsSchemaPresent(db)).toBe(true);
    expect(db.calls).toHaveLength(2);
  });

  it("a missing or malformed answer reads as absent, never as present", async () => {
    expect(await packPaymentsSchemaPresent({ execute: async () => [] })).toBe(false);
    resetPackPaymentsSchemaCache();
    expect(await packPaymentsSchemaPresent({ execute: async () => [{ present: "t" }] })).toBe(false);
  });
});
