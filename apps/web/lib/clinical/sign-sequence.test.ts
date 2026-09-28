/**
 * sign-sequence.test.ts: SIGN-CONFIRM-AND-SAVE-FIRST, the order a sign runs in.
 *
 * The sequence is pure, so the save and the sign here are fakes that record
 * every call. The four cases the acceptance names come first (unsaved -> save
 * then sign; save fails -> no sign; clean -> sign only; double confirm -> one
 * sign), then the edges that keep those four true.
 */
import { describe, expect, it } from "vitest";

import {
  createSignSequence,
  isDataHash,
  sameRecordData,
  type SignSaveResult,
  type SignSequenceSteps,
} from "./sign-sequence";

const LOADED = "0".repeat(32);
const SAVED = "a".repeat(32);

/** A promise the test settles by hand, to hold a step in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Fake steps with a call log. `save` and `sign` can be replaced per test. */
function fakeSteps(over: Partial<SignSequenceSteps<SignSaveResult>> & { dirty?: boolean } = {}) {
  const log: string[] = [];
  const signedWith: string[] = [];
  const steps: SignSequenceSteps<SignSaveResult> = {
    isDirty: over.isDirty ?? (() => over.dirty ?? false),
    currentDataHash: over.currentDataHash ?? (() => LOADED),
    save:
      over.save ??
      (async () => {
        log.push("save");
        return { ok: true, dataHash: SAVED };
      }),
    sign: async (expected) => {
      log.push("sign");
      signedWith.push(expected);
      if (over.sign) await over.sign(expected);
    },
  };
  return { steps, log, signedWith };
}

describe("the four cases the acceptance names", () => {
  it("unsaved changes: the save runs first, and the sign starts only after the save's response", async () => {
    const save = deferred<SignSaveResult | null>();
    const log: string[] = [];
    const signedWith: string[] = [];
    const sequence = createSignSequence();

    const run = sequence.run({
      isDirty: () => true,
      currentDataHash: () => LOADED,
      save: () => {
        log.push("save");
        return save.promise;
      },
      sign: async (expected) => {
        log.push("sign");
        signedWith.push(expected);
      },
    });

    // The save is in flight: nothing has been signed yet, however long it takes.
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["save"]);

    save.resolve({ ok: true, dataHash: SAVED });
    await expect(run).resolves.toEqual({ kind: "signed" });
    expect(log).toEqual(["save", "sign"]);
    // The sign names the content the save wrote, not the content first loaded.
    expect(signedWith).toEqual([SAVED]);
  });

  it("the save fails: nothing is signed, and the save's result comes back to be shown", async () => {
    const failure = { ok: false, code: "validation" };
    const { steps, log } = fakeSteps({
      dirty: true,
      save: async () => {
        log.push("save");
        return failure;
      },
    });
    const outcome = await createSignSequence().run(steps);
    expect(outcome).toEqual({ kind: "save_failed", result: failure });
    expect(log).toEqual(["save"]);
  });

  it("no unsaved changes: it signs directly with the loaded fingerprint, and never saves", async () => {
    const { steps, log, signedWith } = fakeSteps({ dirty: false });
    await expect(createSignSequence().run(steps)).resolves.toEqual({ kind: "signed" });
    expect(log).toEqual(["sign"]);
    expect(signedWith).toEqual([LOADED]);
  });

  it("a double confirm signs once: the second run, started in the same tick, is ignored", async () => {
    const { steps, log } = fakeSteps({ dirty: true });
    const sequence = createSignSequence();
    const first = sequence.run(steps);
    const second = sequence.run(steps);
    await expect(second).resolves.toEqual({ kind: "ignored" });
    await expect(first).resolves.toEqual({ kind: "signed" });
    expect(log).toEqual(["save", "sign"]);
  });
});

describe("the edges that keep those four true", () => {
  it("a confirm while the SIGN is in flight is ignored too, not only one during the save", async () => {
    const sign = deferred<void>();
    const { steps, log } = fakeSteps({ dirty: false, sign: () => sign.promise });
    const sequence = createSignSequence();
    const first = sequence.run(steps);
    await Promise.resolve();
    expect(log).toEqual(["sign"]);
    expect(sequence.busy).toBe(true);
    await expect(sequence.run(steps)).resolves.toEqual({ kind: "ignored" });
    sign.resolve();
    await first;
    expect(log).toEqual(["sign"]);
  });

  it("after a sign, every further confirm is ignored", async () => {
    const { steps, log } = fakeSteps({ dirty: false });
    const sequence = createSignSequence();
    await sequence.run(steps);
    await expect(sequence.run(steps)).resolves.toEqual({ kind: "ignored" });
    expect(log).toEqual(["sign"]);
    expect(sequence.busy).toBe(true);
  });

  it("a save that THREW (resolved as null) signs nothing", async () => {
    const { steps, log } = fakeSteps({
      dirty: true,
      save: async () => {
        log.push("save");
        return null;
      },
    });
    await expect(createSignSequence().run(steps)).resolves.toEqual({
      kind: "save_failed",
      result: null,
    });
    expect(log).toEqual(["save"]);
  });

  it("a failed save releases the latch: the next confirm saves again, then signs", async () => {
    let attempt = 0;
    const { steps, log } = fakeSteps({
      dirty: true,
      save: async () => {
        log.push("save");
        attempt += 1;
        return attempt === 1 ? { ok: false } : { ok: true, dataHash: SAVED };
      },
    });
    const sequence = createSignSequence();
    await expect(sequence.run(steps)).resolves.toMatchObject({ kind: "save_failed" });
    expect(sequence.busy).toBe(false);
    await expect(sequence.run(steps)).resolves.toEqual({ kind: "signed" });
    expect(log).toEqual(["save", "save", "sign"]);
  });

  it("a sign that rejects (the redirect Next reports) is rethrown, sent once, and releases the latch", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/x;307;" });
    const { steps, log } = fakeSteps({
      dirty: true,
      sign: async () => {
        throw redirect;
      },
    });
    const sequence = createSignSequence();
    await expect(sequence.run(steps)).rejects.toBe(redirect);
    expect(log).toEqual(["save", "sign"]);
    expect(sequence.busy).toBe(false);
  });

  it("dirtiness is read when the run starts, not when the sequence is created", async () => {
    let dirty = false;
    const { steps, log } = fakeSteps({ isDirty: () => dirty });
    const sequence = createSignSequence();
    dirty = true;
    await sequence.run(steps);
    expect(log).toEqual(["save", "sign"]);
  });

  it("a successful save without a fingerprint keeps the loaded one, which the server refuses as stale", async () => {
    const { steps, signedWith } = fakeSteps({ dirty: true, save: async () => ({ ok: true }) });
    await createSignSequence().run(steps);
    expect(signedWith).toEqual([LOADED]);
  });
});

describe("isDataHash: the shape a server action accepts", () => {
  it("accepts a lowercase hex md5", () => {
    expect(isDataHash("d41d8cd98f00b204e9800998ecf8427e")).toBe(true);
  });
  it.each([undefined, null, 42, "", "D41D8CD98F00B204E9800998ECF8427E", "d41d8cd98f00b204e9800998ecf8427", "d41d8cd98f00b204e9800998ecf8427e0", "g".repeat(32), "' or 1=1 --"])(
    "refuses %j",
    (value) => {
      expect(isDataHash(value)).toBe(false);
    },
  );
});

describe("sameRecordData: does the form hold unsaved changes", () => {
  it("key order does not count, at any depth", () => {
    expect(sameRecordData({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });
  it("a changed value counts", () => {
    expect(sameRecordData({ consultation_reason: "" }, { consultation_reason: "dor" })).toBe(false);
  });
  it("a value typed and then removed again is unchanged", () => {
    expect(sameRecordData({ consultation_reason: "dor" }, { consultation_reason: "dor" })).toBe(true);
  });
  it("a key added with an empty value counts as a change (errs toward saving)", () => {
    expect(sameRecordData({}, { consultation_reason: "" })).toBe(false);
  });
  it("an undefined member is the same as an absent one, as it is once sent as JSON", () => {
    expect(sameRecordData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
  it("array order counts (bodychart markers are placed in order)", () => {
    expect(sameRecordData({ m: [{ x: 1 }, { x: 2 }] }, { m: [{ x: 2 }, { x: 1 }] })).toBe(false);
  });
  it("a nested change inside an array counts", () => {
    expect(
      sameRecordData({ m: [{ marker_type: "pain_location", intensity: 7 }] }, { m: [{ marker_type: "pain_location", intensity: 8 }] }),
    ).toBe(false);
  });
  it("null and an absent key differ (a cleared number field saves as null)", () => {
    expect(sameRecordData({ weight_kg: null }, {})).toBe(false);
  });
});
