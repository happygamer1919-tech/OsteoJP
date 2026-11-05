/**
 * service-type-fields.test.ts: the five Tipos de Marcacao columns name ONE set
 * of allowed values, in the migration, in the Drizzle schema and in
 * src/service-type-fields.ts (which the admin screen's dropdowns read).
 *
 * No database: it reads the migration file wherever it sits (pending in
 * migrations-pending today, in migrations once promoted) and the schema's
 * CHECK text, and compares each list to the constants. A dropdown offering a
 * value the CHECK refuses is a save that fails for the clinic; a CHECK
 * admitting a value no dropdown offers is a value nobody can see.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { services } from "../src/schema";
import {
  SERVICE_COLOR_PATTERN,
  SERVICE_FOLLOW_UP_DAYS,
  SERVICE_VAT_RATES,
  VAT_EXEMPTION_CODES,
  VAT_EXEMPTION_REASONS,
  isServiceFollowUpDays,
  isServiceVatRate,
  isVatExemptionCode,
} from "../src/service-type-fields";

const MARKER = "ADD CONSTRAINT services_vat_exemption_code_allowed";

function migrationFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["migrations", "migrations-pending"]) {
    const abs = join(__dirname, "..", dir);
    for (const f of readdirSync(abs)) {
      if (!f.endsWith(".sql")) continue;
      if (readFileSync(join(abs, f), "utf8").includes(MARKER)) out.push(join(abs, f));
    }
  }
  return out;
}

/** The body of a named CHECK in the migration, up to its closing `),` or `);`. */
function checkBody(sqlText: string, name: string): string {
  const start = sqlText.indexOf(`ADD CONSTRAINT ${name} CHECK (`);
  if (start < 0) throw new Error(`CHECK ${name} not found in the migration`);
  const rest = sqlText.slice(start);
  const end = rest.search(/\n {2}\)[,;]/);
  if (end < 0) throw new Error(`CHECK ${name} has no end in the migration`);
  return rest.slice(0, end);
}

function quoted(body: string): string[] {
  return [...body.matchAll(/'([A-Z0-9]+)'/g)].map((m) => m[1] as string);
}

function schemaCheck(name: string): string {
  const cfg = getTableConfig(services);
  const c = cfg.checks.find((x) => x.name === name);
  if (!c) throw new Error(`schema.ts has no CHECK ${name} on services`);
  return new PgDialect().sqlToQuery(c.value).sql;
}

describe("Tipos de Marcacao: one list of allowed values", () => {
  const files = migrationFiles();

  it("exactly one migration file adds the columns", () => {
    expect(files).toHaveLength(1);
  });

  const text = files.length === 1 ? readFileSync(files[0] as string, "utf8") : "";

  it("the exemption codes: the migration's CHECK, the schema's CHECK and the constants agree, in order", () => {
    expect(quoted(checkBody(text, "services_vat_exemption_code_allowed"))).toEqual([...VAT_EXEMPTION_CODES]);
    expect(quoted(schemaCheck("services_vat_exemption_code_allowed"))).toEqual([...VAT_EXEMPTION_CODES]);
    expect(VAT_EXEMPTION_CODES).toHaveLength(33);
    expect(new Set(VAT_EXEMPTION_CODES).size).toBe(VAT_EXEMPTION_CODES.length);
  });

  it("every exemption label starts with its own code", () => {
    for (const r of VAT_EXEMPTION_REASONS) expect(r.label.startsWith(`${r.code} - `)).toBe(true);
  });

  it("the VAT rates: the migration's CHECK, the schema's CHECK and the constants agree", () => {
    const fromSql = (s: string) =>
      (/in \(([0-9, ]+)\)/i.exec(s)?.[1] ?? "").split(",").map((x) => Number(x.trim()));
    expect(fromSql(checkBody(text, "services_vat_rate_allowed"))).toEqual([...SERVICE_VAT_RATES]);
    expect(fromSql(schemaCheck("services_vat_rate_allowed"))).toEqual([...SERVICE_VAT_RATES]);
  });

  it("the follow-up days: 2 only, in the migration, the schema and the constants", () => {
    expect(checkBody(text, "services_follow_up_days_allowed")).toMatch(/follow_up_days = 2\s*$/);
    expect(schemaCheck("services_follow_up_days_allowed")).toMatch(/= 2$/);
    expect([...SERVICE_FOLLOW_UP_DAYS]).toEqual([2]);
  });

  it("the colour: the same pattern in the migration, the schema and the constant", () => {
    expect(checkBody(text, "services_color_hex")).toContain(`'${SERVICE_COLOR_PATTERN.source}'`);
    expect(schemaCheck("services_color_hex")).toContain(`'${SERVICE_COLOR_PATTERN.source}'`);
    expect(SERVICE_COLOR_PATTERN.test("#FEE93D")).toBe(true);
    expect(SERVICE_COLOR_PATTERN.test("#fee93d")).toBe(false);
    expect(SERVICE_COLOR_PATTERN.test("FEE93D")).toBe(false);
  });

  it("sms_reminders is NOT NULL with default true in the migration and the schema", () => {
    expect(text).toContain("ADD COLUMN sms_reminders boolean NOT NULL DEFAULT true");
    expect(services.smsReminders.notNull).toBe(true);
    expect(services.smsReminders.default).toBe(true);
  });

  it("the guards admit the listed values and refuse their neighbours", () => {
    expect(SERVICE_VAT_RATES.every(isServiceVatRate)).toBe(true);
    expect([5, 22, 1, -6].some(isServiceVatRate)).toBe(false);
    expect(VAT_EXEMPTION_CODES.every(isVatExemptionCode)).toBe(true);
    expect(["M03", "M08", "m07", "M7", ""].some(isVatExemptionCode)).toBe(false);
    expect(isServiceFollowUpDays(2)).toBe(true);
    expect([0, 1, 3].some(isServiceFollowUpDays)).toBe(false);
  });
});
