import { describe, expect, it } from "vitest";

import { ALLOWED_DOCUMENT_MIME } from "./document-validation";
import {
  PREVIEWABLE_DOCUMENT_MIME,
  documentPreviewKind,
  isDocumentPreviewable,
} from "./document-preview";

/**
 * The preview list, pinned against the upload list it is carved out of.
 *
 * The interesting cases here are the REFUSALS, because each one is a type a
 * member of staff really can upload and really will see in the tab.
 */

describe("the previewable types are a subset of what can be uploaded", () => {
  it("every previewable type is an accepted upload type", () => {
    // A type nobody can upload has no business being previewable; a preview
    // list that drifted above the upload list would be describing files that
    // cannot exist.
    for (const mime of PREVIEWABLE_DOCUMENT_MIME) {
      expect(ALLOWED_DOCUMENT_MIME, `${mime} is previewable but not uploadable`).toContain(mime);
    }
  });

  it("is deliberately NARROWER than the upload list", () => {
    // If these ever match, somebody has made Word documents and HEIC images
    // previewable, which no browser on the desk can render.
    expect(PREVIEWABLE_DOCUMENT_MIME.length).toBeLessThan(ALLOWED_DOCUMENT_MIME.length);
  });
});

describe("what renders in place, and as what", () => {
  it("renders a PDF as a pdf", () => {
    expect(documentPreviewKind("application/pdf")).toBe("pdf");
  });

  it("renders jpeg, png and webp as images", () => {
    expect(documentPreviewKind("image/jpeg")).toBe("image");
    expect(documentPreviewKind("image/png")).toBe("image");
    expect(documentPreviewKind("image/webp")).toBe("image");
  });

  it("tolerates the casing and padding a stored header can carry", () => {
    expect(documentPreviewKind("Application/PDF")).toBe("pdf");
    expect(documentPreviewKind("  image/PNG  ")).toBe("image");
  });
});

describe("what keeps Abrir alone", () => {
  it("refuses HEIC and HEIF, which Chrome and Firefox do not render", () => {
    // Uploadable, and a real iPhone scan at the desk. A preview panel that is
    // blank for most of the clinic reads as a broken document.
    expect(documentPreviewKind("image/heic")).toBeNull();
    expect(documentPreviewKind("image/heif")).toBeNull();
  });

  it("refuses Word documents, which no browser renders", () => {
    expect(documentPreviewKind("application/msword")).toBeNull();
    expect(
      documentPreviewKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBeNull();
  });

  it("refuses a document with NO recorded type rather than guessing", () => {
    // Every Fisiozero import row whose vendor export omitted tipo_mime carries
    // null here. Guessing from the file name is how a preview starts rendering
    // something other than what it says it is.
    expect(documentPreviewKind(null)).toBeNull();
    expect(documentPreviewKind(undefined)).toBeNull();
    expect(documentPreviewKind("")).toBeNull();
    expect(documentPreviewKind("   ")).toBeNull();
  });

  it("refuses types nobody allowed, including ones that LOOK renderable", () => {
    // image/svg+xml is the one that matters: browsers render it, and it can
    // carry script. It is not uploadable and it is not previewable.
    expect(documentPreviewKind("image/svg+xml")).toBeNull();
    expect(documentPreviewKind("text/html")).toBeNull();
    expect(documentPreviewKind("application/zip")).toBeNull();
  });
});

describe("isDocumentPreviewable is the button's whole condition", () => {
  it("agrees with documentPreviewKind on every accepted upload type", () => {
    for (const mime of ALLOWED_DOCUMENT_MIME) {
      expect(isDocumentPreviewable(mime)).toBe(documentPreviewKind(mime) !== null);
    }
  });
});
