import { describe, expect, it } from "vitest";

import { DEADLOCK_DETECTED, isDeadlockVictim, sqlStateOf } from "./sql-state";

/**
 * The subject is NOT "does it find the code" — it is "can anything else get
 * out". The helper exists so a webhook can log WHY a write failed without
 * logging WHAT it was writing, and every case below is a way that could leak.
 */
describe("sqlStateOf", () => {
  it("returns the SQLSTATE a driver error carries", () => {
    expect(sqlStateOf(Object.assign(new Error("insert failed"), { code: "23505" }))).toBe("23505");
  });

  it("walks one `cause`, because a driver error is routinely wrapped once", () => {
    const wrapped = new Error("write failed", {
      cause: Object.assign(new Error("duplicate key"), { code: "23514" }),
    });
    expect(sqlStateOf(wrapped)).toBe("23514");
  });

  it("prefers the outer code when both carry one", () => {
    const wrapped = Object.assign(
      new Error("outer", { cause: Object.assign(new Error("inner"), { code: "23514" }) }),
      { code: "40001" },
    );
    expect(sqlStateOf(wrapped)).toBe("40001");
  });

  it("is `unknown` for an error with no code at all", () => {
    expect(sqlStateOf(new Error("db down"))).toBe("unknown");
  });

  it("is `unknown` for a non-Error, including null and a bare string", () => {
    expect(sqlStateOf(null)).toBe("unknown");
    expect(sqlStateOf("23505")).toBe("unknown");
    expect(sqlStateOf(undefined)).toBe("unknown");
  });

  /**
   * THE ONE THAT MATTERS. A `code` that is not a five-character SQLSTATE is
   * some other library's idea of a code, and it is free-form: this is the gate
   * that stops an arbitrary string reaching a log line through the field the
   * caller believes is five characters wide.
   */
  it("refuses a `code` that is not a five-character SQLSTATE", () => {
    for (const code of [
      "ECONNREFUSED",
      "23",
      "235051",
      "23-05",
      "2350a",
      "a patient wrote this",
      "",
    ]) {
      expect(sqlStateOf(Object.assign(new Error("x"), { code })), code).toBe("unknown");
    }
  });

  it("refuses a non-string code rather than stringifying it", () => {
    expect(sqlStateOf(Object.assign(new Error("x"), { code: 23505 }))).toBe("unknown");
  });

  /**
   * THE NODE ERRNOS THAT ARE EXACTLY FIVE CHARACTERS. `ECONNREFUSED` is long
   * enough that the length check refuses it; these are not, so nothing but the
   * leading `E` keeps them out - and a Node errno reported as a SQLSTATE sends
   * an operator to look up a PostgreSQL class that does not exist while the
   * real fault was a socket or a file descriptor. Every Node errno begins with
   * `E` and no PostgreSQL class does, which is the whole of the rule. `E2BIG`
   * is in the list on purpose: it is the one five-character errno whose
   * remaining characters are not all letters, so it survives any rule written
   * as "E plus four letters".
   */
  it("refuses a five-character Node errno, which is not a SQLSTATE", () => {
    for (const code of [
      "EPIPE",
      "EPERM",
      "EBUSY",
      "EINTR",
      "EBADF",
      "ELOOP",
      "ENXIO",
      "EROFS",
      "EXDEV",
      "ETIME",
      "EIDRM",
      "E2BIG",
    ]) {
      expect(sqlStateOf(Object.assign(new Error("x"), { code })), code).toBe("unknown");
    }
  });

  /**
   * THE CONTROL FOR THE ARM ABOVE, because a rule aimed at Node can be
   * tightened into one that also rejects real codes - "it must start with a
   * digit" is the obvious one, and it is WRONG. PostgreSQL's Appendix A defines
   * the classes `F0`, `HV`, `P0` and `XX` alongside the numeric ones, and
   * `P0001` is what every `RAISE EXCEPTION` with no ERRCODE carries, `P0002`
   * what `0005_patient_merge_multilocation.sql` raises by name and
   * `lib/patients/actions.ts` branches on. Every code below is live PostgreSQL
   * and every one of them must survive.
   */
  it("still returns a real SQLSTATE from every class shape", () => {
    for (const code of [
      "00000",
      "23505",
      "23514",
      "40001",
      "42P01",
      "42883",
      "53300",
      "57014",
      "P0001",
      "P0002",
      "P0003",
      "P0004",
      "XX000",
      "XX001",
      "XX002",
      "F0000",
      "HV000",
    ]) {
      expect(sqlStateOf(Object.assign(new Error("x"), { code })), code).toBe(code);
    }
  });
});

/**
 * M-4. Which errors are a deadlock victim's. The wrapped shape is the one
 * Drizzle raises (its own error, the driver's at `.cause`); it is pinned
 * against a real deadlock on the real driver in
 * lib/clinical/deadlock-victim.db.test.ts.
 */
describe("isDeadlockVictim", () => {
  const driver = (code: unknown) => Object.assign(new Error("a driver message that is never read"), { code });
  const wrapped = (cause: unknown) => new Error("Failed query: insert into clinical_records", { cause });

  it("the SQLSTATE is 40P01", () => {
    expect(DEADLOCK_DETECTED).toBe("40P01");
  });

  it("wrapped once, as Drizzle raises it: the outer error carries no SQLSTATE, the cause carries 40P01", () => {
    const e = wrapped(driver("40P01"));
    expect((e as { code?: unknown }).code).toBeUndefined();
    expect(isDeadlockVictim(e)).toBe(true);
  });

  it("the driver's own error, with 40P01 on the outer error", () => {
    expect(isDeadlockVictim(driver("40P01"))).toBe(true);
  });

  it("CONTROL: every other SQLSTATE is not it, wrapped or not", () => {
    // 40001 is the same class (transaction rollback) and a different refusal.
    for (const code of ["23503", "23505", "23514", "40001", "55P03", "57014", "P0001", "P0002", "XX000"]) {
      expect(isDeadlockVictim(driver(code)), code).toBe(false);
      expect(isDeadlockVictim(wrapped(driver(code))), code).toBe(false);
    }
  });

  it("CONTROL: an error with no SQLSTATE, a code that is not text, and a value that is not an error are not it", () => {
    expect(isDeadlockVictim(new Error("deadlock detected"))).toBe(false);
    expect(isDeadlockVictim(wrapped(new Error("deadlock detected")))).toBe(false);
    expect(isDeadlockVictim(driver(40))).toBe(false);
    for (const v of [null, undefined, "40P01", {}, []]) expect(isDeadlockVictim(v)).toBe(false);
  });

  it("an outer SQLSTATE answers before the cause: a wrapper with a code of its own is not looked behind", () => {
    const e = Object.assign(new Error("outer", { cause: driver("40P01") }), { code: "23503" });
    expect(isDeadlockVictim(e)).toBe(false);
  });
});
