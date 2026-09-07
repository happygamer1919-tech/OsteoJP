import { describe, expect, it } from "vitest";

import {
  canChangePackSessionCount,
  sessionCountBlockedReason,
} from "./pack-session-count";

/**
 * PACK-07 — the decision, pinned in both directions.
 *
 * THE ARM THAT MATTERS IS THE ONE THAT ALLOWS. A guard that refused every save
 * on a held pacote would be trivially "safe" and would stop an admin correcting
 * a price on the clinic's most-sold product. The predicate is about the CHANGE,
 * not about the pacote, and these cases are what hold that distinction.
 */
describe("canChangePackSessionCount", () => {
  it("allows any change on a pacote NOBODY holds", () => {
    expect(canChangePackSessionCount({ current: 5, requested: 10, heldBy: 0 })).toBe(true);
    expect(canChangePackSessionCount({ current: 10, requested: 5, heldBy: 0 })).toBe(true);
  });

  it("REFUSES a change once a single patient holds it", () => {
    expect(canChangePackSessionCount({ current: 5, requested: 10, heldBy: 1 })).toBe(false);
  });

  it("refuses a DOWNGRADE too, not only the 5-to-10 case", () => {
    // The card is about an upgrade because that is how it gets attempted, but
    // the defect is the direction-blind one: the catalogue and the holder's
    // snapshot stop agreeing either way.
    expect(canChangePackSessionCount({ current: 10, requested: 5, heldBy: 2 })).toBe(false);
  });

  it("ALLOWS a no-op save on a held pacote - this is what keeps every other field editable", () => {
    // The whole row posts together. Refusing an unchanged number would refuse a
    // price correction, a rename and a location change on the clinic's most-sold
    // pacote, which is a real thing they do and a guard that would be worked
    // around rather than obeyed.
    expect(canChangePackSessionCount({ current: 5, requested: 5, heldBy: 3 })).toBe(true);
  });

  it("counts EVERY instance, with no balance or status condition", () => {
    // Deliberately the same rule as the hard-delete blocker, which counts any
    // `patient_pack_instances` row. Two guards on one relationship that
    // disagreed about which rows count is exactly how PACK-04 got in - delete
    // guarded, archive open. The predicate takes a COUNT precisely so there is
    // no second place to express "which instances".
    expect(canChangePackSessionCount({ current: 5, requested: 10, heldBy: 1 })).toBe(false);
    expect(canChangePackSessionCount({ current: 5, requested: 10, heldBy: 99 })).toBe(false);
  });
});

describe("sessionCountBlockedReason", () => {
  it("names the movement and the count, which is what an admin needs to act", () => {
    const reason = sessionCountBlockedReason({ current: 5, requested: 10, heldBy: 3 });
    expect(reason).toContain("5 -> 10");
    expect(reason).toContain("3 patient pack instance");
    // The instruction, not only the refusal.
    expect(reason.toLowerCase()).toContain("create a separate pacote");
  });

  it("carries NO patient names - Administração > Serviços is not a patient surface", () => {
    // A deliberate divergence from PACK-04, which names the pacotes it protects.
    // The things in the way here are people, and a count answers the admin's
    // question without disclosing who bought what on a catalogue screen.
    const reason = sessionCountBlockedReason({ current: 5, requested: 10, heldBy: 2 });
    expect(reason).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/);
  });
});
