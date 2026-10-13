/**
 * actions.concurrent-change.test.ts: M-4b. WHERE A REVIEW SAVE OR A FINALIZE
 * ROLLED BACK AS A DEADLOCK VICTIM LANDS.
 *
 * editReviewNarrative, saveReviewFicha and finalizeReview (lib/clinical/review.ts)
 * answer a deadlock victim with `concurrent_change`
 * (records.single-row-deadlock.test.ts). Each action hands that code on the way
 * it already hands every other named refusal:
 *   - saveNarrativeAction and saveFichaReviewAction return it as the save
 *     state's `code`, which the two editors turn into the retry sentence
 *     (clinical/[id]/concurrent-change-text.test.ts);
 *   - finalizeAction lands back on the review screen with `?m=concurrent_change`,
 *     which that page draws ([recordId]/page-write-gate.test.tsx).
 * Nothing is retried: the writer is called once.
 *
 * CONTROLS: another named refusal keeps its own code, and an error that is not
 * a ClinicalError is the generic one it was before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  editReviewNarrative: vi.fn(),
  saveReviewFicha: vi.fn(),
  finalizeReview: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(async () => ({
    tenantId: "11111111-1111-4111-8111-111111111111",
    role: "therapist",
    userId: "22222222-2222-4222-8222-222222222222",
  })),
}));
vi.mock("@/lib/clinical/review", () => ({
  claimReviewItem: vi.fn(),
  editReviewNarrative: h.editReviewNarrative,
  finalizeReview: h.finalizeReview,
  saveReviewFicha: h.saveReviewFicha,
}));
vi.mock("@/lib/clinical/records", () => ({ getFichaMedicaTemplate: vi.fn(async () => null) }));

import { ClinicalError } from "@/lib/clinical/errors";
import { finalizeAction, saveFichaReviewAction, saveNarrativeAction } from "./actions";

const RECORD = "55555555-5555-4555-8555-555555555555";
const HASH = "0123456789abcdef0123456789abcdef";

function form(field: string): FormData {
  const f = new FormData();
  f.set(field, JSON.stringify({ notes: "x" }));
  return f;
}

/** Where finalizeAction redirected to. */
async function landing(): Promise<string> {
  try {
    await finalizeAction(RECORD, HASH);
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error("finalizeAction did not redirect");
}

beforeEach(() => {
  h.editReviewNarrative.mockReset();
  h.saveReviewFicha.mockReset();
  h.finalizeReview.mockReset();
  h.redirect.mockClear();
});

describe("M-4b: the review's narrative save", () => {
  it("rolled back as a deadlock victim: the save state carries concurrent_change, and nothing is retried", async () => {
    h.editReviewNarrative.mockRejectedValue(new ClinicalError("concurrent_change"));
    expect(await saveNarrativeAction(RECORD, { ok: false }, form("narrative"))).toEqual({
      ok: false,
      code: "concurrent_change",
    });
    expect(h.editReviewNarrative).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: another refusal keeps its code, and an unknown error is the generic one", async () => {
    h.editReviewNarrative.mockRejectedValue(new ClinicalError("finalized"));
    expect(await saveNarrativeAction(RECORD, { ok: false }, form("narrative"))).toEqual({ ok: false, code: "finalized" });
    h.editReviewNarrative.mockRejectedValue(new Error("connection reset"));
    expect(await saveNarrativeAction(RECORD, { ok: false }, form("narrative"))).toEqual({ ok: false, code: "error" });
  });
});

describe("M-4b: the review's ficha save", () => {
  it("rolled back as a deadlock victim: the save state carries concurrent_change, and nothing is retried", async () => {
    h.saveReviewFicha.mockRejectedValue(new ClinicalError("concurrent_change"));
    expect(await saveFichaReviewAction(RECORD, { ok: false }, form("data"))).toMatchObject({
      ok: false,
      code: "concurrent_change",
    });
    expect(h.saveReviewFicha).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: another refusal keeps its code, and an unknown error is the generic one", async () => {
    h.saveReviewFicha.mockRejectedValue(new ClinicalError("not_author"));
    expect(await saveFichaReviewAction(RECORD, { ok: false }, form("data"))).toMatchObject({ ok: false, code: "not_author" });
    h.saveReviewFicha.mockRejectedValue(new Error("connection reset"));
    expect(await saveFichaReviewAction(RECORD, { ok: false }, form("data"))).toEqual({ ok: false, code: "error" });
  });
});

describe("M-4b: the review's finalize", () => {
  it("rolled back as a deadlock victim: back on the review screen with ?m=concurrent_change, and nothing is retried", async () => {
    h.finalizeReview.mockRejectedValue(new ClinicalError("concurrent_change"));
    expect(await landing()).toBe(`/clinical/review/${RECORD}?m=concurrent_change`);
    expect(h.finalizeReview).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: another refusal keeps its code, an unknown error is ?m=err, and a finalize that goes through opens the registo", async () => {
    h.finalizeReview.mockRejectedValue(new ClinicalError("stale"));
    expect(await landing()).toBe(`/clinical/review/${RECORD}?m=stale`);
    h.finalizeReview.mockRejectedValue(new Error("connection reset"));
    expect(await landing()).toBe(`/clinical/review/${RECORD}?m=err`);
    h.finalizeReview.mockResolvedValue(undefined);
    expect(await landing()).toBe(`/clinical/${RECORD}`);
  });
});
