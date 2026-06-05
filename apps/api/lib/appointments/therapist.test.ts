import { describe, expect, it } from "vitest";
import { chooseTherapist, type TherapistCandidate } from "./therapist";

const c = (id: string, name: string): TherapistCandidate => ({
  practitionerId: id,
  sortKey: name,
});

describe("chooseTherapist (returning-patient soft preference)", () => {
  it("returns null when nobody is available", () => {
    expect(chooseTherapist([], "prior-1")).toBeNull();
  });

  it("prefers the prior therapist when they are available", () => {
    const available = [c("t-ana", "Ana"), c("t-rui", "Rui")];
    expect(chooseTherapist(available, "t-rui")).toBe("t-rui");
  });

  it("falls back to the first available (deterministic) when the prior is NOT available", () => {
    // prior t-zed is not in the available set → soft preference, not a hard rule.
    const available = [c("t-rui", "Rui"), c("t-ana", "Ana")];
    expect(chooseTherapist(available, "t-zed")).toBe("t-ana"); // Ana < Rui by sortKey
  });

  it("falls back to the first available when there is no prior therapist", () => {
    const available = [c("t-rui", "Rui"), c("t-ana", "Ana")];
    expect(chooseTherapist(available, null)).toBe("t-ana");
  });

  it("is deterministic regardless of input order (sortKey then id)", () => {
    const a = [c("t-rui", "Rui"), c("t-ana", "Ana"), c("t-bea", "Bea")];
    const b = [c("t-bea", "Bea"), c("t-ana", "Ana"), c("t-rui", "Rui")];
    expect(chooseTherapist(a, null)).toBe(chooseTherapist(b, null));
    expect(chooseTherapist(a, null)).toBe("t-ana");
  });
});
