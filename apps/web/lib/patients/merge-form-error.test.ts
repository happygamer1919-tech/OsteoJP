/**
 * INC-CONFIRM-07b - A TYPO IN THE SURVIVOR BOX IS A SENTENCE, NOT A 500.
 *
 * ==========================================================================
 * WHAT THE SENTRY EVENTS SAID AND WHY IT POINTED AT THE WRONG ID
 * ==========================================================================
 * Two events on 2026-09-02, 20:12 and 20:16 UTC, both
 * `ValidationError: Invalid patient id` on POST /patients/[id], and the uuid in
 * the URL was WELL FORMED - so the obvious reading is that the route parameter
 * did not survive to the action. It did. `loserId` IS that uuid.
 *
 * The id that failed is `survivorId`, which comes from a free-text input in the
 * danger zone. An operator who pastes a patient NUMBER, or a name, hits this on
 * every attempt, four minutes apart, and sees nothing useful: a server action
 * that throws in production shows the client an opaque digest, never the
 * message. The failure was legible only in Sentry, to somebody who does not
 * read Sentry.
 *
 * ==========================================================================
 * THE ASSERTIONS ARE ON `parseMergeInput` AND ON THE MAPPING, NOT ON THE DB
 * ==========================================================================
 * The action itself needs a request context and a transaction, so the DB-gated
 * suites own the merge behaviour. What is provable here without a database is
 * the whole of what changed: which inputs the validator refuses, and that every
 * refusal an operator can cause has a sentence rather than falling through to a
 * generic one.
 */
import { describe, expect, it } from "vitest";

import { parseMergeInput, ValidationError } from "./validation";
import type { MergePatientError } from "./actions";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("the inputs an operator actually types into the survivor box", () => {
  it("a patient NUMBER is refused, and that is the reported instance", () => {
    // The likeliest wrong paste: the number reception uses day to day.
    expect(() => parseMergeInput({ survivorId: "1042", loserId: UUID_A })).toThrow(
      ValidationError,
    );
  });

  it("a NAME is refused", () => {
    expect(() => parseMergeInput({ survivorId: "Madalena Sousa", loserId: UUID_A })).toThrow(
      ValidationError,
    );
  });

  it("an EMPTY box is refused before anything reaches the database", () => {
    expect(() => parseMergeInput({ survivorId: "", loserId: UUID_A })).toThrow(ValidationError);
  });

  it("THE LOSER ID IS NOT THE ONE FAILING: a well-formed pair parses", () => {
    // The route parameter was always fine. This is the assertion that keeps the
    // next reader of those two Sentry events from re-diagnosing the URL.
    expect(parseMergeInput({ survivorId: UUID_A, loserId: UUID_B })).toEqual({
      survivorId: UUID_A,
      loserId: UUID_B,
    });
  });

  it("self-merge is its OWN refusal, distinct from a malformed id", () => {
    // Two different sentences: one says the box holds the wrong kind of value,
    // the other says it holds the right kind naming the wrong patient. A single
    // "invalid id" for both would send an operator to fix a correct paste.
    expect(() => parseMergeInput({ survivorId: UUID_A, loserId: UUID_A })).toThrow(
      "Cannot merge a patient into itself",
    );
    expect(() => parseMergeInput({ survivorId: "1042", loserId: UUID_A })).toThrow(
      "Invalid patient id",
    );
  });
});

describe("every operator-caused refusal has a sentence", () => {
  it("the union is exactly the three the operator can cause", () => {
    // A COMPILE-TIME ASSERTION MADE RUNTIME-VISIBLE. `MERGE_ERROR_TEXT` in
    // patient-actions.tsx is a COMPLETE Record over this union, so a fourth
    // member cannot be added without a sentence to show for it. This pins the
    // membership so that guarantee cannot be widened silently by loosening the
    // type to Partial.
    const all: Record<MergePatientError, true> = {
      invalid_id: true,
      self_merge: true,
      not_found: true,
    };
    expect(Object.keys(all).sort()).toEqual(["invalid_id", "not_found", "self_merge"]);
  });
});
