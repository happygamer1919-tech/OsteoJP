import { describe, it, expect } from "vitest";

import {
  AUDIO_LIFECYCLE_MS,
  BACKOFF_FACTOR,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  RETRY_CEILING,
  backoffDelayMs,
  classifyFireStatus,
  hasReachedCeiling,
  isDue,
  worstCaseTotalDelayMs,
} from "./retry-policy";

// 0064 — the retry policy. Two properties here are the ones that go wrong
// silently: which HTTP answers count as delivered, and when to stop.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("backoff", () => {
  it("grows exponentially from BASE_DELAY_MS", () => {
    expect(backoffDelayMs(1)).toBe(BASE_DELAY_MS);
    expect(backoffDelayMs(2)).toBe(BASE_DELAY_MS * BACKOFF_FACTOR);
    expect(backoffDelayMs(3)).toBe(BASE_DELAY_MS * BACKOFF_FACTOR ** 2);
  });

  it("is capped at MAX_DELAY_MS so the tail cannot run away", () => {
    expect(backoffDelayMs(RETRY_CEILING)).toBe(MAX_DELAY_MS);
    // Uncapped, attempt 8 would be 5min * 3^7 = 182 hours — a week and a half,
    // by itself, on a recording the bucket deletes after seven days.
    expect(BASE_DELAY_MS * BACKOFF_FACTOR ** 7).toBeGreaterThan(AUDIO_LIFECYCLE_MS);
  });

  it("refuses an attemptCount it cannot mean, rather than returning a plausible delay", () => {
    // 0 is the value a caller reads if it passed attempt_count before the first
    // attempt was recorded. A silent 5 minutes there would be a wrong schedule
    // that looks exactly like a right one.
    expect(() => backoffDelayMs(0)).toThrow(RangeError);
    expect(() => backoffDelayMs(-1)).toThrow(RangeError);
    expect(() => backoffDelayMs(1.5)).toThrow(RangeError);
  });
});

describe("the ceiling is bounded by the audio lifecycle, not by taste", () => {
  it("every attempt happens while the recording still exists in the bucket", () => {
    // THE BOUND THAT MATTERS. The bucket auto-deletes after 7 days
    // (audio-storage.ts). Past that the object key still resolves and the
    // presigned GET still signs — the partner just fetches a 404. So the whole
    // schedule has to finish inside the lifecycle, with room to spare.
    expect(worstCaseTotalDelayMs()).toBeLessThan(AUDIO_LIFECYCLE_MS);
    // And with real margin, not by a minute: half the lifecycle.
    expect(worstCaseTotalDelayMs()).toBeLessThan(AUDIO_LIFECYCLE_MS / 2);
  });

  it("still gives the operator most of two days to fix a bad env var", () => {
    // The other direction: a ceiling so tight that a Friday-evening config
    // failure abandons every consultation before Monday would be its own bug.
    expect(worstCaseTotalDelayMs()).toBeGreaterThan(24 * HOUR);
  });

  it("stops at RETRY_CEILING attempts", () => {
    expect(hasReachedCeiling(RETRY_CEILING - 1)).toBe(false);
    expect(hasReachedCeiling(RETRY_CEILING)).toBe(true);
    expect(hasReachedCeiling(RETRY_CEILING + 1)).toBe(true);
  });
});

describe("isDue", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("is due immediately when the row has never been attempted", () => {
    // The persist landed and the process died before the fire. Nothing to wait for.
    expect(isDue({ attemptCount: 0, lastAttemptAt: null }, now)).toBe(true);
  });

  it("waits out the backoff, then fires", () => {
    expect(isDue({ attemptCount: 1, lastAttemptAt: ago(4 * MINUTE) }, now)).toBe(false);
    expect(isDue({ attemptCount: 1, lastAttemptAt: ago(5 * MINUTE) }, now)).toBe(true);
    expect(isDue({ attemptCount: 2, lastAttemptAt: ago(14 * MINUTE) }, now)).toBe(false);
    expect(isDue({ attemptCount: 2, lastAttemptAt: ago(15 * MINUTE) }, now)).toBe(true);
  });

  it("is NEVER due past the ceiling, however old the last attempt", () => {
    // Belt and braces against a lost needs_attention write: if such a row were
    // ever answered "due" it would retry forever, which is the one outcome the
    // ceiling exists to prevent.
    expect(isDue({ attemptCount: RETRY_CEILING, lastAttemptAt: ago(30 * 24 * HOUR) }, now)).toBe(false);
  });
});

describe("classifyFireStatus — agreed with the partner", () => {
  it("200 and 201 are delivered", () => {
    expect(classifyFireStatus(200)).toBe("delivered");
    expect(classifyFireStatus(201)).toBe("delivered");
  });

  it("409 IS DELIVERED, not an error", () => {
    // The one that looks wrong and is not. The partner keys on patient_id plus
    // both timestamps, all of which a retry re-sends verbatim, so a 409 means
    // the record already exists under a key only WE could have produced: an
    // earlier attempt of ours landed and its acknowledgement never came back.
    // Treating it as an error would re-fire on every tick, earn another 409
    // each time, and finally dump a DELIVERED consultation into needs_attention
    // for a human to go hunting for a recording that was never lost.
    expect(classifyFireStatus(409)).toBe("delivered");
  });

  it("everything else stays pending, including 4xx that an operator can fix", () => {
    // 401 = rotated x-make-apikey. Giving up on it would lose the consultation
    // over an env var.
    expect(classifyFireStatus(401)).toBe("retry");
    expect(classifyFireStatus(403)).toBe("retry");
    expect(classifyFireStatus(429)).toBe("retry");
    expect(classifyFireStatus(500)).toBe("retry");
    expect(classifyFireStatus(502)).toBe("retry");
    expect(classifyFireStatus(504)).toBe("retry");
  });

  it("does not treat every 2xx as delivered", () => {
    // res.ok would swallow these. Neither is an answer the partner sends, so if
    // one appears the scenario changed and staying pending surfaces that rather
    // than recording a delivery nobody made.
    expect(classifyFireStatus(202)).toBe("retry");
    expect(classifyFireStatus(204)).toBe("retry");
  });
});
