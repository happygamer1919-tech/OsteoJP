import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_RESPONSAVEL, readDeclaracaoSettings } from "./declaracao-settings";
import {
  buildDeclaracaoModel,
  resolveLocalidade,
  resolveStampLocationKey,
} from "./declaracao-model";
import { OSTEOJP_LOCATION_CONTACTS } from "../report/location-contacts";
import { signatureStampBytesForLocation } from "./signature-stamp-asset";

const base = {
  patientName: "Maria Silva",
  dia: "12/07/2026",
  horaInicio: "09:30",
  horaFim: "10:30",
  localidade: "Linda-a-Velha",
  // W9-03: declarations are stamped per location. W12-32 filled the Castelo
  // Branco slot, so both LVA and CB now have their own carimbo.
  stampLocationKey: "linda-a-velha",
};

describe("resolveLocalidade — the declaration's own location, never fixed Lisboa", () => {
  it("uses the location's canonical city (Linda-a-Velha)", () => {
    expect(resolveLocalidade({ name: "Linda-a-Velha", address: null, phone: null })).toBe("Linda-a-Velha");
  });
  it("uses Castelo Branco from the canonical dataset", () => {
    expect(resolveLocalidade({ name: "Castelo Branco", address: null, phone: null })).toBe("Castelo Branco");
  });
  // R45: until this change the function took a SECOND location, the tenant's
  // default, and borrowed its city when the marcação's had none ("Sala X" at a
  // tenant whose default was Castelo Branco printed "Castelo Branco"). A
  // declaration is now made for one given location; there is no second one.
  it("R45: takes ONE location, so there is no other location's city to borrow", () => {
    expect(resolveLocalidade.length).toBe(1);
    expect(resolveLocalidade({ name: "Sala X", address: null, phone: null })).toBe("Sala X");
  });
  it("falls back to the location NAME (never a fixed Lisboa) when no city resolves", () => {
    expect(resolveLocalidade({ name: "Clínica Central", address: null, phone: null })).toBe("Clínica Central");
    expect(resolveLocalidade(null)).toBe("");
  });
});

describe("readDeclaracaoSettings — sane defaults + tenant overrides", () => {
  it("defaults the responsável and enables the stamp when unset", () => {
    const d = readDeclaracaoSettings({});
    expect(d.responsavel).toBe(DEFAULT_RESPONSAVEL);
    expect(d.signatureStamp).toBe(true);
  });
  it("honors a tenant override for the responsável", () => {
    const d = readDeclaracaoSettings({ declaracao: { responsavel: "Dra. Ana Costa" } });
    expect(d.responsavel).toBe("Dra. Ana Costa");
  });
  it("disables the stamp only on explicit false", () => {
    expect(readDeclaracaoSettings({ declaracao: { signatureStamp: false } }).signatureStamp).toBe(false);
    expect(readDeclaracaoSettings({ declaracao: { signatureStamp: true } }).signatureStamp).toBe(true);
  });
});

describe("buildDeclaracaoModel — responsável is config-sourced; stamp bytes gated by settings", () => {
  it("carries the default responsável and embeds the stamp bytes by default", () => {
    const m = buildDeclaracaoModel({ ...base, tenantSettings: {} });
    expect(m.responsavel).toBe(DEFAULT_RESPONSAVEL);
    expect(m.stampBytes).toBeInstanceOf(Uint8Array);
    expect((m.stampBytes as Uint8Array).length).toBeGreaterThan(0);
    // Interpolation inputs pass through verbatim.
    expect(m.patientName).toBe("Maria Silva");
    expect(m.dia).toBe("12/07/2026");
    expect(m.horaInicio).toBe("09:30");
    expect(m.horaFim).toBe("10:30");
  });
  it("takes the responsável from tenant settings when set", () => {
    const m = buildDeclaracaoModel({ ...base, tenantSettings: { declaracao: { responsavel: "Dra. Ana Costa" } } });
    expect(m.responsavel).toBe("Dra. Ana Costa");
  });
  it("leaves stampBytes null (blank space) when the tenant disables the stamp", () => {
    const m = buildDeclaracaoModel({ ...base, tenantSettings: { declaracao: { signatureStamp: false } } });
    expect(m.stampBytes).toBeNull();
  });
});

describe("W12-30 C1 — branded footer sources (contact + fiscal), reusing the report helpers", () => {
  it("resolves the canonical contact block for a known source location", () => {
    const m = buildDeclaracaoModel({
      ...base,
      sourceLocation: { name: "Linda-a-Velha", address: null, phone: null },
      fiscalSource: { tenantName: "OsteoJP, Lda.", tenantNif: "515123456" },
      tenantSettings: {},
    });
    expect(m.contact?.city).toBe("Linda-a-Velha");
    expect(m.contact?.phones.length).toBeGreaterThan(0);
    expect(m.fiscal.fiscalName).toBe("OsteoJP, Lda.");
    expect(m.fiscal.nif).toBe("515123456");
  });

  it("leaves contact null when no source location is supplied; fiscal still resolves", () => {
    const m = buildDeclaracaoModel({ ...base, tenantSettings: {} });
    expect(m.contact).toBeNull();
    // Never invents fiscal values — falls back to the owner-gated placeholders.
    expect(m.fiscal.fiscalName).toContain("por confirmar");
    expect(m.fiscal.nif).toBe("000000000");
  });

  it("falls back to clinic placeholders when the tenant carries no fiscal data", () => {
    const m = buildDeclaracaoModel({
      ...base,
      sourceLocation: { name: "Castelo Branco", address: null, phone: null },
      fiscalSource: { tenantName: null, tenantNif: null },
      tenantSettings: {},
    });
    expect(m.contact?.city).toBe("Castelo Branco");
    expect(m.fiscal.fiscalName).toContain("por confirmar");
    expect(m.fiscal.nif).toBe("000000000");
  });
});

// ---------------------------------------------------------------------------
// W9-03 - CB QA item 2 ("erro grave"): a Castelo Branco declaration printed the
// Linda-a-Velha carimbo. The cause: the stamp was resolved by a zero-argument
// accessor, so EVERY declaration got the LV block regardless of location. These
// tests pin the per-location resolution and, above all, that the fallback is
// ALWAYS a blank stamp area and NEVER another clinic's carimbo.
// ---------------------------------------------------------------------------

describe("resolveStampLocationKey - the same location the localidade line reads", () => {
  const LV = { name: "Linda-a-Velha", address: null, phone: null };

  it("resolves the declaration's location", () => {
    expect(resolveStampLocationKey(LV)).toBe("linda-a-velha");
  });
  it("R45: takes ONE location: no tenant default to fall back to", () => {
    expect(resolveStampLocationKey.length).toBe(1);
  });
  it("returns null when the location is not known (never a guess)", () => {
    expect(resolveStampLocationKey(null)).toBeNull();
  });
  it("normalizes exactly like the localidade line, so the two always agree", () => {
    // Same canonical key helper: accents stripped, lowercased, hyphenated.
    expect(resolveStampLocationKey({ name: "LINDA-A-VELHA", address: null, phone: null })).toBe(
      "linda-a-velha",
    );
    expect(resolveStampLocationKey({ name: "Castelo Branco", address: null, phone: null })).toBe(
      "castelo-branco",
    );
  });
});

describe("W9-03/W12-32 per-location carimbo - the erro grave", () => {
  it("a Linda-a-Velha declaration still embeds the LV stamp (no regression)", () => {
    const m = buildDeclaracaoModel({ ...base, stampLocationKey: "linda-a-velha", tenantSettings: {} });
    expect(m.stampBytes).toBeInstanceOf(Uint8Array);
    expect((m.stampBytes as Uint8Array).length).toBeGreaterThan(0);
  });

  it("W12-32: a Castelo Branco declaration embeds the CB stamp - NEVER the LV carimbo", () => {
    // W12-32 filled the CB slot with the owner's official Castelo Branco carimbo.
    // CB must carry ITS OWN stamp, and specifically NOT Linda-a-Velha's.
    const cb = buildDeclaracaoModel({ ...base, stampLocationKey: "castelo-branco", tenantSettings: {} });
    expect(cb.stampBytes).toBeInstanceOf(Uint8Array);
    expect((cb.stampBytes as Uint8Array).length).toBeGreaterThan(0);

    const lv = buildDeclaracaoModel({ ...base, stampLocationKey: "linda-a-velha", tenantSettings: {} });
    expect(lv.stampBytes).not.toBeNull();
    // The two locations carry DISTINCT carimbos - no swap, no shared fallback.
    expect(cb.stampBytes).not.toEqual(lv.stampBytes);
  });

  it("W12-32: the raw resolver returns distinct bytes for CB vs LV, and null for anything else", () => {
    const cb = signatureStampBytesForLocation("castelo-branco");
    const lv = signatureStampBytesForLocation("linda-a-velha");
    expect(cb).toBeInstanceOf(Uint8Array);
    expect(lv).toBeInstanceOf(Uint8Array);
    expect(cb).not.toEqual(lv);
    // A defined-but-empty / unknown / missing slot is ALWAYS blank, never a fallback.
    expect(signatureStampBytesForLocation("montemor-o-novo")).toBeNull();
    expect(signatureStampBytesForLocation("")).toBeNull();
    expect(signatureStampBytesForLocation(null)).toBeNull();
  });

  it("an UNKNOWN location renders blank, never a fallback to some other clinic's stamp", () => {
    const m = buildDeclaracaoModel({ ...base, stampLocationKey: "montemor-o-novo", tenantSettings: {} });
    expect(m.stampBytes).toBeNull();
  });

  it("a null location key renders blank", () => {
    const m = buildDeclaracaoModel({ ...base, stampLocationKey: null, tenantSettings: {} });
    expect(m.stampBytes).toBeNull();
  });

  it("the tenant stamp switch still wins over a location that HAS an asset", () => {
    const m = buildDeclaracaoModel({
      ...base,
      stampLocationKey: "linda-a-velha",
      tenantSettings: { declaracao: { signatureStamp: false } },
    });
    expect(m.stampBytes).toBeNull();
  });

  it("W5-31 content defaults are preserved (responsável + localidade untouched)", () => {
    const m = buildDeclaracaoModel({ ...base, stampLocationKey: "castelo-branco", tenantSettings: {} });
    expect(m.responsavel).toBe(DEFAULT_RESPONSAVEL);
    expect(m.localidade).toBe("Linda-a-Velha");
    expect(m.patientName).toBe("Maria Silva");
    expect(m.dia).toBe("12/07/2026");
  });
});

// ---------------------------------------------------------------------------
// R45 (strategy, 2026-10-06). The clinic's rows are named "OsteoJP (LV)" and
// "OsteoJP (CB)". Until R45 those names matched no carimbo and no city: the
// declaration printed a blank stamp area over the raw name, and no test here
// used a short-code name as the declaration's location.
//
//   G7 "Declaração at a location named "OsteoJP (LV)" and "OsteoJP (CB)".
//       EXPECT: stamp printed, place line "Linda-a-Velha" and "Castelo Branco"."
//   G8 "Declaração at a location with no stamp. EXPECT: refused with the
//       notice, no document produced." The refusal itself is generate.ts's and
//       is tested in generate.test.ts; what is pinned here is the null key it
//       refuses on.
// ---------------------------------------------------------------------------

const row = (name: string) => ({ name, address: "Rua do registo, 1", phone: "210 000 000" });
const sameBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a !== null && b !== null && Buffer.from(a).equals(Buffer.from(b));

describe("R45 G7 - a location prints ITS OWN carimbo and its city, short code or plain name", () => {
  const LV_BYTES = signatureStampBytesForLocation("linda-a-velha");
  const CB_BYTES = signatureStampBytesForLocation("castelo-branco");

  it.each([
    { name: "OsteoJP (LV)", key: "linda-a-velha", city: "Linda-a-Velha", own: LV_BYTES, other: CB_BYTES },
    { name: "OsteoJP (CB)", key: "castelo-branco", city: "Castelo Branco", own: CB_BYTES, other: LV_BYTES },
    // The plain names, unchanged.
    { name: "Linda-a-Velha", key: "linda-a-velha", city: "Linda-a-Velha", own: LV_BYTES, other: CB_BYTES },
    { name: "Castelo Branco", key: "castelo-branco", city: "Castelo Branco", own: CB_BYTES, other: LV_BYTES },
  ])("$name: stamp of $key, place line $city", ({ name, key, city, own, other }) => {
    const location = row(name);
    const stampLocationKey = resolveStampLocationKey(location);
    const localidade = resolveLocalidade(location);
    expect(stampLocationKey).toBe(key);
    expect(localidade).toBe(city);

    const m = buildDeclaracaoModel({ ...base, localidade, stampLocationKey, tenantSettings: {} });
    expect(m.localidade).toBe(city);
    // Its own carimbo, byte for byte, and never the other clinic's.
    expect(sameBytes(m.stampBytes, own)).toBe(true);
    expect(sameBytes(m.stampBytes, other)).toBe(false);
  });

  it("the two clinics' carimbos differ, so the assertions above can tell them apart", () => {
    expect(LV_BYTES).not.toBeNull();
    expect(CB_BYTES).not.toBeNull();
    expect(sameBytes(LV_BYTES, CB_BYTES)).toBe(false);
  });

  it("the place line is the city recorded for the key, not a second copy of it", () => {
    expect(resolveLocalidade(row("OsteoJP (LV)"))).toBe(OSTEOJP_LOCATION_CONTACTS["linda-a-velha"]?.city);
    expect(resolveLocalidade(row("OsteoJP (CB)"))).toBe(OSTEOJP_LOCATION_CONTACTS["castelo-branco"]?.city);
  });
});

describe("R45 G8 - a location with no carimbo resolves to NO key (generate.ts refuses on it)", () => {
  it.each([
    "OsteoJP (Montemor-o-Novo)",
    "OsteoJP (MN)",
    "Clínica Central",
    // Ends in a known code, without the brand: a room, not the clinic.
    "Sala de testes (LV)",
  ])("%s", (name) => {
    expect(resolveStampLocationKey(row(name))).toBeNull();
    // The line still names the location itself, never a clinic it is not.
    expect(resolveLocalidade(row(name))).toBe(name);
  });

  it("no location at all", () => {
    expect(resolveStampLocationKey(null)).toBeNull();
    expect(resolveLocalidade(null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// R45, option (b) REFUSED: "switching LV and CB to the fuller contact block in
// code" waits until the real Linda-a-Velha email is supplied (the code table
// carries a placeholder for it). So a short-code location keeps printing what
// it prints today in the footer: its OWN row. Teaching the stamp and the place
// line the short codes must not teach the contact block. The same pin sits on
// the clinical report (report/report-model.test.ts) and on the RGPD form
// (rgpd/rgpd.test.ts).
// ---------------------------------------------------------------------------
describe("R45 - the Declaração footer of a short-code location is its own row, not the code table", () => {
  it.each(["OsteoJP (LV)", "OsteoJP (CB)"])("%s", (name) => {
    const location = row(name);
    const m = buildDeclaracaoModel({
      ...base,
      localidade: resolveLocalidade(location),
      stampLocationKey: resolveStampLocationKey(location),
      sourceLocation: location,
      tenantSettings: {},
    });
    expect(m.contact).toEqual({
      name,
      addressLines: ["Rua do registo, 1"],
      postalCode: null,
      city: null,
      phones: ["210 000 000"],
      email: null,
    });
    // And it is none of the code table's blocks, whichever clinic it is.
    for (const block of Object.values(OSTEOJP_LOCATION_CONTACTS)) {
      expect(m.contact).not.toEqual(block);
      expect(m.contact?.email).not.toBe(block.email);
      for (const phone of block.phones) expect(m.contact?.phones).not.toContain(phone);
    }
    // The stamp and the line DID resolve, so this is a real declaration.
    expect(m.stampBytes).not.toBeNull();
    expect(m.localidade).not.toBe(name);
  });
});

describe("PL-03a — observações threads through the model (trimmed, empty -> null)", () => {
  it("carries the trimmed observações", () => {
    const m = buildDeclaracaoModel({ ...base, observacoes: "  evolução positiva  ", tenantSettings: {} });
    expect(m.observacoes).toBe("evolução positiva");
  });
  it("empty / whitespace / absent observações becomes null (no body block)", () => {
    expect(buildDeclaracaoModel({ ...base, observacoes: "   ", tenantSettings: {} }).observacoes).toBeNull();
    expect(buildDeclaracaoModel({ ...base, observacoes: null, tenantSettings: {} }).observacoes).toBeNull();
    expect(buildDeclaracaoModel({ ...base, tenantSettings: {} }).observacoes).toBeNull();
  });
});
