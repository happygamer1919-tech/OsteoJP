import { describe, expect, it } from "vitest";
import {
  PATIENT_SUBMISSION_INITIAL_REVIEW,
  FINALIZED_REVIEW_STATES,
  assertInitialReviewState,
} from "./review";

describe("patient intake review boundary (mirrors AI ingestion)", () => {
  it("lands a submission in 'pending_review'", () => {
    expect(PATIENT_SUBMISSION_INITIAL_REVIEW).toBe("pending_review");
  });

  it("the initial state is NOT a finalized state (no auto-finalize)", () => {
    expect(FINALIZED_REVIEW_STATES).not.toContain(PATIENT_SUBMISSION_INITIAL_REVIEW);
    expect(FINALIZED_REVIEW_STATES).toEqual(["approved", "rejected"]);
  });

  it("assertInitialReviewState passes for the initial state, throws otherwise", () => {
    expect(() => assertInitialReviewState("pending_review")).not.toThrow();
    expect(() => assertInitialReviewState("approved")).toThrow();
    expect(() => assertInitialReviewState("in_review")).toThrow();
  });
});
