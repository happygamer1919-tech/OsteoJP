import { describe, expect, it } from "vitest";
import {
  resolveLocationContact,
  normalizeLocationKey,
  OSTEOJP_LOCATION_CONTACTS,
  OSTEOJP_PRIMARY_EMAIL_PLACEHOLDER,
} from "./location-contacts";

describe("normalizeLocationKey", () => {
  it("lowercases, strips accents, and hyphenates", () => {
    expect(normalizeLocationKey("Linda-a-Velha")).toBe("linda-a-velha");
    expect(normalizeLocationKey("linda a velha")).toBe("linda-a-velha");
    expect(normalizeLocationKey("  LINDA—A—VELHA ")).toBe("linda-a-velha");
    expect(normalizeLocationKey("Montemór-o-Novo")).toBe("montemor-o-novo");
  });
});

describe("resolveLocationContact — selection by location", () => {
  it("selects the Linda-a-Velha block (osteojp.pt grounded)", () => {
    const c = resolveLocationContact({ name: "Linda-a-Velha", address: null, phone: null });
    expect(c.name).toBe("OsteoJP — Linda-a-Velha");
    expect(c.addressLines).toEqual(["Praça Central Plaza, n.º 1-A"]);
    expect(c.postalCode).toBe("2795-246");
    expect(c.city).toBe("Linda-a-Velha");
    expect(c.phones).toEqual(["214 191 988", "969 472 111"]);
    // No location-specific email → primary clinic email (owner-gated placeholder).
    expect(c.email).toBe(OSTEOJP_PRIMARY_EMAIL_PLACEHOLDER);
  });

  it("selects the Castelo Branco block with its published email", () => {
    const c = resolveLocationContact({ name: "Castelo Branco", address: null, phone: null });
    expect(c.addressLines).toEqual(["R. Fernando Namora, n.º 6"]);
    expect(c.postalCode).toBe("6000-140");
    expect(c.phones).toEqual(["272 328 221", "969 877 553"]);
    expect(c.email).toBe("geral.castelobranco@osteojp.pt");
  });

  it("matches regardless of casing / spacing / accents", () => {
    const a = resolveLocationContact({ name: "CASTELO BRANCO", address: null, phone: null });
    const b = resolveLocationContact({ name: "castelo branco", address: null, phone: null });
    expect(a.email).toBe("geral.castelobranco@osteojp.pt");
    expect(b.email).toBe("geral.castelobranco@osteojp.pt");
  });

  it("falls back to the DB row for an unknown location (no reference match)", () => {
    const c = resolveLocationContact({
      name: "Montemor-o-Novo",
      address: "Rua Nova, n.º 3",
      phone: "266 000 000",
    });
    expect(c.name).toBe("Montemor-o-Novo");
    expect(c.addressLines).toEqual(["Rua Nova, n.º 3"]);
    expect(c.phones).toEqual(["266 000 000"]);
    expect(c.postalCode).toBeNull();
    expect(c.email).toBeNull();
  });

  it("handles an unknown location with no address/phone", () => {
    const c = resolveLocationContact({ name: "Pop-up Clinic", address: null, phone: null });
    expect(c.addressLines).toEqual([]);
    expect(c.phones).toEqual([]);
  });
});

// R45 (strategy, 2026-10-06), option (b) REFUSED until the real Linda-a-Velha
// email is supplied. The Declaração's carimbo and place line learned the
// brand-plus-short-code names ("OsteoJP (LV)", "OsteoJP (CB)"); THIS resolver
// did not, on purpose. A short-code name keeps its own row here, so no document
// starts printing the code table's block, placeholder email included, for it.
describe("R45 - a short-code name is NOT a code-table location for the contact block", () => {
  it.each(["OsteoJP (LV)", "OsteoJP (CB)", "osteojp (lv)", " OsteoJP(CB) "])("%s keeps its own row", (name) => {
    const c = resolveLocationContact({ name, address: "Rua do registo, 1", phone: "210 000 000" });
    expect(c).toEqual({
      name,
      addressLines: ["Rua do registo, 1"],
      postalCode: null,
      city: null,
      phones: ["210 000 000"],
      email: null,
    });
    expect(c.email).not.toBe(OSTEOJP_PRIMARY_EMAIL_PLACEHOLDER);
    expect(Object.values(OSTEOJP_LOCATION_CONTACTS)).not.toContainEqual(c);
  });

  it("with no address and no telephone on the row, the block is the name alone", () => {
    const c = resolveLocationContact({ name: "OsteoJP (LV)", address: null, phone: null });
    expect(c).toEqual({
      name: "OsteoJP (LV)",
      addressLines: [],
      postalCode: null,
      city: null,
      phones: [],
      email: null,
    });
  });
});
