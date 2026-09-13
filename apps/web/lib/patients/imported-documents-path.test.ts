import { describe, it, expect } from "vitest";
// The adapter is not exported from @osteojp/db's index, so it is reached by path.
// This is the whole point of the test: the restated prefix must be the one the
// import actually wrote under.
import { attachmentStoragePath } from "../../../../packages/db/src/migration/sources/fisiozero";

import { importedDocumentPrefix } from "./imported-documents-path";

const TENANT = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

describe("importedDocumentPrefix - the Fisiozero import's storage prefix", () => {
  it("is exactly the adapter's storage path with an empty file name", () => {
    expect(importedDocumentPrefix(TENANT)).toBe(attachmentStoragePath(TENANT, ""));
  });

  it("prefixes every path the adapter builds for a delivered file", () => {
    const path = attachmentStoragePath(TENANT, "documento-001.pdf");
    expect(path.startsWith(importedDocumentPrefix(TENANT))).toBe(true);
  });

  it("does NOT prefix a staff upload or an ordinary patient document", () => {
    const prefix = importedDocumentPrefix(TENANT);
    expect(`${TENANT}/00000000-0000-0000-0000-00000000fe01/abc__scan.pdf`.startsWith(prefix)).toBe(false);
    expect(`${TENANT}/patient-documents/p1/abc__rgpd.pdf`.startsWith(prefix)).toBe(false);
  });

  it("carries no LIKE wildcard, so `${prefix}%` matches the prefix literally", () => {
    expect(importedDocumentPrefix(TENANT)).not.toMatch(/[%_\\]/);
  });
});
