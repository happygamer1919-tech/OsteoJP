/**
 * GUEST-04 — the ONE unauthenticated READ, and what it is allowed to say.
 *
 * THE PROPERTY THAT MATTERS IS THE PROJECTION. This route runs for anyone on the
 * internet, so the risk is not that it breaks, it is that it QUIETLY WIDENS: a
 * later `select({...services})` picking up a price, a duration, a note or an
 * internal flag would look like a tidy-up in a diff and would be a disclosure in
 * production. §2 pins the exact key set on both lists so widening it is a red
 * test rather than a review comment somebody might not make.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  keys: [] as string[],
  verdicts: new Map<string, boolean>(),
  /** Result queue: the route runs locations first, then services. */
  results: [] as unknown[][],
  selects: 0,
}));

function chainable() {
  const rows = H.results[H.selects++] ?? [];
  const self: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy"]) {
    self[method] = () => self;
  }
  // Awaiting the builder resolves the rows, exactly as drizzle's does.
  self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return self;
}

vi.mock("@osteojp/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDbAdmin: () => ({ select: () => chainable() }),
}));

vi.mock("@/lib/rate-limit/durable-store", () => ({
  createDurableRateLimitStore: () => ({}),
  checkDurableRateLimit: async (key: string, rule: { limit: number }) => {
    H.keys.push(key);
    const ok = H.verdicts.get(key) ?? true;
    return { ok, limit: rule.limit, remaining: ok ? 1 : 0, retryAfterSeconds: 60 };
  },
}));

import { GET as guestCatalog } from "./route";

const T = "11111111-1111-1111-1111-111111111111";
const LV = "aaaaaaaa-0000-0000-0000-000000000001";
const CB = "aaaaaaaa-0000-0000-0000-000000000002";

const get = (query = `?tenantId=${T}`) =>
  new Request(`https://api.test/api/v1/booking/guest/catalog${query}`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });

const seed = (
  locations: unknown[] = [
    { id: LV, name: "Linda-a-Velha" },
    { id: CB, name: "Castelo Branco" },
  ],
  services: unknown[] = [
    { id: "s1", name: "Osteopatia", locationId: null },
    { id: "s2", name: "Pilates Terapêutico", locationId: CB },
  ],
) => {
  H.results = [locations, services];
};

beforeEach(() => {
  H.keys = [];
  H.verdicts = new Map();
  H.selects = 0;
  seed();
});

describe("§1 — it answers the guest form, and only the guest form", () => {
  it("returns the bookable services and the clinics that offer them", async () => {
    const res = await guestCatalog(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      locations: [
        { id: LV, name: "Linda-a-Velha" },
        { id: CB, name: "Castelo Branco" },
      ],
      services: [
        // A service bound to no location is offered at every ACTIVE clinic, so
        // the form can filter by clinic without a second call.
        { id: "s1", name: "Osteopatia", locationIds: [LV, CB] },
        { id: "s2", name: "Pilates Terapêutico", locationIds: [CB] },
      ],
    });
  });

  it("drops a service bound to a clinic that is not active", async () => {
    // Otherwise the form offers a treatment at a closed clinic and reception
    // finds out by telephone.
    seed([{ id: LV, name: "Linda-a-Velha" }], [
      { id: "s2", name: "Pilates Terapêutico", locationId: CB },
    ]);
    const body = (await (await guestCatalog(get())).json()) as { services: unknown[] };
    expect(body.services).toEqual([]);
  });

  it("refuses a request with no tenant", async () => {
    const res = await guestCatalog(get(""));
    expect(res.status).toBe(400);
  });

  it("an unknown tenant answers EMPTY, never an error - it is not an oracle", async () => {
    // A different answer for a real tenant and an invented one would turn this
    // into a tenant-existence oracle. Empty lists are what a real clinic with
    // nothing bookable returns too.
    seed([], []);
    const res = await guestCatalog(get("?tenantId=99999999-9999-9999-9999-999999999999"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locations: [], services: [] });
  });
});

describe("§2 — THE PROJECTION, pinned key by key", () => {
  it("a service row carries EXACTLY id, name, locationIds", async () => {
    // The row the database hands back deliberately carries more than the
    // response may: if the route ever spread it, this fails.
    H.results = [
      [{ id: LV, name: "Linda-a-Velha" }],
      [
        {
          id: "s1",
          name: "Osteopatia",
          locationId: null,
          priceCents: 4500,
          currency: "EUR",
          durationMin: 45,
          internalOnly: false,
          patientBookable: true,
          notes: "internal note",
        },
      ],
    ];
    const body = (await (await guestCatalog(get())).json()) as {
      services: Record<string, unknown>[];
    };
    expect(Object.keys(body.services[0]!).sort()).toEqual(["id", "locationIds", "name"]);
  });

  it("a location row carries EXACTLY id and name", async () => {
    H.results = [
      [{ id: LV, name: "Linda-a-Velha", address: "Praça Central Plaza", isActive: true }],
      [],
    ];
    const body = (await (await guestCatalog(get())).json()) as {
      locations: Record<string, unknown>[];
    };
    expect(Object.keys(body.locations[0]!).sort()).toEqual(["id", "name"]);
  });

  it("no price, duration or internal flag reaches the wire, whatever the row held", async () => {
    H.results = [
      [{ id: LV, name: "Linda-a-Velha" }],
      [{ id: "s1", name: "Osteopatia", locationId: null, priceCents: 4500, durationMin: 45 }],
    ];
    const raw = await (await guestCatalog(get())).text();
    for (const forbidden of ["priceCents", "4500", "durationMin", "internalOnly", "patientBookable"]) {
      expect(raw, forbidden).not.toContain(forbidden);
    }
  });
});

describe("§3 — the limits", () => {
  it("checks BOTH per-IP windows before it reads anything", async () => {
    await guestCatalog(get());
    expect(H.keys).toEqual([
      "guest-catalog:min:ip:203.0.113.9",
      "guest-catalog:hour:ip:203.0.113.9",
    ]);
  });

  it("NO GLOBAL CEILING - the decision, asserted so it cannot be added by accident", async () => {
    // RULES.guestCatalogIp carries the reasoning: a global ceiling on a read of
    // published data buys nothing and hands one attacker a switch that takes the
    // public booking form off the air for everybody. If a ceiling is ever added
    // deliberately, this test is where the decision gets revisited.
    await guestCatalog(get());
    expect(H.keys.filter((k) => k.includes("global"))).toEqual([]);
  });

  it("a refused request answers 429 and never reads", async () => {
    H.verdicts.set("guest-catalog:min:ip:203.0.113.9", false);
    const res = await guestCatalog(get());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(H.selects).toBe(0);
  });

  it("NEGATIVE ARM: an allowed request really does read", async () => {
    await guestCatalog(get());
    expect(H.selects).toBe(2);
  });
});

describe("§4 — the four predicates, guarded in SOURCE", () => {
  // A GUARD, NOT A PROOF, and named as one. Drizzle's `where` builds an opaque
  // SQL object, so a unit test cannot observe the predicate through the mock -
  // the honest proof is `patient-bookable.db.test.ts` running against a real
  // database one route over. What this catches is the realistic regression: a
  // predicate DELETED from the source in a refactor, which would make the public
  // form offer strangers something a logged-in patient may not book.
  const SRC = readFileSync(join(__dirname, "route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

  it.each(["isActive", "internalOnly", "patientBookable", "tenantId"])(
    "%s is a predicate in CODE, not a promise in a comment",
    (column) => {
      expect(SRC).toContain(`services.${column}`);
    },
  );
});
