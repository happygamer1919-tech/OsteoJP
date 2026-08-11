import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";

import { stripFrameVars } from "./sentry-scrub";

/**
 * The synthetic event is shaped like what the LocalVariables integration
 * produces when it fires on the clinical claim transaction: the frame that
 * threw carries `vars` holding the row it had in scope, and `row.data` there
 * holds the AI partner's payload under `_aiIngestionRaw`.
 *
 * The assertion that matters is `not.toHaveProperty("vars")`, not
 * `toBeUndefined()`. A frame carrying `vars: undefined` still serialises the
 * key, and a scrubber that assigned undefined instead of deleting would pass a
 * `toBeUndefined()` check while leaving the shape wrong.
 */
function eventWithFrameVars(): ErrorEvent {
  return {
    // `ErrorEvent` is the Sentry event union member defined by `type: undefined`
    // (a transaction event carries `type: "transaction"`). It is required, so
    // every fixture here states it.
    type: undefined,
    exception: {
      values: [
        {
          type: "ClinicalError",
          value: "not_under_review",
          stacktrace: {
            frames: [
              {
                filename: "app:///lib/clinical/review.ts",
                function: "claimForReview",
                in_app: true,
                vars: {
                  row: {
                    id: "rec_1",
                    data: {
                      _aiIngestionRaw: {
                        consultation_reason: "dor lombar",
                        patient_name: "Maria Silva",
                      },
                    },
                  },
                },
              },
              {
                filename: "app:///lib/clinical/review.ts",
                function: "reviewClaim",
                in_app: true,
                vars: { recordId: "rec_1" },
              },
              {
                filename: "node:internal/process/task_queues",
                function: "processTicksAndRejections",
                in_app: false,
                vars: { tenantId: "ten_1" },
              },
            ],
          },
        },
      ],
    },
  };
}

describe("stripFrameVars — the Sentry beforeSend clinical-payload scrubber", () => {
  it("removes vars from every frame of every exception", () => {
    const scrubbed = stripFrameVars(eventWithFrameVars());

    const frames = scrubbed.exception?.values?.[0]?.stacktrace?.frames ?? [];
    expect(frames).toHaveLength(3);

    for (const frame of frames) {
      expect(frame).not.toHaveProperty("vars");
    }
  });

  it("strips out-of-app frames too, not just in_app ones", () => {
    const scrubbed = stripFrameVars(eventWithFrameVars());
    const outOfApp = scrubbed.exception?.values?.[0]?.stacktrace?.frames?.find(
      (frame) => frame.in_app === false,
    );

    expect(outOfApp).toBeDefined();
    expect(outOfApp).not.toHaveProperty("vars");
  });

  it("leaves no trace of the clinical payload anywhere in the serialised event", () => {
    const serialised = JSON.stringify(stripFrameVars(eventWithFrameVars()));

    expect(serialised).not.toContain("_aiIngestionRaw");
    expect(serialised).not.toContain("dor lombar");
    expect(serialised).not.toContain("Maria Silva");
    expect(serialised).not.toContain("vars");
  });

  it("preserves the frame fields the stack trace is actually for", () => {
    const scrubbed = stripFrameVars(eventWithFrameVars());
    const frame = scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0];

    expect(frame?.filename).toBe("app:///lib/clinical/review.ts");
    expect(frame?.function).toBe("claimForReview");
    expect(frame?.in_app).toBe(true);
    expect(scrubbed.exception?.values?.[0]?.type).toBe("ClinicalError");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("not_under_review");
  });

  it("handles events with no exception, no stacktrace and no frames", () => {
    expect(() => stripFrameVars({ type: undefined })).not.toThrow();
    expect(() =>
      stripFrameVars({ type: undefined, exception: { values: [] } }),
    ).not.toThrow();
    expect(() =>
      stripFrameVars({
        type: undefined,
        exception: { values: [{ type: "Error" }] },
      }),
    ).not.toThrow();
    expect(() =>
      stripFrameVars({
        type: undefined,
        exception: { values: [{ type: "Error", stacktrace: {} }] },
      }),
    ).not.toThrow();
  });

  it("returns the event so it can be used directly as beforeSend", () => {
    const event = eventWithFrameVars();

    expect(stripFrameVars(event)).toBe(event);
  });
});
