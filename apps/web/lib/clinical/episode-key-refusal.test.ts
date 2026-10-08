import { describe, expect, it } from "vitest";

import { EPISODE_PATIENT_TENANT_KEY, isEpisodeKeyRefusal, refusingForeignKey } from "./episode-key-refusal";

/**
 * REG-03: which errors are the database's refusal of a registo's episode. The
 * shapes below are the ones the drivers raise (`code` with `constraint_name`
 * on postgres.js, `code` with `constraint` on node-postgres) and the one
 * Drizzle wraps them in (a `Failed query` error with neither field, the
 * driver's error at `.cause`). The wrapped shape is pinned against the real
 * driver in records.episode-guard.db.test.ts.
 */
const pgError = (code: string, constraintName?: string) =>
  Object.assign(new Error("a driver message that is never read"), {
    code,
    ...(constraintName === undefined ? {} : { constraint_name: constraintName }),
  });
/** The shape Drizzle raises: its own error, the driver's at `.cause`. */
const wrapped = (cause: unknown) => new Error("Failed query: insert into clinical_records", { cause });

const OTHER_KEY = "clinical_records_form_template_id_form_templates_id_fk";

describe("isEpisodeKeyRefusal: the foreign-key refusal that names the episode key", () => {
  it("the driver's own error (the outer error carries both fields)", () => {
    expect(isEpisodeKeyRefusal(pgError("23503", EPISODE_PATIENT_TENANT_KEY))).toBe(true);
  });

  it("wrapped once, as Drizzle raises it: the outer error carries neither field, the cause both", () => {
    const e = wrapped(pgError("23503", EPISODE_PATIENT_TENANT_KEY));
    expect((e as { code?: unknown }).code).toBeUndefined();
    expect(isEpisodeKeyRefusal(e)).toBe(true);
  });

  it("wrapped twice", () => {
    expect(isEpisodeKeyRefusal(wrapped(wrapped(pgError("23503", EPISODE_PATIENT_TENANT_KEY))))).toBe(true);
  });

  it("node-postgres names the constraint in `constraint`", () => {
    const e = Object.assign(new Error("x"), { code: "23503", constraint: EPISODE_PATIENT_TENANT_KEY });
    expect(isEpisodeKeyRefusal(wrapped(e))).toBe(true);
  });

  it("ANOTHER SQLSTATE naming the same key is not it (a check, unique or exclusion violation, a raised exception)", () => {
    for (const code of ["23514", "23505", "23P01", "23502", "P0001", "42501"]) {
      expect(isEpisodeKeyRefusal(pgError(code, EPISODE_PATIENT_TENANT_KEY)), code).toBe(false);
      expect(isEpisodeKeyRefusal(wrapped(pgError(code, EPISODE_PATIENT_TENANT_KEY))), code).toBe(false);
    }
  });

  it("THE SAME SQLSTATE naming another foreign key of the table is not it", () => {
    for (const name of [
      OTHER_KEY,
      "clinical_records_episode_id_clinical_episodes_id_fk",
      "clinical_records_patient_id_patients_id_fk",
      `${EPISODE_PATIENT_TENANT_KEY}_2`,
      `x_${EPISODE_PATIENT_TENANT_KEY}`,
    ]) {
      expect(isEpisodeKeyRefusal(wrapped(pgError("23503", name))), name).toBe(false);
    }
  });

  it("a foreign-key violation that names no constraint is not it", () => {
    expect(isEpisodeKeyRefusal(wrapped(pgError("23503")))).toBe(false);
    expect(isEpisodeKeyRefusal(wrapped(pgError("23503", "")))).toBe(false);
  });

  it("the key's name in the MESSAGE alone is not it: the message is never read", () => {
    const e = Object.assign(new Error(`violates foreign key constraint "${EPISODE_PATIENT_TENANT_KEY}"`), { code: "23514" });
    expect(isEpisodeKeyRefusal(e)).toBe(false);
    expect(isEpisodeKeyRefusal(new Error(EPISODE_PATIENT_TENANT_KEY))).toBe(false);
  });

  it("the two fields on DIFFERENT layers are not it: one layer must carry both", () => {
    const e = Object.assign(wrapped(pgError("23503")), { constraint_name: EPISODE_PATIENT_TENANT_KEY });
    expect(isEpisodeKeyRefusal(e)).toBe(false);
  });

  it("anything that is not an error chain is not it", () => {
    for (const e of [null, undefined, "23503", 23503, {}, new Error("db down"), { cause: null }]) {
      expect(isEpisodeKeyRefusal(e)).toBe(false);
    }
  });

  it("a `cause` that points at itself ends, and a refusal deeper than the walk is not found", () => {
    const loop = new Error("loop") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isEpisodeKeyRefusal(loop)).toBe(false);
    let deep: unknown = pgError("23503", EPISODE_PATIENT_TENANT_KEY);
    for (let i = 0; i < 4; i++) deep = wrapped(deep);
    expect(isEpisodeKeyRefusal(deep)).toBe(false);
  });
});

describe("refusingForeignKey: the name of the key that refused, from the layer that carries the violation", () => {
  it("names the key of a wrapped foreign-key violation, whichever key it is", () => {
    expect(refusingForeignKey(wrapped(pgError("23503", OTHER_KEY)))).toBe(OTHER_KEY);
    expect(refusingForeignKey(wrapped(pgError("23503", EPISODE_PATIENT_TENANT_KEY)))).toBe(EPISODE_PATIENT_TENANT_KEY);
  });

  it("a violation layer that names no constraint is passed over: the name is read from the layer that carries both", () => {
    const unnamedOuter = Object.assign(wrapped(pgError("23503", OTHER_KEY)), { code: "23503" });
    expect(refusingForeignKey(unnamedOuter)).toBe(OTHER_KEY);
    const emptyOuter = Object.assign(wrapped(pgError("23503", EPISODE_PATIENT_TENANT_KEY)), { code: "23503", constraint_name: "" });
    expect(isEpisodeKeyRefusal(emptyOuter)).toBe(true);
  });

  it("is null for another SQLSTATE, for no constraint name, and for no error", () => {
    expect(refusingForeignKey(wrapped(pgError("23505", OTHER_KEY)))).toBeNull();
    expect(refusingForeignKey(wrapped(pgError("23503")))).toBeNull();
    expect(refusingForeignKey(null)).toBeNull();
  });
});
