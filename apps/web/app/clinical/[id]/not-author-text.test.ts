import { describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

/**
 * `not_author` HAS A MESSAGE WHEREVER IT CAN SURFACE.
 *
 * zeroRowRefusal (lib/clinical/records.ts) answers `not_author` when a
 * therapist's write touched no row and the registo has another author. It
 * reaches the staff through five mappers: the record page's sign message and
 * the review page's finalize message (pinned by page-write-controls.test.tsx
 * and review/[recordId]/page-write-gate.test.tsx, which render the pages), and
 * the three client mappers below: the ficha save (RecordForm, which the review
 * Ficha editor also uses), the review narrative save (ReviewEditor), and the
 * delete dialog on the patient's Registos tab. Each used to fall through to
 * its generic error. The string exists in pt-PT and in English.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/patients/[id]/actions", () => ({
  hardDeleteRecordAction: vi.fn(),
  annulRecordAction: vi.fn(),
}));

import { saveFailureReason } from "./RecordForm";
import { reviewSaveErrorText } from "@/app/clinical/review/[recordId]/ReviewEditor";
import { ERROR_TEXT } from "@/app/patients/[id]/record-lifecycle-actions";

const pt = getStrings("pt");
const en = getStrings("en");

describe("clinical.notAuthor exists in both languages", () => {
  it("pt-PT and English each carry their own text", () => {
    expect(pt["clinical.notAuthor"]).toMatch(/autor/);
    expect(en["clinical.notAuthor"]).toMatch(/author/);
    expect(pt["clinical.notAuthor"]).not.toBe(en["clinical.notAuthor"]);
  });
});

describe("each client mapper names not_author", () => {
  it("the ficha save (RecordForm): not_author, not the generic error", () => {
    expect(saveFailureReason({ ok: false, code: "not_author" })).toBe(pt["clinical.notAuthor"]);
  });

  it("CONTROL the ficha save: finalized keeps its message, an unknown code the generic one", () => {
    expect(saveFailureReason({ ok: false, code: "finalized" })).toBe(pt["clinical.finalized"]);
    expect(saveFailureReason({ ok: false, code: "not_found" })).toBe(pt["clinical.error"]);
  });

  it("the review narrative save (ReviewEditor): not_author, not the generic review error", () => {
    expect(reviewSaveErrorText({ ok: false, code: "not_author" })).toBe(pt["clinical.notAuthor"]);
  });

  it("CONTROL the review narrative save: finalized keeps its message, an unknown code the generic one", () => {
    expect(reviewSaveErrorText({ ok: false, code: "finalized" })).toBe(pt["clinical.finalized"]);
    expect(reviewSaveErrorText({ ok: false, code: "not_found" })).toBe(pt["review.error"]);
  });

  it("the delete dialog (record-lifecycle-actions): not_author has its own entry", () => {
    expect(ERROR_TEXT.not_author).toBe(pt["clinical.notAuthor"]);
    // CONTROL: not_found is still left to the generic fallback, as W6-01a ruled.
    expect(ERROR_TEXT.not_found).toBeUndefined();
  });
});
