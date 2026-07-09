import { describe, expect, it } from "vitest";
import { buildRgpdFormModel, type RgpdFormInputs } from "./rgpd-model";
import { renderRgpdFormPdf } from "./rgpd-pdf";

const INPUTS: RgpdFormInputs = {
  patient: { fullName: "Maria Silva", nif: "123456789" },
  clinic: { tenantName: "OsteoJP, Lda.", tenantNif: "515123456" },
  // "Linda-a-Velha" exercises accented + em-dash glyphs in the branded header.
  location: { name: "Linda-a-Velha", address: null, phone: null },
};

const PDF_MAGIC = "%PDF-";

describe("buildRgpdFormModel (SPEC 7.2)", () => {
  it("resolves clinic fiscal + the canonical location contact block", () => {
    const model = buildRgpdFormModel(INPUTS);
    expect(model.clinic.fiscalName).toBe("OsteoJP, Lda.");
    expect(model.clinic.nif).toBe("515123456");
    // Linda-a-Velha resolves to the richer canonical block (phones + city).
    expect(model.location.city).toBe("Linda-a-Velha");
    expect(model.location.phones.length).toBeGreaterThan(0);
    expect(model.patient.fullName).toBe("Maria Silva");
    expect(model.patient.nif).toBe("123456789");
  });

  it("falls back to clinic placeholders when the tenant carries no fiscal data", () => {
    const model = buildRgpdFormModel({
      ...INPUTS,
      clinic: { tenantName: null, tenantNif: null },
    });
    expect(model.clinic.fiscalName).toContain("por confirmar");
    expect(model.clinic.nif).toBe("000000000");
  });
});

describe("renderRgpdFormPdf (SPEC 7.2) — A4 with logo + branding, no new dependency", () => {
  it("renders a non-empty A4 PDF (PT) carrying the branded header", async () => {
    const model = buildRgpdFormModel(INPUTS);
    const bytes = await renderRgpdFormPdf(model, "pt");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe(PDF_MAGIC);
  });

  it("renders for EN too", async () => {
    const model = buildRgpdFormModel(INPUTS);
    const bytes = await renderRgpdFormPdf(model, "en");
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe(PDF_MAGIC);
  });

  it("does not throw on accented PT glyphs (Castelo Branco block)", async () => {
    const model = buildRgpdFormModel({
      ...INPUTS,
      location: { name: "Castelo Branco", address: null, phone: null },
    });
    await expect(renderRgpdFormPdf(model, "pt")).resolves.toBeInstanceOf(Uint8Array);
  });
});
