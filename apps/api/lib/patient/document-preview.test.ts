import { describe, expect, it } from "vitest";

import { PREVIEWABLE_DOCUMENT_MIME, documentPreviewKind } from "./document-preview";

/**
 * The portal's copy of the previewable-type list.
 *
 * THIS SUITE IS THE REASON THE COPY IS ALLOWED TO EXIST. apps/api and apps/web
 * share no application package, so the list is duplicated from
 * apps/web/lib/patients/document-preview.ts. Both copies are pinned to the SAME
 * four literals here and there, so a change to one that is not made to the other
 * turns a suite red rather than quietly giving the two apps different answers
 * about the same file.
 */

describe("the list the portal will render", () => {
  it("is exactly the four types every browser renders", () => {
    // Pinned to the VALUE, and in order. The staff copy asserts the same four.
    expect([...PREVIEWABLE_DOCUMENT_MIME]).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("maps each of them to how it is rendered", () => {
    expect(documentPreviewKind("application/pdf")).toBe("pdf");
    expect(documentPreviewKind("image/jpeg")).toBe("image");
    expect(documentPreviewKind("image/png")).toBe("image");
    expect(documentPreviewKind("image/webp")).toBe("image");
  });

  it("tolerates stored casing and padding", () => {
    expect(documentPreviewKind("APPLICATION/PDF")).toBe("pdf");
    expect(documentPreviewKind(" image/webp ")).toBe("image");
  });
});

describe("what the portal refuses, leaving the download button alone", () => {
  it("refuses HEIC and HEIF - a blank panel on Android is worse than no panel", () => {
    expect(documentPreviewKind("image/heic")).toBeNull();
    expect(documentPreviewKind("image/heif")).toBeNull();
  });

  it("refuses Word documents", () => {
    expect(documentPreviewKind("application/msword")).toBeNull();
    expect(
      documentPreviewKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBeNull();
  });

  it("refuses a document with no stored type rather than guessing from its name", () => {
    expect(documentPreviewKind(null)).toBeNull();
    expect(documentPreviewKind(undefined)).toBeNull();
    expect(documentPreviewKind("")).toBeNull();
  });

  it("refuses svg, which browsers DO render and which can carry script", () => {
    expect(documentPreviewKind("image/svg+xml")).toBeNull();
    expect(documentPreviewKind("text/html")).toBeNull();
  });
});
