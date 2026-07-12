import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_RESPONSAVEL, readDeclaracaoSettings } from "./declaracao-settings";
import { buildDeclaracaoModel, resolveLocalidade } from "./declaracao-model";

const base = {
  patientName: "Maria Silva",
  dia: "12/07/2026",
  horaInicio: "09:30",
  horaFim: "10:30",
  localidade: "Linda-a-Velha",
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
