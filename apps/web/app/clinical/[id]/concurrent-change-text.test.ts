import { describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

/**
 * M-4: `concurrent_change` HAS THE RETRY SENTENCE WHEREVER THIS CHANGE RAISES IT.
 *
 * A registo write or a patient merge that Postgres rolls back as a deadlock
 * victim (SQLSTATE 40P01) is answered with one named refusal
 * (`namingDeadlock` in lib/clinical/records.ts, and `mergePatients` in
 * lib/patients/actions.ts). It reaches the staff through six places: the
 * record page's message for a refused new version (page-write-controls.test.tsx),
 * /clinical/new and the patient's Registos tab for a refused create
 * (new/page-alerts.test.tsx, patients/[id]/page-add-evaluation.test.tsx), the
 * review queue for a refused claim (review/claim-concurrent-change.test.tsx), and
 * the two client mappers below: the ficha save (RecordForm) and the merge box
 * in the danger zone. One sentence, in pt-PT and in English.
 *
 * M-4b: the writers that change one existing registo raise it too. A refused
 * sign lands on the record page (actions.sign.test.ts and
 * page-write-controls.test.tsx) and a refused finalize on the review page
 * (review/actions.concurrent-change.test.ts and
 * review/[recordId]/page-write-gate.test.tsx); the review's ficha save shows
 * it through RecordForm, as the ficha save does; and two more client mappers
 * below: the review's narrative save (ReviewEditor) and the delete and annul
 * dialog on the patient's Registos tab.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/patients/actions", () => ({
  hardDeletePatient: vi.fn(),
  mergePatients: vi.fn(),
  restorePatient: vi.fn(),
  softDeletePatient: vi.fn(),
}));
vi.mock("@/app/patients/[id]/actions", () => ({
  hardDeleteRecordAction: vi.fn(),
  annulRecordAction: vi.fn(),
}));

import { saveFailureReason } from "./RecordForm";
import { MERGE_ERROR_TEXT } from "@/app/patients/_components/patient-actions";
import { reviewSaveErrorText } from "@/app/clinical/review/[recordId]/ReviewEditor";
import { ERROR_TEXT } from "@/app/patients/[id]/record-lifecycle-actions";

const pt = getStrings("pt");
const en = getStrings("en");

describe("errors.concurrentChange is the ruled sentence, in both languages", () => {
  it("pt-PT", () => {
    expect(pt["errors.concurrentChange"]).toBe(
      "Outra alteração a este paciente estava a decorrer ao mesmo tempo. Nada foi guardado. Tente novamente.",
    );
  });

  it("English", () => {
    expect(en["errors.concurrentChange"]).toBe(
      "Another change to this patient was running at the same time. Nothing was saved. Try again.",
    );
  });
});

describe("each client mapper names concurrent_change", () => {
  it("the ficha save (RecordForm): the retry sentence, not the generic error", () => {
    expect(saveFailureReason({ ok: false, code: "concurrent_change" })).toBe(pt["errors.concurrentChange"]);
    expect(pt["errors.concurrentChange"]).not.toBe(pt["clinical.error"]);
  });

  it("CONTROL the ficha save: not_author keeps its message, an unknown code the generic one", () => {
    expect(saveFailureReason({ ok: false, code: "not_author" })).toBe(pt["clinical.notAuthor"]);
    expect(saveFailureReason({ ok: false, code: "error" })).toBe(pt["clinical.error"]);
  });

  it("the merge box: the retry sentence", () => {
    expect(MERGE_ERROR_TEXT.concurrent_change).toBe(pt["errors.concurrentChange"]);
  });

  it("CONTROL the merge box: the three operator refusals keep their own sentences", () => {
    expect(MERGE_ERROR_TEXT.invalid_id).toBe(pt["patients.mergeInvalidId"]);
    expect(MERGE_ERROR_TEXT.self_merge).toBe(pt["patients.mergeSelfMerge"]);
    expect(MERGE_ERROR_TEXT.not_found).toBe(pt["patients.mergeNotFound"]);
  });

  it("M-4b the review narrative save (ReviewEditor): the retry sentence, not the generic review error", () => {
    expect(reviewSaveErrorText({ ok: false, code: "concurrent_change" })).toBe(pt["errors.concurrentChange"]);
    expect(pt["errors.concurrentChange"]).not.toBe(pt["review.error"]);
  });

  it("CONTROL the review narrative save: not_author keeps its message, an unknown code the generic one, a saved state none", () => {
    expect(reviewSaveErrorText({ ok: false, code: "not_author" })).toBe(pt["clinical.notAuthor"]);
    expect(reviewSaveErrorText({ ok: false, code: "error" })).toBe(pt["review.error"]);
    expect(reviewSaveErrorText({ ok: true })).toBeNull();
  });

  it("M-4b the delete and annul dialog (record-lifecycle-actions): the retry sentence has its own entry", () => {
    expect(ERROR_TEXT.concurrent_change).toBe(pt["errors.concurrentChange"]);
    expect(pt["errors.concurrentChange"]).not.toBe(pt["errors.generic"]);
    expect(pt["errors.concurrentChange"]).not.toBe(pt["clinical.recordActionServerError"]);
  });

  it("CONTROL the delete and annul dialog: an unknown error keeps the server-error sentence, not_found the generic fallback", () => {
    expect(ERROR_TEXT.error).toBe(pt["clinical.recordActionServerError"]);
    expect(ERROR_TEXT.not_found).toBeUndefined();
  });
});
