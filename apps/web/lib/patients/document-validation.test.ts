import { describe, expect, it } from "vitest";
import {
  ALLOWED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
  validateDocumentUpload,
} from "./document-validation";

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
