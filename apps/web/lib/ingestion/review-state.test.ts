import { describe, expect, it } from "vitest";
import {
  AI_REVIEW_STATES,
  FINALIZED_REVIEW_STATE,
  INITIAL_REVIEW_STATE,
  assertReviewTransition,
  canReviewTransition,
  finalizeReview,
  isAiReviewState,
  isTerminalReviewState,
} from "./review-state";

describe("ai_review_state machine", () => {
  it("exposes exactly the enum values from the schema", () => {
    expect(AI_REVIEW_STATES).toEqual(["pending_review", "in_review", "approved", "rejected"]);
  });

  it("lands new AI drafts in pending_review (rule #4)", () => {
    expect(INITIAL_REVIEW_STATE).toBe("pending_review");
  });

  it("allows a reviewer to claim a draft: pending_review -> in_review", () => {
    expect(canReviewTransition("pending_review", "in_review")).toBe(true);
  });

  it("allows finalize and reject from in_review, and release back to the queue", () => {
    expect(canReviewTransition("in_review", "approved")).toBe(true);
    expect(canReviewTransition("in_review", "rejected")).toBe(true);
    expect(canReviewTransition("in_review", "pending_review")).toBe(true);
  });

  it("allows rejecting a draft without claiming it: pending_review -> rejected", () => {
    expect(canReviewTransition("pending_review", "rejected")).toBe(true);
  });

  it("forbids jumping straight to finalized without review (pending_review -> approved)", () => {
    expect(canReviewTransition("pending_review", "approved")).toBe(false);
  });

  it("treats approved and rejected as terminal (immutable review decision)", () => {
    expect(isTerminalReviewState("approved")).toBe(true);
    expect(isTerminalReviewState("rejected")).toBe(true);
    expect(isTerminalReviewState("pending_review")).toBe(false);
    expect(isTerminalReviewState("in_review")).toBe(false);
    for (const to of AI_REVIEW_STATES) {
      expect(canReviewTransition("approved", to)).toBe(false);
      expect(canReviewTransition("rejected", to)).toBe(false);
    }
  });

  it("assertReviewTransition throws on an illegal transition", () => {
    expect(() => assertReviewTransition("pending_review", "in_review")).not.toThrow();
    expect(() => assertReviewTransition("pending_review", "approved")).toThrow(/illegal transition/);
    expect(() => assertReviewTransition("approved", "in_review")).toThrow(/illegal transition/);
  });

  it("isAiReviewState guards unknown values", () => {
    expect(isAiReviewState("in_review")).toBe(true);
    expect(isAiReviewState("accepted")).toBe(false); // that's ingestion_status, not this enum
    expect(isAiReviewState(null)).toBe(false);
  });
});

describe("finalizeReview (therapist finalizes)", () => {
  it("finalizes from in_review -> approved", () => {
    expect(finalizeReview("in_review")).toBe(FINALIZED_REVIEW_STATE);
    expect(FINALIZED_REVIEW_STATE).toBe("approved");
  });

  it("refuses to finalize a draft that was never reviewed (pending_review)", () => {
    expect(() => finalizeReview("pending_review")).toThrow(/illegal transition/);
  });

  it("refuses to re-finalize an already-terminal review (immutability)", () => {
    expect(() => finalizeReview("approved")).toThrow(/illegal transition/);
    expect(() => finalizeReview("rejected")).toThrow(/illegal transition/);
  });
});
