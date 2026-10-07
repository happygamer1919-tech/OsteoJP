import { describe, expect, it } from "vitest";
import { OSTEOJP_LOCATION_CONTACTS } from "../report/location-contacts";
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

// ---------------------------------------------------------------------------
// R45 (strategy, 2026-10-06), option (b) REFUSED: "switching LV and CB to the
// fuller contact block in code" waits until the real Linda-a-Velha email is
// supplied (the code table carries a placeholder for it). The clinic's rows are
// named "OsteoJP (LV)" and "OsteoJP (CB)", and for those names the RGPD form
// prints the location's OWN row. This pins that. It fails the day a short-code
// name starts resolving to a code-table block, which is a ruling, not a
// refactor. The same pin sits on the Declaração (declaracao/declaracao-model
// .test.ts) and on the clinical report (report/report-model.test.ts).
// ---------------------------------------------------------------------------
describe("R45 - the RGPD form's contact block for a short-code location is its own row", () => {
  it.each(["OsteoJP (LV)", "OsteoJP (CB)"])("%s", (name) => {
    const model = buildRgpdFormModel({
      ...INPUTS,
      location: { name, address: "Rua do registo, 1", phone: "210 000 000" },
    });
    expect(model.location).toEqual({
      name,
      addressLines: ["Rua do registo, 1"],
      postalCode: null,
      city: null,
      phones: ["210 000 000"],
      email: null,
    });
    // None of the code table's blocks, and nothing borrowed from one.
    for (const block of Object.values(OSTEOJP_LOCATION_CONTACTS)) {
      expect(model.location).not.toEqual(block);
      expect(model.location.email).not.toBe(block.email);
      for (const phone of block.phones) expect(model.location.phones).not.toContain(phone);
    }
  });

  it("the plain name still selects the code table's block, so the pin above is not vacuous", () => {
    const model = buildRgpdFormModel({
      ...INPUTS,
      location: { name: "Castelo Branco", address: "Rua do registo, 1", phone: "210 000 000" },
    });
    expect(model.location).toEqual(OSTEOJP_LOCATION_CONTACTS["castelo-branco"]);
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
