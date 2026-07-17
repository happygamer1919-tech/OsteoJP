import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_RESPONSAVEL, readDeclaracaoSettings } from "./declaracao-settings";
import {
  buildDeclaracaoModel,
  resolveLocalidade,
  resolveStampLocationKey,
} from "./declaracao-model";

const base = {
  patientName: "Maria Silva",
  dia: "12/07/2026",
  horaInicio: "09:30",
  horaFim: "10:30",
  localidade: "Linda-a-Velha",
  // W9-03: declarations are now stamped per location. Default the shared base to
  // Linda-a-Velha, the only location with a stamp asset today.
  stampLocationKey: "linda-a-velha",
};

describe("resolveLocalidade — marcação city, tenant-default fallback, never fixed Lisboa", () => {
  it("uses the marcação location's canonical city (Linda-a-Velha)", () => {
    expect(resolveLocalidade({ name: "Linda-a-Velha", address: null, phone: null }, null)).toBe(
      "Linda-a-Velha",
    );
  });
  it("uses Castelo Branco from the canonical dataset", () => {
    expect(resolveLocalidade({ name: "Castelo Branco", address: null, phone: null }, null)).toBe(
      "Castelo Branco",
    );
  });
  it("falls back to the tenant default location's city when the marcação has none", () => {
    expect(
      resolveLocalidade(
        { name: "Sala X", address: null, phone: null },
        { name: "Castelo Branco", address: null, phone: null },
      ),
    ).toBe("Castelo Branco");
  });
  it("falls back to the location NAME (never a fixed Lisboa) when no city resolves", () => {
    expect(resolveLocalidade({ name: "Clínica Central", address: null, phone: null }, null)).toBe(
      "Clínica Central",
    );
    expect(resolveLocalidade(null, null)).toBe("");
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

// ---------------------------------------------------------------------------
// W9-03 - CB QA item 2 ("erro grave"): a Castelo Branco declaration printed the
// Linda-a-Velha carimbo. The cause: the stamp was resolved by a zero-argument
// accessor, so EVERY declaration got the LV block regardless of location. These
// tests pin the per-location resolution and, above all, that the fallback is
// ALWAYS a blank stamp area and NEVER another clinic's carimbo.
// ---------------------------------------------------------------------------

describe("resolveStampLocationKey - mirrors the localidade resolution", () => {
  const LV = { name: "Linda-a-Velha", address: null, phone: null };
  const CB = { name: "OsteoJP (CB)", address: null, phone: null };

  it("prefers the marcação's location over the tenant default", () => {
    expect(resolveStampLocationKey(LV, CB)).toBe("linda-a-velha");
  });
  it("falls back to the tenant default when the marcação has no location", () => {
    expect(resolveStampLocationKey(null, LV)).toBe("linda-a-velha");
  });
  it("returns null when neither location is known (-> blank stamp, never a guess)", () => {
    expect(resolveStampLocationKey(null, null)).toBeNull();
  });
  it("normalizes exactly like the localidade line, so the two always agree", () => {
    // Same canonical key helper: accents stripped, lowercased, hyphenated.
    expect(resolveStampLocationKey({ name: "LINDA-A-VELHA", address: null, phone: null }, null)).toBe(
      "linda-a-velha",
    );
    expect(resolveStampLocationKey({ name: "Castelo Branco", address: null, phone: null }, null)).toBe(
      "castelo-branco",
    );
  });
});

describe("W9-03 per-location carimbo - the erro grave", () => {
  it("a Linda-a-Velha declaration still embeds the LV stamp (no regression)", () => {
    const m = buildDeclaracaoModel({ ...base, stampLocationKey: "linda-a-velha", tenantSettings: {} });
    expect(m.stampBytes).toBeInstanceOf(Uint8Array);
    expect((m.stampBytes as Uint8Array).length).toBeGreaterThan(0);
  });

  it("a Castelo Branco declaration carries NO stamp - blank area, NEVER the LV carimbo", () => {
    // The whole point of the loop: CB has no asset yet, so it must render blank
    // rather than borrow Linda-a-Velha's.
    const cb = buildDeclaracaoModel({ ...base, stampLocationKey: "castelo-branco", tenantSettings: {} });
    expect(cb.stampBytes).toBeNull();

    // ...and specifically NOT the LV bytes.
    const lv = buildDeclaracaoModel({ ...base, stampLocationKey: "linda-a-velha", tenantSettings: {} });
    expect(lv.stampBytes).not.toBeNull();
    expect(cb.stampBytes).not.toEqual(lv.stampBytes);
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
