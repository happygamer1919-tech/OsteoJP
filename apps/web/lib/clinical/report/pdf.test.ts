import { describe, expect, it } from "vitest";
import { renderClinicalReportPdf } from "./pdf";
import { buildClinicalReportModel, type ReportInputs } from "./report-model";

const FINALIZED: ReportInputs = {
  record: {
    id: "11111111-1111-1111-1111-111111111111",
    status: "signed",
    aiReviewState: null,
    version: 1,
    episodeId: "ep-1",
    data: {
      consultationReason: "Lombalgia aguda",
      diagnosis: "Disfunção lombar",
      treatmentPlan: "Mobilização articular e plano de exercícios em casa.",
      observations: "Reavaliar em 2 semanas.",
    },
    consultationDate: new Date("2026-05-20T09:30:00Z"),
    signedAt: new Date("2026-05-21T16:00:00Z"),
  },
  patient: { fullName: "Maria Silva", dateOfBirth: "1985-03-09", nif: "123456789" },
  practitioner: { fullName: "Dr. João Pereira", title: "Osteopata", signedByName: "Dr. João Pereira" },
  clinic: { fiscalName: "OsteoJP, Lda.", nif: "515123456" },
  // "Linda-a-Velha" exercises accented + em-dash glyphs in the branded header.
  location: { name: "Linda-a-Velha", address: null, phone: null },
};

const PDF_MAGIC = "%PDF-";

describe("renderClinicalReportPdf", () => {
  it("renders a non-empty PDF for a finalized record (PT)", async () => {
    const model = buildClinicalReportModel(FINALIZED, "pt");
    const bytes = await renderClinicalReportPdf(model, "pt");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe(PDF_MAGIC);
  });

  it("renders for the EN locale too", async () => {
    const model = buildClinicalReportModel(FINALIZED, "en");
    const bytes = await renderClinicalReportPdf(model, "en");
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe(PDF_MAGIC);
  });

  it("does not throw on accented PT glyphs in the branded header", async () => {
    // Castelo Branco block has accents + a published email; must encode cleanly.
    const model = buildClinicalReportModel(
      { ...FINALIZED, location: { name: "Castelo Branco", address: null, phone: null } },
      "pt",
    );
    await expect(renderClinicalReportPdf(model, "pt")).resolves.toBeInstanceOf(Uint8Array);
  });
});
