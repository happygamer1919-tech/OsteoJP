/**
 * R45 (strategy, 2026-10-06) - the Declaração generator and its gates.
 *
 *   G7 "Declaração at a location named "OsteoJP (LV)" and "OsteoJP (CB)".
 *       EXPECT: stamp printed, place line "Linda-a-Velha" and "Castelo Branco"."
 *   G8 "Declaração at a location with no stamp. EXPECT: refused with the
 *       notice, no document produced."
 *
 * And the rule both rest on: A DECLARATION IS MADE FOR THE LOCATION IT WAS ASKED
 * FOR. No location, or one the acting staff member may not act in, is refused
 * as malformed input; it is never answered with the tenant's oldest location,
 * whose carimbo is another clinic's signature.
 *
 * These run the REAL generator, model, resolver and scope helper
 * (bookingLocationScope, isLocationBookable) against a fake database. The
 * renderer is the real one behind a spy, so a produced declaration is a real
 * PDF and a refused one is provably never rendered. Every name is invented.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type LocationRow = { name: string; address: string | null; phone: string | null; isActive: boolean };

const db = vi.hoisted(() => ({
  patient: null as { fullName: string } | null,
  tenant: null as { settings: unknown; name: string | null; nif: string | null } | null,
  /** The tenant's locations by id, OLDEST FIRST (insertion order is created_at order). */
  locations: new Map<string, LocationRow>(),
  /** staff_locations: user id -> the location ids that user is assigned to. */
  staffLocations: {} as Record<string, string[]>,
}));

/** The `column = value` pairs of a drizzle condition, however it is nested. */
function equalities(cond: unknown, out: [unknown, unknown][] = []): [unknown, unknown][] {
  const chunks = (cond as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [];
  chunks.forEach((chunk, i) => {
    const param = chunks[i + 2] as { value?: unknown; encoder?: unknown } | undefined;
    if (chunk && typeof chunk === "object" && "table" in chunk && param && "encoder" in param) {
      out.push([chunk, param.value]);
    }
    if (chunk && typeof chunk === "object" && "queryChunks" in chunk) equalities(chunk, out);
  });
  return out;
}

// SPREAD THE REAL MODULE: generate.ts takes its drizzle tables from it, and the
// fake transaction below answers each read from those table and column objects.
vi.mock("@osteojp/db", async (orig) => {
  const actual = await orig<typeof import("@osteojp/db")>();
  const fakeTx = {
    select: () => {
      let table: unknown;
      let filters: [unknown, unknown][] = [];
      const chain = {
        from: (t: unknown) => {
          table = t;
          return chain;
        },
        where: (cond: unknown) => {
          filters = equalities(cond);
          return chain;
        },
        orderBy: () => chain,
        limit: async (n: number) => {
          if (table === actual.patients) return db.patient ? [db.patient] : [];
          if (table === actual.tenants) return db.tenant ? [db.tenant] : [];
          if (table === actual.locations) {
            // The rows a real `WHERE id = ? / is_active = ?` would return, in
            // created_at order, so a read with no id finds the OLDEST location.
            return [...db.locations.entries()]
              .filter(([id, row]) =>
                filters.every(([column, value]) =>
                  column === actual.locations.id
                    ? id === value
                    : column === actual.locations.isActive
                      ? row.isActive === value
                      : true,
                ),
              )
              .map(([, row]) => row)
              .slice(0, n);
          }
          throw new Error("generate.ts read a table this fake does not know");
        },
      };
      return chain;
    },
  };
  return {
    ...actual,
    withTenantContext: vi.fn(async (_claims: unknown, fn: (tx: unknown) => unknown) => fn(fakeTx)),
  };
});

// The REAL scope helper, reading staff_locations from the fake above. runScoped
// is the one thing replaced: it hands the helper the caller's own assignments.
vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (actor: { userId: string }, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve((db.staffLocations[actor.userId] ?? []).map((locationId) => ({ locationId }))),
        }),
      }),
    }),
  ),
}));

// The real renderer, observed: called or not, and with which model.
vi.mock("./declaracao-pdf", async (orig) => {
  const actual = await orig<typeof import("./declaracao-pdf")>();
  return { ...actual, renderDeclaracaoPdf: vi.fn(actual.renderDeclaracaoPdf) };
});

import type { RequestContext } from "@osteojp/auth";
import { isClinicalError } from "../errors";
import { OSTEOJP_LOCATION_CONTACTS } from "../report/location-contacts";
import { renderDeclaracaoPdf } from "./declaracao-pdf";
import { declaracaoAvailability, generateDeclaracaoPdf } from "./generate";
import { signatureStampBytesForLocation } from "./signature-stamp-asset";

const mockRender = vi.mocked(renderDeclaracaoPdf);

const LV = "00000000-0000-4000-8000-0000000000a1";
const CB = "00000000-0000-4000-8000-0000000000a2";
const MN = "00000000-0000-4000-8000-0000000000a3";
const ARCHIVED = "00000000-0000-4000-8000-0000000000a4";
const UNKNOWN = "00000000-0000-4000-8000-0000000000ff";

const actor = (role: RequestContext["role"], userId = `user-${role}`): RequestContext => ({
  tenantId: "tenant-1",
  role,
  userId,
});
/** Unrestricted, so a test about something else is not also about scope. */
const owner = actor("owner");

const inputs = {
  patientId: "00000000-0000-4000-8000-0000000000b1",
  date: "2026-07-12",
  startTime: "09:30",
  endTime: "10:30",
};

const row = (name: string, isActive = true): LocationRow => ({
  name,
  address: "Rua do registo, 1",
  phone: "210 000 000",
  isActive,
});
const sameBytes = (a: Uint8Array | null | undefined, b: Uint8Array | null): boolean =>
  !!a && b !== null && Buffer.from(a).equals(Buffer.from(b));
const LV_BYTES = signatureStampBytesForLocation("linda-a-velha");
const CB_BYTES = signatureStampBytesForLocation("castelo-branco");

/** The clinic as it is stored: LV oldest, then CB, then the location with no carimbo. */
function seedClinic(names: { lv?: string; cb?: string } = {}): void {
  db.locations = new Map([
    [LV, row(names.lv ?? "OsteoJP (LV)")],
    [CB, row(names.cb ?? "OsteoJP (CB)")],
    [MN, row("OsteoJP (Montemor-o-Novo)")],
    [ARCHIVED, row("Castelo Branco", false)],
  ]);
}

/** The outcome, caught: the error code, or "produced" when nothing was thrown. */
async function outcome(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "produced";
  } catch (e) {
    return isClinicalError(e) ? e.code : `unexpected: ${String(e)}`;
  }
}

beforeEach(() => {
  mockRender.mockClear();
  db.patient = { fullName: "Maria Silva" };
  db.tenant = { settings: {}, name: "OsteoJP, Lda.", nif: "515123456" };
  db.staffLocations = {};
  seedClinic();
});

describe("R45 G7 - a clinic with a carimbo is issued, stamped with ITS OWN, short code or plain name", () => {
  it.each([
    { at: LV, names: {}, city: "Linda-a-Velha", own: LV_BYTES, other: CB_BYTES },
    { at: CB, names: {}, city: "Castelo Branco", own: CB_BYTES, other: LV_BYTES },
    { at: LV, names: { lv: "Linda-a-Velha" }, city: "Linda-a-Velha", own: LV_BYTES, other: CB_BYTES },
    { at: CB, names: { cb: "Castelo Branco" }, city: "Castelo Branco", own: CB_BYTES, other: LV_BYTES },
  ])("a declaration for $city ($names): stamp printed, place line $city", async ({ at, names, city, own, other }) => {
    seedClinic(names);

    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: at });

    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(mockRender).toHaveBeenCalledTimes(1);
    const model = mockRender.mock.calls[0]![0];
    expect(model.localidade).toBe(city);
    expect(sameBytes(model.stampBytes, own)).toBe(true);
    expect(sameBytes(model.stampBytes, other)).toBe(false);
    expect(await declaracaoAvailability(owner, at)).toBe("ok");
  });

  it("the carimbo makes the document bigger: a stamped PDF really embeds the image", async () => {
    const stamped = await generateDeclaracaoPdf(owner, { ...inputs, locationId: LV });
    db.tenant = { settings: { declaracao: { signatureStamp: false } }, name: null, nif: null };
    const blank = await generateDeclaracaoPdf(owner, { ...inputs, locationId: LV });
    expect(stamped.bytes.byteLength).toBeGreaterThan(blank.bytes.byteLength + 10_000);
  });
});

// ---------------------------------------------------------------------------
// THE MANUAL ENTRY, AND WHY ITS LOCATION IS NEVER GUESSED.
//
// A manual declaration has no marcação. Until this change it was made for the
// tenant's oldest active location. Once the short-code names resolve to a
// carimbo, that fallback would put the oldest clinic's signature and stamp on a
// declaration written at ANOTHER clinic: the "erro grave" the per-location
// carimbo was built to end. So the location is given, or the request is
// refused. In every test below Linda-a-Velha is the oldest active location.
// ---------------------------------------------------------------------------
describe("R45 - a manual entry is made for the location it names, never for the oldest one", () => {
  it("Castelo Branco chosen, Linda-a-Velha oldest: Castelo Branco's carimbo and city", async () => {
    expect([...db.locations.keys()][0]).toBe(LV);

    await generateDeclaracaoPdf(owner, { ...inputs, locationId: CB });

    const model = mockRender.mock.calls[0]![0];
    expect(model.localidade).toBe("Castelo Branco");
    expect(sameBytes(model.stampBytes, CB_BYTES)).toBe(true);
    expect(sameBytes(model.stampBytes, LV_BYTES)).toBe(false);
    expect(model.contact?.name).toBe("OsteoJP (CB)");
  });

  it("Linda-a-Velha chosen, Castelo Branco oldest: Linda-a-Velha's carimbo and city", async () => {
    db.locations = new Map([
      [CB, row("OsteoJP (CB)")],
      [LV, row("OsteoJP (LV)")],
    ]);

    await generateDeclaracaoPdf(owner, { ...inputs, locationId: LV });

    const model = mockRender.mock.calls[0]![0];
    expect(model.localidade).toBe("Linda-a-Velha");
    expect(sameBytes(model.stampBytes, LV_BYTES)).toBe(true);
    expect(sameBytes(model.stampBytes, CB_BYTES)).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("no location (%s): refused as invalid input, nothing rendered", async (_label, locationId) => {
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId }))).toBe("invalid");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, locationId)).toBe("invalid");
  });

  it("no location, sent without the key at all: refused the same way", async () => {
    expect(await outcome(generateDeclaracaoPdf(owner, inputs))).toBe("invalid");
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("a location with no carimbo, chosen by hand: the no_stamp refusal", async () => {
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, MN)).toBe("no_stamp");
  });
});

describe("R45 - a location the request may not name is refused, NOT replaced by another", () => {
  it("an UNKNOWN id (or another tenant's, which RLS shows as no row): invalid", async () => {
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: UNKNOWN }))).toBe("invalid");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, UNKNOWN)).toBe("invalid");
  });

  it("an ARCHIVED location: invalid, although its name is a clinic with a carimbo", async () => {
    // The archived row is named "Castelo Branco", so only its being archived
    // stands between this request and a stamped declaration.
    expect(db.locations.get(ARCHIVED)).toMatchObject({ name: "Castelo Branco", isActive: false });

    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: ARCHIVED }))).toBe("invalid");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, ARCHIVED)).toBe("invalid");
  });

  it("a location OUTSIDE the staff member's own: invalid, and not Linda-a-Velha's declaration", async () => {
    const lvOnly = actor("reception", "staff-lv");
    db.staffLocations["staff-lv"] = [LV];

    expect(await outcome(generateDeclaracaoPdf(lvOnly, { ...inputs, locationId: CB }))).toBe("invalid");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(lvOnly, CB)).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// WHO MAY ISSUE FOR WHICH LOCATION. The rule is bookingLocationScope's, the one
// every booking write answers to (STAFF-02), run here for real:
//   owner                         -> every active location;
//   therapist, reception, admin   -> their own staff_locations;
//   any of those three, UNASSIGNED -> every active location (the helper's
//                                    documented fallback, not a rule of this file).
// ---------------------------------------------------------------------------
describe("R45 - the staff member's own locations decide which declaration they may issue", () => {
  it.each(["therapist", "reception", "admin"] as const)(
    "a %s assigned to Linda-a-Velha ONLY: issues for it, and is refused Castelo Branco",
    async (role) => {
      const staff = actor(role, `lv-${role}`);
      db.staffLocations[staff.userId] = [LV];

      expect(await declaracaoAvailability(staff, LV)).toBe("ok");
      expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: LV }))).toBe("produced");
      expect(sameBytes(mockRender.mock.calls[0]![0].stampBytes, LV_BYTES)).toBe(true);

      mockRender.mockClear();
      expect(await declaracaoAvailability(staff, CB)).toBe("invalid");
      expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: CB }))).toBe("invalid");
      expect(mockRender).not.toHaveBeenCalled();
    },
  );

  it.each(["therapist", "reception", "admin"] as const)(
    "a %s assigned to Castelo Branco ONLY is refused Linda-a-Velha, the oldest location",
    async (role) => {
      const staff = actor(role, `cb-${role}`);
      db.staffLocations[staff.userId] = [CB];

      expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: LV }))).toBe("invalid");
      expect(mockRender).not.toHaveBeenCalled();
      expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: CB }))).toBe("produced");
      expect(sameBytes(mockRender.mock.calls[0]![0].stampBytes, CB_BYTES)).toBe(true);
    },
  );

  it("staff assigned to BOTH clinics issue for either, each with its own carimbo", async () => {
    const staff = actor("reception", "both");
    db.staffLocations.both = [LV, CB];

    await generateDeclaracaoPdf(staff, { ...inputs, locationId: LV });
    await generateDeclaracaoPdf(staff, { ...inputs, locationId: CB });

    expect(sameBytes(mockRender.mock.calls[0]![0].stampBytes, LV_BYTES)).toBe(true);
    expect(sameBytes(mockRender.mock.calls[1]![0].stampBytes, CB_BYTES)).toBe(true);
  });

  it("the OWNER is not location-restricted, whatever staff_locations says", async () => {
    db.staffLocations[owner.userId] = [LV];
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: CB }))).toBe("produced");
  });

  it.each(["therapist", "reception", "admin"] as const)(
    "an UNASSIGNED %s falls back to every active location, as the scope helper rules",
    async (role) => {
      const staff = actor(role, `new-${role}`);
      expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: CB }))).toBe("produced");
      // Still only ACTIVE ones, and still the carimbo rule.
      expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: ARCHIVED }))).toBe("invalid");
      expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: MN }))).toBe("no_stamp");
    },
  );

  it("an assignment to an archived location does not make it issuable", async () => {
    const staff = actor("reception", "old");
    db.staffLocations.old = [ARCHIVED];
    expect(await outcome(generateDeclaracaoPdf(staff, { ...inputs, locationId: ARCHIVED }))).toBe("invalid");
    expect(mockRender).not.toHaveBeenCalled();
  });
});

describe("R45 - the footer of a short-code location is its own row (option (b) refused)", () => {
  it.each([
    ["OsteoJP (LV)", LV],
    ["OsteoJP (CB)", CB],
  ])("%s", async (name, id) => {
    await generateDeclaracaoPdf(owner, { ...inputs, locationId: id });

    const { contact } = mockRender.mock.calls[0]![0];
    expect(contact).toEqual({
      name,
      addressLines: ["Rua do registo, 1"],
      postalCode: null,
      city: null,
      phones: ["210 000 000"],
      email: null,
    });
    for (const block of Object.values(OSTEOJP_LOCATION_CONTACTS)) {
      expect(contact?.email).not.toBe(block.email);
      for (const phone of block.phones) expect(contact?.phones).not.toContain(phone);
    }
  });
});

describe("R45 G8 - a location with no carimbo is refused, and nothing is rendered", () => {
  it.each([
    "OsteoJP (Montemor-o-Novo)",
    "OsteoJP (MN)",
    "Clínica Central",
    "Sala de testes (LV)",
  ])("a declaration for %s", async (name) => {
    // Linda-a-Velha is still the oldest active location: it must not rescue this.
    db.locations.set(MN, row(name));

    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, MN)).toBe("no_stamp");
  });
});

describe("R45 - the tenant's signatureStamp switch does not decide the refusal", () => {
  const OFF = { settings: { declaracao: { signatureStamp: false } }, name: null, nif: null };

  it("switch OFF at a clinic WITH a carimbo: issued, with the blank area, as before", async () => {
    db.tenant = OFF;

    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: LV });

    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const model = mockRender.mock.calls[0]![0];
    expect(model.stampBytes).toBeNull();
    expect(model.localidade).toBe("Linda-a-Velha");
  });

  it("switch OFF at a location with NO carimbo: still refused", async () => {
    db.tenant = OFF;
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("switch ON (the default) at a location with NO carimbo: refused", async () => {
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
  });
});

describe("declaracaoAvailability - the same questions, asked before anything is spent", () => {
  it("reads the location only: no patient, no tenant, no render", async () => {
    db.patient = null;
    db.tenant = null;
    expect(await declaracaoAvailability(owner, LV)).toBe("ok");
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("agrees with the generator on every case, so the two cannot disagree at the desk", async () => {
    const lvOnly = actor("reception", "staff-lv");
    db.staffLocations["staff-lv"] = [LV];
    const cases: [RequestContext, string | null][] = [
      [owner, LV],
      [owner, CB],
      [owner, MN],
      [owner, ARCHIVED],
      [owner, UNKNOWN],
      [owner, null],
      [lvOnly, LV],
      [lvOnly, CB],
      [lvOnly, MN],
      [lvOnly, null],
    ];
    for (const [who, locationId] of cases) {
      const available = await declaracaoAvailability(who, locationId);
      const generated = await outcome(generateDeclaracaoPdf(who, { ...inputs, locationId }));
      expect(generated, `${who.role} ${locationId}`).toBe(available === "ok" ? "produced" : available);
    }
  });
});

describe("a patient this tenant context cannot see is still not_found", () => {
  it("not_found, never rendered", async () => {
    db.patient = null;
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: LV }))).toBe("not_found");
    expect(mockRender).not.toHaveBeenCalled();
  });
});
