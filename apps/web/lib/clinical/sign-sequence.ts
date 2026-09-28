/**
 * SIGN-CONFIRM-AND-SAVE-FIRST: the order a sign runs in, kept free of React so
 * it can be tested in the node environment with a fake save and a fake sign.
 *
 * THE DEFECT IT CLOSES (found by the guide writers, owner: "fix right away").
 * "Assinar e bloquear" on a registo and "Finalizar (assinar e bloquear)" on
 * Revisao Consulta each sat in a form of their own, apart from the record form,
 * and RecordForm has no autosave. One press signed the row as the database held
 * it, with no confirmation, so anything typed and not saved was left out of the
 * signed registo. A signed registo is immutable
 * (clinical_records_enforce_immutability, never bypassed): those edits could
 * never be added afterwards, only re-typed into an addendum.
 *
 * ONE RUN PER CONFIRM:
 *   1. A run that is in flight, or one that has signed, turns every further
 *      confirm into a no-op. The latch is taken synchronously, before the first
 *      await, so two clicks in the same tick still start ONE run.
 *   2. When the form holds unsaved changes they are SAVED FIRST, through the
 *      form's own save path, and the sign waits for that save's RESPONSE. A save
 *      that did not succeed ends the run: nothing is signed, and the save's
 *      result goes back to the caller to show.
 *   3. The sign is sent once, with the fingerprint of the content the form last
 *      loaded or saved (the one the save returned, when step 2 ran). The server
 *      signs only while the stored content still has that fingerprint, so a save
 *      from another tab or another person in between is refused, never signed
 *      unseen.
 * A sign that throws releases the latch and rethrows. The server actions end in
 * a redirect, which Next reports to a programmatic caller as a rejection; the
 * caller hands it on so the route's boundary handles it, as it did for the form.
 */

/** The part of a save action's result the sequence reads. */
export type SignSaveResult = {
  ok: boolean;
  /** Fingerprint of the stored content after the save (see `isDataHash`). */
  dataHash?: string;
};

export type SignSequenceSteps<R extends SignSaveResult> = {
  /** True when the form holds content the database does not. Read at confirm time. */
  isDirty: () => boolean;
  /**
   * Submit the form through its existing save path and resolve with that save's
   * result, or with null when the save threw.
   */
  save: () => Promise<R | null>;
  /** The fingerprint of the content the form last loaded or saved. */
  currentDataHash: () => string;
  /** Sign (or finalize), naming the fingerprint of the content it may sign. */
  sign: (expectedDataHash: string) => Promise<void>;
};

export type SignSequenceOutcome<R extends SignSaveResult> =
  /** A run was already in flight, or has signed: nothing was called. */
  | { kind: "ignored" }
  /** The save did not succeed (`result` is null when it threw): nothing was signed. */
  | { kind: "save_failed"; result: R | null }
  /** The sign resolved. */
  | { kind: "signed" };

export type SignSequence = {
  /** True from the moment a run starts until it fails; stays true after a sign. */
  readonly busy: boolean;
  run<R extends SignSaveResult>(steps: SignSequenceSteps<R>): Promise<SignSequenceOutcome<R>>;
};

export function createSignSequence(): SignSequence {
  let phase: "idle" | "running" | "signed" = "idle";
  return {
    get busy() {
      return phase !== "idle";
    },
    async run<R extends SignSaveResult>(
      steps: SignSequenceSteps<R>,
    ): Promise<SignSequenceOutcome<R>> {
      if (phase !== "idle") return { kind: "ignored" };
      phase = "running";
      try {
        let expected = steps.currentDataHash();
        if (steps.isDirty()) {
          const saved = await steps.save();
          if (!saved || !saved.ok) {
            phase = "idle";
            return { kind: "save_failed", result: saved };
          }
          // A save that reports success without a fingerprint leaves the
          // pre-save one in place, which the server then refuses as stale:
          // the safe direction, nothing unseen is signed.
          if (saved.dataHash) expected = saved.dataHash;
        }
        await steps.sign(expected);
        phase = "signed";
        return { kind: "signed" };
      } catch (error) {
        phase = "idle";
        throw error;
      }
    },
  };
}

/**
 * The fingerprint's shape: the lowercase hex md5 Postgres returns for
 * `md5(data::text)`. A server action validates the client's value with this
 * before it reaches a query.
 */
export function isDataHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/**
 * Canonical JSON form of a record `data` value: object keys sorted, `undefined`
 * members dropped and `undefined` array items as null, which is what
 * JSON.stringify sends to the server. Two values that save to the same content
 * canonicalise to the same string.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : canonical(item)));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const member = (value as Record<string, unknown>)[key];
      if (member !== undefined) out[key] = canonical(member);
    }
    return out;
  }
  return value;
}

/**
 * True when two record `data` values would save as the same content. Key order
 * does not count; array order does. Used to tell whether the form holds unsaved
 * changes, so a false "changed" costs one extra save and a false "unchanged"
 * would lose an edit: this errs only toward the first.
 */
export function sameRecordData(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
