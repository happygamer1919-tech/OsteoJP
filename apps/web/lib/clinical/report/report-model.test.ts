import { describe, expect, it } from "vitest";
import {
  isPrintable,
  assertPrintable,
  buildClinicalReportModel,
  RecordNotPrintableError,
  type ReportInputs,
  type ReportRecordInput,
  type ReportPatientInput,
  type ReportPractitionerInput,
  type ReportClinicInput,
} from "./report-model";
import type { SourceLocation } from "./location-contacts";

type Overrides = {
  record?: Partial<ReportRecordInput>;
  patient?: Partial<ReportPatientInput>;
  practitioner?: Partial<ReportPractitionerInput>;
  clinic?: Partial<ReportClinicInput>;
  location?: Partial<SourceLocation>;
};

function inputs(overrides: Overrides = {}): ReportInputs {
  return {
    record: {
      id: "11111111-1111-1111-1111-111111111111",
      status: "locked",
      aiReviewState: null,
      version: 1,
      episodeId: "ep-1",
      data: {
        consultationReason: "Lombalgia aguda",
        diagnosis: "Disfunção lombar",
        treatmentPlan: "Mobilização + exercícios",
        // an empty field must be omitted from the model body:
        observations: "   ",
      },
      consultationDate: new Date("2026-05-20T09:30:00Z"),
      signedAt: null,
      ...overrides.record,
    },
    patient: {
      fullName: "Maria Silva",
      dateOfBirth: "1985-03-09",
      nif: "123456789",
      ...overrides.patient,
    },
    practitioner: {
      fullName: "Dr. João Pereira",
      title: "Osteopata",
      signedByName: null,
      ...overrides.practitioner,
    },
    clinic: { fiscalName: "OsteoJP, Lda.", nif: "515123456", ...overrides.clinic },
    location: { name: "Linda-a-Velha", address: null, phone: null, ...overrides.location },
  };
}

describe("print gate (finalized-only)", () => {
  it("permits locked and signed records", () => {
    expect(isPrintable({ status: "locked", aiReviewState: null })).toBe(true);
    expect(isPrintable({ status: "signed", aiReviewState: null })).toBe(true);
  });

  it("rejects draft records", () => {
    expect(isPrintable({ status: "draft", aiReviewState: null })).toBe(false);
  });

  it("rejects records still under AI review even if status reads finalized", () => {
    expect(isPrintable({ status: "locked", aiReviewState: "pending_review" })).toBe(false);
    expect(isPrintable({ status: "locked", aiReviewState: "in_review" })).toBe(false);
    // approved/rejected are terminal review states; the record_status gate governs.
    expect(isPrintable({ status: "signed", aiReviewState: "approved" })).toBe(true);
  });

  it("assertPrintable throws RecordNotPrintableError for a draft", () => {
    try {
      assertPrintable({ status: "draft", aiReviewState: null });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RecordNotPrintableError);
      if (e instanceof RecordNotPrintableError) expect(e.code).toBe("not_printable");
    }
  });

  it("assertPrintable passes for a finalized record", () => {
    expect(() => assertPrintable({ status: "signed", aiReviewState: null })).not.toThrow();
  });
});

describe("buildClinicalReportModel", () => {
  it("throws before producing a model for a draft", () => {
    expect(() => buildClinicalReportModel(inputs({ record: { status: "draft" } }), "pt"))
      .toThrowError();
  });

  it("builds the fiscal header, patient, location and body for a finalized record", () => {
    const m = buildClinicalReportModel(inputs(), "pt");

    expect(m.clinic).toEqual({ fiscalName: "OsteoJP, Lda.", nif: "515123456" });
    expect(m.location.name).toBe("OsteoJP — Linda-a-Velha"); // selected from reference
    expect(m.patient).toEqual({
      fullName: "Maria Silva",
      dateOfBirth: "09/03/1985", // date-only, no tz shift
      nif: "123456789",
    });
    expect(m.record.consultationDate).toBe("20/05/2026");
    expect(m.record.version).toBe(1);
  });

  it("includes only non-empty body fields, in template order", () => {
    const m = buildClinicalReportModel(inputs(), "pt");
    expect(m.body.map((b) => b.key)).toEqual([
      "consultationReason",
      "diagnosis",
      "treatmentPlan",
    ]); // observations was whitespace → omitted; absent fields skipped
    expect(m.body[0].value).toBe("Lombalgia aguda");
  });

  it("prints the signer + signed date for a signed record", () => {
    const m = buildClinicalReportModel(
      inputs({
        record: {
          id: "x",
          status: "signed",
          aiReviewState: null,
          version: 2,
          episodeId: null,
          data: {},
          consultationDate: new Date("2026-05-20T09:30:00Z"),
          signedAt: new Date("2026-05-21T16:00:00Z"),
        },
        practitioner: { fullName: "Dr. João Pereira", title: "Osteopata", signedByName: "Dr.ª Ana Costa" },
      }),
      "pt",
    );
    expect(m.signature.practitionerName).toBe("Dr.ª Ana Costa"); // signer wins
    expect(m.signature.signedAt).toBe("21/05/2026");
  });

  it("formats dates per locale (en-GB)", () => {
    const m = buildClinicalReportModel(inputs(), "en");
    expect(m.patient.dateOfBirth).toBe("09/03/1985");
    expect(m.record.consultationDate).toBe("20/05/2026");
  });
});
