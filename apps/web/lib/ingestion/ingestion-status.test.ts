import { describe, expect, it } from "vitest";
import {
  INGESTION_STATUSES,
  assertTransition,
  canTransition,
  isIngestionStatus,
  resolveOutcomeStatus,
} from "./ingestion-status";

describe("ingestion_status state machine", () => {
  it("exposes exactly the enum values from the 0008 migration", () => {
    expect(INGESTION_STATUSES).toEqual(["received", "accepted", "rejected"]);
  });

  it("allows received -> accepted and received -> rejected", () => {
    expect(canTransition("received", "accepted")).toBe(true);
    expect(canTransition("received", "rejected")).toBe(true);
  });

  it("treats accepted and rejected as terminal", () => {
    expect(canTransition("accepted", "rejected")).toBe(false);
    expect(canTransition("rejected", "accepted")).toBe(false);
    expect(canTransition("accepted", "accepted")).toBe(false);
    expect(canTransition("received", "received")).toBe(false);
  });

  it("assertTransition throws on an illegal transition", () => {
    expect(() => assertTransition("received", "accepted")).not.toThrow();
    expect(() => assertTransition("accepted", "rejected")).toThrow(/illegal status transition/);
  });

  it("resolveOutcomeStatus maps draft-created -> accepted (review queue)", () => {
    expect(resolveOutcomeStatus(true)).toBe("accepted");
    expect(resolveOutcomeStatus(false)).toBe("rejected");
  });

  it("isIngestionStatus guards unknown values", () => {
    expect(isIngestionStatus("accepted")).toBe(true);
    expect(isIngestionStatus("approved")).toBe(false); // that's ai_review_state, not this enum
    expect(isIngestionStatus(null)).toBe(false);
  });
});
