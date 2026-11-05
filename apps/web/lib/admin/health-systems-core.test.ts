import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HEALTH_SYSTEM_ACCENTS_FROM,
  HEALTH_SYSTEM_ACCENTS_TO,
  HEALTH_SYSTEM_NAME_MAX,
  foldHealthSystemAccents,
  healthSystemNameKey,
  healthSystemNameProblem,
  healthSystemOptionsFor,
  normalizeHealthSystemName,
  readPriceTableEnabled,
  withPriceTableEnabled,
} from "./health-systems-core";

describe("Sistemas / SubSistemas: names", () => {
  it("normalizes whitespace the way the database index does", () => {
    expect(normalizeHealthSystemName("  ADSE  ")).toBe("ADSE");
    expect(normalizeHealthSystemName("Sub \t  Sistema\nX")).toBe("Sub Sistema X");
    expect(normalizeHealthSystemName("   ")).toBe("");
  });

  it("composes a decomposed paste to NFC, so it is stored composed and folds like the precomposed name", () => {
    const decomposed = "Médis";
    expect(decomposed).not.toBe("Médis");
    expect(normalizeHealthSystemName(decomposed)).toBe("Médis");
    expect(healthSystemNameKey(decomposed)).toBe(healthSystemNameKey("Médis"));
    expect(healthSystemNameKey(decomposed)).toBe("medis");
    expect(healthSystemNameKey(" SAÚDE  ")).toBe("saude");
  });

  it("compares ignoring case, whitespace and accents (ruling Q12)", () => {
    expect(healthSystemNameKey(" adse ")).toBe(healthSystemNameKey("ADSE"));
    expect(healthSystemNameKey("SAMS  Quadros")).toBe(healthSystemNameKey("sams quadros"));
    expect(healthSystemNameKey("Médis")).toBe(healthSystemNameKey("Medis"));
  });

  // The same table packages/db/tests/health-systems-rls.db.test.ts runs through
  // the index expression read from the catalogue, so a key here that differs
  // from the database's fails one side or the other.
  it("maps a table of names to the keys the unique index computes", () => {
    const table: [string, string][] = [
      ["Médis", "medis"],
      ["Medis", "medis"],
      ["MEDIS", "medis"],
      [" médis ", "medis"],
      ["MÉDIS", "medis"],
      ["Saúde", "saude"],
      ["Saude", "saude"],
      ["Ç", "c"],
      ["C", "c"],
      ["Açoreana  Saúde", "acoreana saude"],
      ["ÀÁÂÃÄ èéêëẽ ìíîïĩ òóôõö ùúûüũ ñ", "aaaaa eeeee iiiii ooooo uuuuu n"],
      ["Medis Plus", "medis plus"],
      ["Fidelidade Saúde", "fidelidade saude"],
    ];
    expect(table.map(([n]) => [n, healthSystemNameKey(n)])).toEqual(table);
    // Two names that must stay distinct.
    expect(healthSystemNameKey("Médis")).not.toBe(healthSystemNameKey("Medis Plus"));
    expect(healthSystemNameKey("Saúde Prime")).not.toBe(healthSystemNameKey("Saúde Primeira"));
  });

  it("folds with the migration's own map, character for character", () => {
    // The file that creates the index: pending today, numbered after promotion.
    const root = join(__dirname, "..", "..", "..", "..", "packages", "db");
    const sources = ["migrations-pending", "migrations"]
      .map((d) => join(root, d))
      .flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(dir, f), "utf8")))
      .filter((text) => text.includes("CREATE UNIQUE INDEX health_systems_tenant_name_key"));
    expect(sources.length).toBe(1);
    const literals = [
      ...sources[0]!.matchAll(
        /translate\(lower\(btrim\(regexp_replace\(name, '\[\[:space:\]\]\+', ' ', 'g'\)\)\), '([^']*)', '([^']*)'\)/g,
      ),
    ];
    expect(literals.length).toBe(1);
    expect(literals[0]![1]).toBe(HEALTH_SYSTEM_ACCENTS_FROM);
    expect(literals[0]![2]).toBe(HEALTH_SYSTEM_ACCENTS_TO);
    // Postgres translate() needs equal lengths here (a shorter target DELETES
    // the unmatched letters), and every letter must be one code point.
    expect([...HEALTH_SYSTEM_ACCENTS_FROM].length).toBe(54);
    expect([...HEALTH_SYSTEM_ACCENTS_TO].length).toBe(54);
    expect(HEALTH_SYSTEM_ACCENTS_FROM).toBe(HEALTH_SYSTEM_ACCENTS_FROM.normalize("NFC"));
    // Each letter maps onto its own base letter, lower case.
    for (const [i, c] of [...HEALTH_SYSTEM_ACCENTS_FROM].entries()) {
      expect(c.normalize("NFD")[0]!.toLowerCase(), c).toBe(HEALTH_SYSTEM_ACCENTS_TO[i]);
    }
    expect(foldHealthSystemAccents("Ação Médica Ñ")).toBe("Acao Medica n");
  });

  it("refuses a blank name and one over the database bound", () => {
    // The literal is the database's (health_systems_name_length: <= 120), so a
    // change to the constant alone cannot move both sides together.
    expect(HEALTH_SYSTEM_NAME_MAX).toBe(120);
    expect(healthSystemNameProblem("x".repeat(120))).toBeNull();
    expect(healthSystemNameProblem("x".repeat(121))).toBe("too_long");
    expect(healthSystemNameProblem("")).toBe("blank");
    expect(healthSystemNameProblem(" \t ")).toBe("blank");
    expect(healthSystemNameProblem("x".repeat(HEALTH_SYSTEM_NAME_MAX))).toBeNull();
    expect(healthSystemNameProblem("x".repeat(HEALTH_SYSTEM_NAME_MAX + 1))).toBe("too_long");
    // Whitespace that normalization removes does not count against the bound.
    expect(healthSystemNameProblem(`  ${"x".repeat(HEALTH_SYSTEM_NAME_MAX)}  `)).toBeNull();
  });
});

describe("Sistemas / SubSistemas: the price-table switch", () => {
  it("reads OFF unless the stored value is literally true", () => {
    expect(readPriceTableEnabled({})).toBe(false);
    expect(readPriceTableEnabled(null)).toBe(false);
    expect(readPriceTableEnabled({ healthSystems: {} })).toBe(false);
    expect(readPriceTableEnabled({ healthSystems: { priceTableEnabled: "true" } })).toBe(false);
    expect(readPriceTableEnabled({ healthSystems: { priceTableEnabled: true } })).toBe(true);
  });

  it("writes only its own key and keeps every other settings key", () => {
    const before = { contacts: { email: "x" }, billing: { vatRate: 23 }, healthSystems: { other: 1 } };
    const after = withPriceTableEnabled(before, true);
    expect(after).toEqual({
      contacts: { email: "x" },
      billing: { vatRate: 23 },
      healthSystems: { other: 1, priceTableEnabled: true },
    });
    expect(readPriceTableEnabled(withPriceTableEnabled(after, false))).toBe(false);
  });
});

describe("Sistemas / SubSistemas: the ficha dropdown", () => {
  const all = [
    { id: "b", name: "SAMS", active: true },
    { id: "a", name: "ADSE", active: true },
    { id: "c", name: "Antigo", active: false },
  ];

  it("offers the active entries, sorted by name", () => {
    expect(healthSystemOptionsFor(all, null).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("keeps a switched-off entry the patient already names", () => {
    expect(healthSystemOptionsFor(all, "c").map((o) => o.id)).toEqual(["a", "c", "b"]);
  });
});
