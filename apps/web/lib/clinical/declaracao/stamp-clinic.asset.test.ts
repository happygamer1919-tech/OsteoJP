import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// R45: "until the stamp asset arrives, the Declaração is unavailable". What
// decides is the ASSET. A clinic the resolver's table names, whose carimbo slot
// is empty, has nothing to print and so resolves to no key at all. Both real
// slots are filled, so that case cannot be seen with the real assets: here the
// asset module is replaced by one in which Linda-a-Velha's slot is empty and
// Castelo Branco's is not.
vi.mock("./signature-stamp-asset", () => ({
  signatureStampBytesForLocation: (key: string | null) =>
    key === "castelo-branco" ? new Uint8Array([1, 2, 3]) : null,
}));

import { resolveStampLocationKey } from "./declaracao-model";
import { resolveStampClinicKey } from "./stamp-clinic";

describe("a clinic the table names, with an EMPTY carimbo slot, is not a clinic with a stamp", () => {
  it.each(["OsteoJP (LV)", "Linda-a-Velha", "osteojp (lv)"])("%s resolves to no key", (name) => {
    expect(resolveStampClinicKey(name)).toBeNull();
    expect(resolveStampLocationKey({ name, address: null, phone: null })).toBeNull();
  });

  it.each(["OsteoJP (CB)", "Castelo Branco"])("%s, whose slot is filled, still resolves", (name) => {
    expect(resolveStampClinicKey(name)).toBe("castelo-branco");
  });
});
