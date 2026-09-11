import { describe, expect, it } from "vitest";
import {
  ALLOWED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
  validateDocumentUpload,
} from "./document-validation";

describe("the patient-document size cap (INC-patient-document-over-15mb-refused)", () => {
  // The clinic could not upload a patient's RGPD document: anything over 15 MB was
  // refused. The cap lived here and only here - the bytes go browser -> Storage on a
  // signed upload URL, so no Vercel function body is in the path, and production's
  // `clinical-attachments` bucket carries no file_size_limit of its own.
  const MiB = 1024 * 1024;

  it("is 50 MiB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(50 * MiB);
  });

  it("accepts a 20 MB scanned PDF, the size the clinic was refused", () => {
    expect(validateDocumentUpload({ mimeType: "application/pdf", sizeBytes: 20 * MiB })).toBeNull();
  });

  it("refuses one byte over 50 MiB", () => {
    expect(validateDocumentUpload({ mimeType: "application/pdf", sizeBytes: 50 * MiB + 1 })).toBe("size");
  });

  it("the help text and the refusal name the same limit the code enforces", async () => {
    const pt = (await import("../../../../packages/i18n/src/strings.pt.json")).default as Record<string, string>;
    const en = (await import("../../../../packages/i18n/src/strings.en.json")).default as Record<string, string>;
    const mb = `${MAX_DOCUMENT_BYTES / MiB} MB`;
    for (const strings of [pt, en]) {
      expect(strings["patients.documentUploadHelp"]).toContain(mb);
      expect(strings["patients.documentTooLarge"]).toContain(mb);
    }
  });
});

describe("validateDocumentUpload", () => {
  it("accepts an allowed type within the size limit", () => {
    expect(
      validateDocumentUpload({ mimeType: "application/pdf", sizeBytes: 1024 }),
    ).toBeNull();
  });

  it("accepts every declared allowed MIME type", () => {
    for (const mime of ALLOWED_DOCUMENT_MIME) {
      expect(validateDocumentUpload({ mimeType: mime, sizeBytes: 1 })).toBeNull();
    }
  });

  it("is case-insensitive on the MIME type", () => {
    expect(
      validateDocumentUpload({ mimeType: "Application/PDF", sizeBytes: 1024 }),
    ).toBeNull();
  });

  it("rejects a disallowed type", () => {
    expect(
      validateDocumentUpload({ mimeType: "application/zip", sizeBytes: 1024 }),
    ).toBe("type");
  });

  it("rejects a missing/empty type (never silently allowed)", () => {
    expect(validateDocumentUpload({ mimeType: null, sizeBytes: 1024 })).toBe("type");
    expect(validateDocumentUpload({ mimeType: "", sizeBytes: 1024 })).toBe("type");
  });

  it("rejects a file over the size limit", () => {
    expect(
      validateDocumentUpload({
        mimeType: "application/pdf",
        sizeBytes: MAX_DOCUMENT_BYTES + 1,
      }),
    ).toBe("size");
  });

  it("accepts a file exactly at the size limit", () => {
    expect(
      validateDocumentUpload({
        mimeType: "application/pdf",
        sizeBytes: MAX_DOCUMENT_BYTES,
      }),
    ).toBeNull();
  });

  it("rejects a zero/negative size", () => {
    expect(
      validateDocumentUpload({ mimeType: "application/pdf", sizeBytes: 0 }),
    ).toBe("size");
  });
});
