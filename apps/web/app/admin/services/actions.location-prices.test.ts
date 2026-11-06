/**
 * The per-location price grids (services and packs): a refused price is the
 * page's banner (`?m=err:invalid` / `?mp=err:invalid`) and nothing is written.
 *
 * Before the fix the prices were parsed BEFORE run()/runPack(), so "12." or
 * "abc" threw out of the server action and landed on global-error.tsx.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => ({ tenantId: "t-1", role: "admin", userId: "u-1" }),
}));

const setServiceLocationPrices = vi.fn(async () => {});
const setPackLocationPrices = vi.fn(async () => {});
vi.mock("@/lib/admin/services", () => ({
  createService: vi.fn(),
  deleteService: vi.fn(),
  setServiceActive: vi.fn(),
  setServiceLocationPrices: (...a: unknown[]) => (setServiceLocationPrices as (...x: unknown[]) => unknown)(...a),
  setServicePatientBookable: vi.fn(),
  updateService: vi.fn(),
}));
vi.mock("@/lib/admin/packs", () => ({
  createPack: vi.fn(),
  deletePack: vi.fn(),
  setPackActive: vi.fn(),
  setPackLocationPrices: (...a: unknown[]) => (setPackLocationPrices as (...x: unknown[]) => unknown)(...a),
  updatePack: vi.fn(),
  updatePackPrice: vi.fn(),
}));

const { setServiceLocationPricesAction, setPackLocationPricesAction } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** The URL the action redirected to; the action always ends in a redirect. */
const landing = async (p: Promise<void>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error("the action returned without redirecting");
};

beforeEach(() => {
  setServiceLocationPrices.mockClear();
  setPackLocationPrices.mockClear();
});

describe("services: per-location prices", () => {
  for (const bad of ["12.", ".5", "abc", "0x10", "1e3"]) {
    it(`"${bad}" lands on the banner (err:invalid) and writes nothing`, async () => {
      const url = await landing(
        setServiceLocationPricesAction(form({ serviceId: "s-1", price__l1: "40", price__l2: bad })),
      );
      expect(url).toBe("/admin/services?m=err:invalid");
      expect(setServiceLocationPrices).not.toHaveBeenCalled();
    });
  }

  it("valid prices (and a blank that clears) are written, then ok", async () => {
    const url = await landing(
      setServiceLocationPricesAction(form({ serviceId: "s-1", price__l1: "40,5", price__l2: "" })),
    );
    expect(url).toBe("/admin/services?m=ok");
    expect(setServiceLocationPrices).toHaveBeenCalledWith(expect.anything(), "s-1", [
      { locationId: "l1", priceCents: 4050 },
      { locationId: "l2", priceCents: null },
    ]);
  });
});

describe("packs: per-location prices", () => {
  for (const bad of ["12.", ".5", "abc"]) {
    it(`"${bad}" lands on the pack banner (err:invalid) and writes nothing`, async () => {
      const url = await landing(setPackLocationPricesAction(form({ packId: "p-1", price__l1: bad })));
      expect(url).toBe("/admin/services?mp=err:invalid");
      expect(setPackLocationPrices).not.toHaveBeenCalled();
    });
  }

  it("a valid price is written, then ok", async () => {
    const url = await landing(setPackLocationPricesAction(form({ packId: "p-1", price__l1: "300.00" })));
    expect(url).toBe("/admin/services?mp=ok");
    expect(setPackLocationPrices).toHaveBeenCalledWith(expect.anything(), "p-1", [
      { locationId: "l1", priceCents: 30000 },
    ]);
  });
});
