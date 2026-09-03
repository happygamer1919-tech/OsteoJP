import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";

import { downgradeValidationError, scrubEvent, stripFrameVars } from "./sentry-scrub";

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


/**
 * INC-nif-validationerror-at-the-desk — the severity downgrade.
 *
 * A `ValidationError` reaching Sentry is a typo at the desk, not an outage. The
 * cases below pin the three things that make the downgrade safe: it lowers
 * rather than drops, it matches on the class and not on the wording, and it
 * runs BESIDE the scrub instead of in place of it.
 */
function validationEvent(type = "ValidationError"): ErrorEvent {
  return {
    type: undefined,
    level: "error",
    exception: {
      values: [
        {
          type,
          value: "NIF inválido: o dígito de controlo não confere. Verifique os 9 dígitos.",
          stacktrace: {
            frames: [
              {
                filename: "app:///lib/patients/validation.ts",
                function: "resolveNif",
                in_app: true,
                vars: { rawNif: "123456780", fullName: "Maria Silva" },
              },
            ],
          },
        },
      ],
    },
  };
}

describe("downgradeValidationError — a typo at the desk is not an ERROR", () => {
  it("lowers a ValidationError to warning and tags it", () => {
    const out = downgradeValidationError(validationEvent());
    expect(out.level).toBe("warning");
    expect(out.tags?.operator_input).toBe("true");
  });

  it("DOES NOT DROP IT, so a path that starts throwing operator input again is visible", () => {
    // The fix is that createPatient and updatePatient RETURN their refusals. If
    // a future path throws one instead, this event is how anyone finds out - and
    // a dropped event and a fixed path look identical from the dashboard.
    expect(downgradeValidationError(validationEvent())).not.toBeNull();
  });

  it("leaves every other error at the level it arrived with", () => {
    const clinical = eventWithFrameVars();
    clinical.level = "error";
    const out = downgradeValidationError(clinical);
    expect(out.level).toBe("error");
    expect(out.tags?.operator_input).toBeUndefined();
  });

  it("matches on the CLASS, not on the message, so a copy change cannot unmatch it", () => {
    const e = validationEvent();
    e.exception!.values![0]!.value = "qualquer outra frase";
    expect(downgradeValidationError(e).level).toBe("warning");
  });

  it("does not match a different class that happens to mention validation", () => {
    expect(downgradeValidationError(validationEvent("ValidationErrorish")).level).toBe("error");
  });

  it("handles events with no exception and no values", () => {
    expect(() => downgradeValidationError({ type: undefined })).not.toThrow();
    expect(() =>
      downgradeValidationError({ type: undefined, exception: { values: [] } }),
    ).not.toThrow();
  });
});

describe("scrubEvent — the composed beforeSend: BOTH layers, never one", () => {
  it("strips frame vars from a ValidationError as well as downgrading it", () => {
    // The trap this test exists for: `beforeSend` takes ONE function, so adding
    // the downgrade to the config directly would have REPLACED the scrub, and
    // events would have kept arriving - unscrubbed, with nothing saying so.
    const out = scrubEvent(validationEvent());
    const frame = out.exception?.values?.[0]?.stacktrace?.frames?.[0];

    expect(frame).not.toHaveProperty("vars");
    expect(out.level).toBe("warning");
  });

  it("still strips frame vars on an event it does not downgrade", () => {
    const out = scrubEvent(eventWithFrameVars());
    const serialised = JSON.stringify(out);

    expect(serialised).not.toContain("_aiIngestionRaw");
    expect(serialised).not.toContain("Maria Silva");
    expect(out.level).toBeUndefined();
  });

  it("returns the event so it can be used directly as beforeSend", () => {
    const event = validationEvent();
    expect(scrubEvent(event)).toBe(event);
  });
});
