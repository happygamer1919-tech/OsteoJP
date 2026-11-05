/**
 * pack-payments-migration.test.ts: the STATIC half of the pack payments proof.
 * No database: it reads the pending file and the drizzle declarations and pins
 * what a reviewer would otherwise have to re-read by eye.
 *
 * THE DATABASE HALF is pack-instance-payments.db.test.ts, which runs only on a
 * database the file was applied to. This half runs everywhere, so a later edit
 * that loosens a policy, opens UPDATE or DELETE, touches patient_pack_instances,
 * or lets the drizzle tables drift from the SQL is red in the ordinary
 * `pnpm test`.
 *
 * Every assertion is on the STATEMENTS (comments stripped), not on the prose,
 * and each policy is compared WHOLE (a `toContain` per clause let an added
 * `OR true` survive, R4 2026-11-02).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { packInstanceAgreedPrices, packInstancePayments, patientPackInstances } from "../src/schema";
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
const code = stmts.filter((s) => !/^COMMENT ON\b/i.test(s));

describe(`pending migration ${FILE}`, () => {
  it("exists, flat in migrations-pending, and is the only file claiming either table", () => {
    expect(existsSync(PATH)).toBe(true);
    const claimants = readdirSync(PENDING_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /create table public\.(pack_instance_payments|pack_instance_agreed_prices)/i.test(readFileSync(join(PENDING_DIR, f), "utf8")),
      );
    expect(claimants).toEqual([FILE]);
  });

  it("no promoted migration creates either table yet (a promotion moves this file)", () => {
    const dir = join(__dirname, "..", "migrations");
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /pack_instance_payments|pack_instance_agreed_prices/.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual([]);
  });

  it("opens with the SET LOCAL lines the 0100 gate requires, in order", () => {
    expect(stmts[0]).toBe("SET LOCAL lock_timeout = '5s'");
    expect(stmts[1]).toBe("SET LOCAL statement_timeout = '60s'");
  });

  it("no transaction control, no function, no DROP, no invoices, no backfill", () => {
    expect(code.length).toBeGreaterThan(15);
    for (const s of code) {
      expect(s).not.toMatch(/^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START TRANSACTION|SAVEPOINT)\b/i);
      expect(s).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
      expect(s).not.toMatch(/\bDROP\b/i);
      expect(s).not.toMatch(/\binvoices\b/i);
      expect(s).not.toMatch(/^(INSERT|UPDATE|DELETE)\b/i);
      expect(s).not.toMatch(/IF NOT EXISTS/i);
    }
  });

  it("patient_pack_instances is NOT altered: no ALTER, GRANT, REVOKE or POLICY on it (the lead's side-table design)", () => {
    for (const s of code) {
      expect(s).not.toMatch(/^ALTER TABLE public\.patient_pack_instances\b/i);
      expect(s).not.toMatch(/^(GRANT|REVOKE)\b.* ON TABLE public\.patient_pack_instances\b/i);
      expect(s).not.toMatch(/^CREATE POLICY \w+ ON public\.patient_pack_instances\b/i);
    }
    expect(text).not.toMatch(/ADD COLUMN/i);
    // Control: the instances table IS named, as the target of keys and policy subqueries.
    expect(code.filter((s) => /REFERENCES public\.patient_pack_instances\(id\)/.test(s))).toHaveLength(2);
  });

  it("the agreed price table: set once by its primary key, a 0 to 100000 EUR range, no default", () => {
    const create = code.find((s) => /^CREATE TABLE public\.pack_instance_agreed_prices/i.test(s));
    expect(create).toBe(
      "CREATE TABLE public.pack_instance_agreed_prices ( pack_instance_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, " +
        "agreed_price_cents integer NOT NULL CONSTRAINT pack_instance_agreed_prices_amount_range CHECK (agreed_price_cents BETWEEN 0 AND 10000000), " +
        "created_at timestamptz NOT NULL DEFAULT now(), created_by uuid )",
    );
  });

  it("the payment table: the kinds, the signs, the methods (P9), the date floor, the Stylus reference, the reason cap", () => {
    const create = code.find((s) => /^CREATE TABLE public\.pack_instance_payments/i.test(s));
    expect(create).toBeDefined();
    for (const re of [
      /tenant_id uuid NOT NULL/,
      /pack_instance_id uuid NOT NULL/,
      /location_id uuid NOT NULL/,
      /kind text NOT NULL CONSTRAINT pack_instance_payments_kind_known CHECK \(kind IN \('pagamento', 'reembolso', 'correcao'\)\)/,
      /amount_cents integer NOT NULL CONSTRAINT pack_instance_payments_amount_bounded CHECK \(amount_cents BETWEEN -10000000 AND 10000000\)/,
      /received_on date NOT NULL CONSTRAINT pack_instance_payments_received_on_floor CHECK \(received_on >= DATE '2020-01-01'\)/,
      /CHECK \(method IS NULL OR method IN \('numerario', 'mbway', 'multibanco', 'cartao', 'transferencia', 'outro'\)\)/,
      /CHECK \(stylus_ref IS NULL OR \(btrim\(stylus_ref\) <> '' AND char_length\(stylus_ref\) <= 40\)\)/,
      /CONSTRAINT pack_instance_payments_reason_shape CHECK \(reason IS NULL OR \(btrim\(reason\) <> '' AND char_length\(reason\) <= 500\)\)/,
      /CONSTRAINT pack_instance_payments_amount_sign CHECK \( \(kind = 'pagamento' AND amount_cents > 0\) OR \(kind = 'reembolso' AND amount_cents < 0\) OR \(kind = 'correcao' AND amount_cents <> 0\) \)/,
      /CONSTRAINT pack_instance_payments_method_required CHECK \(kind = 'correcao' OR method IS NOT NULL\)/,
      /CONSTRAINT pack_instance_payments_reason_required CHECK \(kind = 'pagamento' OR reason IS NOT NULL\)/,
      /CONSTRAINT pack_instance_payments_payment_answers_nothing CHECK \(kind <> 'pagamento' OR corrects_id IS NULL\)/,
      /CONSTRAINT pack_instance_payments_id_instance_uq UNIQUE \(id, pack_instance_id\)/,
    ]) {
      expect(create).toMatch(re);
    }
    // Nothing fiscal on either table (design note 1.5).
    for (const t of code.filter((s) => /^CREATE TABLE/i.test(s))) {
      expect(t).not.toMatch(/\b(nif|vat|iva|invoice|fatura|serie|series|document_type)\b/i);
    }
  });

  it("RLS is ENABLED (not forced) on both tables before any policy", () => {
    const firstPolicy = stmts.findIndex((s) => /^CREATE POLICY/i.test(s));
    for (const t of ["pack_instance_agreed_prices", "pack_instance_payments"]) {
      const enable = stmts.findIndex((s) => s === `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
      expect(enable, t).toBeGreaterThan(-1);
      expect(firstPolicy).toBeGreaterThan(enable);
    }
    expect(stmts.some((s) => /FORCE ROW LEVEL SECURITY/i.test(s))).toBe(false);
  });

  it("the grants, exactly: revoke by name from every role, then SELECT and INSERT to authenticated, on each new table only", () => {
    const grants = code.filter((s) => /^(GRANT|REVOKE)\b/i.test(s));
    expect(grants).toEqual([
      "REVOKE ALL ON TABLE public.pack_instance_agreed_prices FROM PUBLIC, anon, authenticated, patient, service_role",
      "GRANT SELECT, INSERT ON TABLE public.pack_instance_agreed_prices TO authenticated",
      "REVOKE ALL ON TABLE public.pack_instance_payments FROM PUBLIC, anon, authenticated, patient, service_role",
      "GRANT SELECT, INSERT ON TABLE public.pack_instance_payments TO authenticated",
    ]);
  });

  it("the keys: ONE ALTER PER KEY (the cleanup FK walk reads one key per statement), with the reviewed actions", () => {
    const fks = code.filter((s) => /ADD CONSTRAINT \w+ FOREIGN KEY/.test(s));
    for (const s of fks) expect(s.match(/FOREIGN KEY/g)).toHaveLength(1);
    expect(fks).toEqual([
      "ALTER TABLE public.pack_instance_agreed_prices ADD CONSTRAINT pack_instance_agreed_prices_pack_instance_id_fkey FOREIGN KEY (pack_instance_id) REFERENCES public.patient_pack_instances(id)",
      "ALTER TABLE public.pack_instance_agreed_prices ADD CONSTRAINT pack_instance_agreed_prices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)",
      "ALTER TABLE public.pack_instance_agreed_prices ADD CONSTRAINT pack_instance_agreed_prices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL",
      "ALTER TABLE public.pack_instance_payments ADD CONSTRAINT pack_instance_payments_pack_instance_id_fkey FOREIGN KEY (pack_instance_id) REFERENCES public.patient_pack_instances(id)",
      "ALTER TABLE public.pack_instance_payments ADD CONSTRAINT pack_instance_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)",
      "ALTER TABLE public.pack_instance_payments ADD CONSTRAINT pack_instance_payments_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id)",
      "ALTER TABLE public.pack_instance_payments ADD CONSTRAINT pack_instance_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL",
      "ALTER TABLE public.pack_instance_payments ADD CONSTRAINT pack_instance_payments_corrects_fkey FOREIGN KEY (corrects_id, pack_instance_id) REFERENCES public.pack_instance_payments(id, pack_instance_id)",
    ]);
  });

  it("the four CREATE POLICY statements are the LAST four, two per table, none FOR ALL, none UPDATE or DELETE", () => {
    const last4 = stmts.slice(-4);
    expect(last4.every((s) => /^CREATE POLICY/i.test(s))).toBe(true);
    expect(stmts.filter((s) => /^CREATE POLICY/i.test(s))).toHaveLength(4);
    expect(stmts.some((s) => /FOR (ALL|UPDATE|DELETE)\b/i.test(s))).toBe(false);
    expect(stmts.some((s) => /(ALTER|DROP) POLICY|AS RESTRICTIVE/i.test(s))).toBe(false);
  });

  it("each CREATE POLICY is exactly the reviewed statement", () => {
    const tenant = "tenant_id = (SELECT public.jwt_tenant_id())";
    const money = "(SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')";
    const instOf = (t: string) =>
      `EXISTS (SELECT 1 FROM public.patient_pack_instances i WHERE i.id = ${t}.pack_instance_id AND i.tenant_id = (SELECT public.jwt_tenant_id()))`;
    expect(stmts.slice(-4)).toEqual([
      `CREATE POLICY pack_instance_agreed_prices_staff_select ON public.pack_instance_agreed_prices AS PERMISSIVE FOR SELECT TO authenticated USING ( ${tenant} AND ${money} )`,
      `CREATE POLICY pack_instance_agreed_prices_staff_insert ON public.pack_instance_agreed_prices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ( ${tenant} AND ${money} AND created_by = (SELECT auth.uid()) AND ${instOf("pack_instance_agreed_prices")} )`,
      `CREATE POLICY pack_instance_payments_staff_select ON public.pack_instance_payments AS PERMISSIVE FOR SELECT TO authenticated USING ( ${tenant} AND ${money} )`,
      `CREATE POLICY pack_instance_payments_staff_insert ON public.pack_instance_payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ( ${tenant} AND ${money} AND created_by = (SELECT auth.uid()) AND (kind <> 'correcao' OR (SELECT public.jwt_role()) IN ('owner', 'admin')) AND ${instOf("pack_instance_payments")} AND EXISTS (SELECT 1 FROM public.locations l WHERE l.id = pack_instance_payments.location_id AND l.tenant_id = (SELECT public.jwt_tenant_id())) )`,
    ]);
  });

  it("a therapist is named in no policy of this file (P4: therapists see no amounts)", () => {
    for (const s of stmts.filter((x) => /^CREATE POLICY/i.test(x))) expect(s).not.toMatch(/therapist/);
  });

  it("the drizzle declarations name the same columns and constraints as the SQL", () => {
    const pay = getTableConfig(packInstancePayments);
    expect(pay.name).toBe("pack_instance_payments");
    expect(pay.columns.map((c) => c.name).sort()).toEqual([
      "amount_cents", "corrects_id", "created_at", "created_by", "id", "kind", "location_id", "method",
      "pack_instance_id", "reason", "received_on", "stylus_ref", "tenant_id",
    ]);
    expect(pay.columns.filter((c) => c.notNull).map((c) => c.name).sort()).toEqual([
      "amount_cents", "created_at", "id", "kind", "location_id", "pack_instance_id", "received_on", "tenant_id",
    ]);
    const payChecks = [...text.matchAll(/CONSTRAINT (pack_instance_payments_\w+)\s+CHECK/g)].map((m) => m[1]).sort();
    expect(pay.checks.map((c) => c.name).sort()).toEqual(payChecks);
    expect(pay.uniqueConstraints.map((u) => u.name)).toEqual(["pack_instance_payments_id_instance_uq"]);

    const ap = getTableConfig(packInstanceAgreedPrices);
    expect(ap.name).toBe("pack_instance_agreed_prices");
    expect(ap.columns.map((c) => c.name).sort()).toEqual(["agreed_price_cents", "created_at", "created_by", "pack_instance_id", "tenant_id"]);
    expect(ap.columns.find((c) => c.name === "pack_instance_id")?.primary).toBe(true);
    expect(ap.checks.map((c) => c.name)).toEqual(["pack_instance_agreed_prices_amount_range"]);

    for (const [cfg, t] of [
      [pay, "pack_instance_payments"],
      [ap, "pack_instance_agreed_prices"],
    ] as const) {
      const create = code.find((s) => s.startsWith(`CREATE TABLE public.${t}`)) ?? "";
      for (const c of cfg.columns) expect(create).toMatch(new RegExp(`\\b${c.name} `));
    }
  });

  it("the drizzle instance table is untouched: no agreed price column on it", () => {
    const cols = getTableConfig(patientPackInstances).columns.map((c) => c.name);
    expect(cols).not.toContain("agreed_price_cents");
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
