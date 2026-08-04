/**
 * The parts of redemption that are decidable without a database: the per-offset
 * action matrix (counsel s5) and the token-hash discipline (counsel s6).
 *
 * The transactional guarantees - action and consumption committing together,
 * append-only enforcement, single use - are NOT here and cannot be: they are
 * properties of Postgres, not of TypeScript, and asserting them against a mock
 * would prove only that the mock agrees with itself. They live in
 * packages/db/tests/patient-audit-append-only.test.ts, which runs against a real
 * database in the DB-gated job.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { actionsForScope, tokenHash, isUniqueViolation, CANCEL_CUTOFF_HOURS } from "./redeem";
import { CANCELLATION_CUTOFF_HOURS } from "../../../../apps/api/lib/appointments/cutoff";

describe("the per-offset action matrix (counsel s5)", () => {
  it("gives the 48h email link confirm AND cancel", () => {
    expect([...actionsForScope("confirm_cancel")]).toEqual(["confirm", "cancel"]);
  });

  it("gives the 24h SMS link confirm ONLY", () => {
    // It arrives at or inside the clinic's 24h cancel cutoff, where cancelling
    // is no longer permitted. This is the assertion behind the loop's
    // "the 24h SMS token cannot cancel even if the request asks for cancel":
    // the scope check runs before any database contact, so a request naming
    // "cancel" on a confirm-scoped token is refused outright.
    expect([...actionsForScope("confirm")]).toEqual(["confirm"]);
    expect(actionsForScope("confirm")).not.toContain("cancel");
  });
});

describe("token hashing (counsel s6 - the hash, never the token)", () => {
  const TOKEN = "eyJ0IjoiYWJjIiwiYSI6ImRlZiIsImV4cCI6MSwicyI6ImNvbmZpcm0ifQ.c2ln";

  it("is sha256 hex, the exact shape the DB CHECK admits", () => {
    expect(tokenHash(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches a plain sha256 of the token, with no salt or truncation", () => {
    expect(tokenHash(TOKEN)).toBe(
      createHash("sha256").update(TOKEN).digest("hex"),
    );
  });

  it("never contains the token", () => {
    expect(tokenHash(TOKEN)).not.toContain(TOKEN.slice(0, 12));
  });

  it("is stable, so the same token always finds its own consumption row", () => {
    expect(tokenHash(TOKEN)).toBe(tokenHash(TOKEN));
  });

  it("separates two tokens differing by one character", () => {
    expect(tokenHash(TOKEN)).not.toBe(tokenHash(TOKEN + "x"));
  });
});

describe("the cutoff constant does not drift from the appointments module", () => {
  it("matches CANCELLATION_CUTOFF_HOURS in apps/api", () => {
    // apps/web does not import from apps/api at runtime - separate deployables -
    // so the value is duplicated. This assertion is what makes the duplication
    // safe: change one and CI goes red rather than the two silently disagreeing
    // about when a patient may still cancel.
    expect(CANCEL_CUTOFF_HOURS).toBe(CANCELLATION_CUTOFF_HOURS);
  });
});

describe("already-consumed detection", () => {
  it("recognises a unique violation at the top level", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognises one wrapped in a cause, as drivers often surface it", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("does not mistake another error for one", () => {
    // A foreign-key violation, a connection drop or an arbitrary throw must NOT
    // read as "already consumed": that would report a genuine failure to the
    // patient as the same opaque refusal and hide it from the operator.
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("connection terminated"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
