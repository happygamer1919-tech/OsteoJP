/**
 * R45 (strategy, 2026-10-06) - the Declaração generator and its two gates.
 *
 *   G7 "Declaração at a location named "OsteoJP (LV)" and "OsteoJP (CB)".
 *       EXPECT: stamp printed, place line "Linda-a-Velha" and "Castelo Branco"."
 *   G8 "Declaração at a location with no stamp. EXPECT: refused with the
 *       notice, no document produced."
 *
 * These run the REAL generator, model and resolver against a fake transaction.
 * The renderer is the real one behind a spy, so a produced declaration is a
 * real PDF and a refused one is provably never rendered. Every name below is
 * invented.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  patient: null as { fullName: string } | null,
  tenant: null as { settings: unknown; name: string | null; nif: string | null } | null,
  /** The row `locations.id = locationId` finds, or null for none. */
  locationById: null as { name: string; address: string | null; phone: string | null } | null,
  /** The tenant's first active location, or null for none. */
  defaultLocation: null as { name: string; address: string | null; phone: string | null } | null,
  /** Which location reads ran, in order: "byId" or "default". */
  locationReads: [] as string[],
}));

// SPREAD THE REAL MODULE: generate.ts takes its drizzle tables from it, and the
// fake transaction below tells the reads apart by those table objects.
vi.mock("@osteojp/db", async (orig) => {
  const actual = await orig<typeof import("@osteojp/db")>();
  const fakeTx = {
    select: () => {
      let table: unknown;
      let ordered = false;
      const chain = {
        from: (t: unknown) => {
          table = t;
          return chain;
        },
        where: () => chain,
        orderBy: () => {
          ordered = true;
          return chain;
        },
        limit: async () => {
          if (table === actual.patients) return db.patient ? [db.patient] : [];
          if (table === actual.tenants) return db.tenant ? [db.tenant] : [];
          if (table === actual.locations) {
            // Only the tenant-default read is ordered (by created_at).
            db.locationReads.push(ordered ? "default" : "byId");
            const found = ordered ? db.defaultLocation : db.locationById;
            return found ? [found] : [];
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

// The real renderer, observed: called or not, and with which model.
vi.mock("./declaracao-pdf", async (orig) => {
  const actual = await orig<typeof import("./declaracao-pdf")>();
  return { ...actual, renderDeclaracaoPdf: vi.fn(actual.renderDeclaracaoPdf) };
});

import type { TenantClaims } from "@osteojp/db";
import { isClinicalError } from "../errors";
import { OSTEOJP_LOCATION_CONTACTS } from "../report/location-contacts";
import { renderDeclaracaoPdf } from "./declaracao-pdf";
import { declaracaoStampAvailable, generateDeclaracaoPdf } from "./generate";
import { signatureStampBytesForLocation } from "./signature-stamp-asset";

const mockRender = vi.mocked(renderDeclaracaoPdf);

const claims = { tenant_id: "tenant-1", user_role: "reception", sub: "staff-1" } as unknown as TenantClaims;
const LOCATION_ID = "00000000-0000-4000-8000-0000000000a1";
const inputs = {
  patientId: "00000000-0000-4000-8000-0000000000b1",
  date: "2026-07-12",
  startTime: "09:30",
  endTime: "10:30",
};

const row = (name: string) => ({ name, address: "Rua do registo, 1", phone: "210 000 000" });
const sameBytes = (a: Uint8Array | null | undefined, b: Uint8Array | null): boolean =>
  !!a && b !== null && Buffer.from(a).equals(Buffer.from(b));
const LV_BYTES = signatureStampBytesForLocation("linda-a-velha");
const CB_BYTES = signatureStampBytesForLocation("castelo-branco");

/** The refusal, caught: the error code, or "produced" when nothing was thrown. */
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
  db.locationById = null;
  db.defaultLocation = null;
  db.locationReads = [];
});

describe("R45 G7 - a clinic with a carimbo is issued, stamped with ITS OWN, short code or plain name", () => {
  // `fallback` is the OTHER clinic as the tenant default, so a declaration
  // that fell through to the default would carry the wrong carimbo and city.
  it.each([
    { name: "OsteoJP (LV)", fallback: "OsteoJP (CB)", city: "Linda-a-Velha", own: LV_BYTES, other: CB_BYTES },
    { name: "OsteoJP (CB)", fallback: "OsteoJP (LV)", city: "Castelo Branco", own: CB_BYTES, other: LV_BYTES },
    { name: "Linda-a-Velha", fallback: "Castelo Branco", city: "Linda-a-Velha", own: LV_BYTES, other: CB_BYTES },
    { name: "Castelo Branco", fallback: "Linda-a-Velha", city: "Castelo Branco", own: CB_BYTES, other: LV_BYTES },
  ])("the marcação is at $name: stamp printed, place line $city", async ({ name, fallback, city, own, other }) => {
    db.locationById = row(name);
    db.defaultLocation = row(fallback);

    const pdf = await generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID });

    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(mockRender).toHaveBeenCalledTimes(1);
    const model = mockRender.mock.calls[0]![0];
    expect(model.localidade).toBe(city);
    expect(sameBytes(model.stampBytes, own)).toBe(true);
    expect(sameBytes(model.stampBytes, other)).toBe(false);
  });

  it("the manual path (no marcação): the tenant default's own carimbo and city", async () => {
    db.defaultLocation = row("OsteoJP (CB)");

    await generateDeclaracaoPdf(claims, { ...inputs, locationId: null });

    const model = mockRender.mock.calls[0]![0];
    expect(model.localidade).toBe("Castelo Branco");
    expect(sameBytes(model.stampBytes, CB_BYTES)).toBe(true);
  });

  it("the carimbo makes the document bigger: a stamped PDF really embeds the image", async () => {
    db.locationById = row("OsteoJP (LV)");
    const stamped = await generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID });
    db.tenant = { settings: { declaracao: { signatureStamp: false } }, name: null, nif: null };
    const blank = await generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID });
    expect(stamped.bytes.byteLength).toBeGreaterThan(blank.bytes.byteLength + 10_000);
  });
});

describe("R45 - the footer of a short-code location is its own row (option (b) refused)", () => {
  it.each(["OsteoJP (LV)", "OsteoJP (CB)"])("%s", async (name) => {
    db.locationById = row(name);

    await generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID });

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
  ])("the marcação is at %s", async (name) => {
    db.locationById = row(name);
    // A stamped tenant default must not rescue it: the declaration is for the
    // marcação's location.
    db.defaultLocation = row("OsteoJP (LV)");

    expect(await outcome(generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID }))).toBe(
      "no_stamp",
    );
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoStampAvailable(claims, LOCATION_ID)).toBe(false);
  });

  it.each([
    "OsteoJP (Montemor-o-Novo)",
    "OsteoJP (MN)",
    "Clínica Central",
    "Sala de testes (LV)",
  ])("the manual path, and the tenant default is %s", async (name) => {
    db.defaultLocation = row(name);

    expect(await outcome(generateDeclaracaoPdf(claims, { ...inputs, locationId: null }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoStampAvailable(claims, null)).toBe(false);
  });

  it("no location at all: no marcação location and no active location in the tenant", async () => {
    expect(await outcome(generateDeclaracaoPdf(claims, { ...inputs, locationId: null }))).toBe("no_stamp");
    expect(await outcome(generateDeclaracaoPdf(claims, inputs))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoStampAvailable(claims, null)).toBe(false);
    expect(await declaracaoStampAvailable(claims, undefined)).toBe(false);
  });
});

describe("R45 - the tenant's signatureStamp switch does not decide the refusal", () => {
  const OFF = { settings: { declaracao: { signatureStamp: false } }, name: null, nif: null };

  it("switch OFF at a clinic WITH a carimbo: issued, with the blank area, as before", async () => {
    db.tenant = OFF;
    db.locationById = row("OsteoJP (LV)");

    const pdf = await generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID });

    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const model = mockRender.mock.calls[0]![0];
    expect(model.stampBytes).toBeNull();
    expect(model.localidade).toBe("Linda-a-Velha");
  });

  it("switch OFF at a location with NO carimbo: still refused", async () => {
    db.tenant = OFF;
    db.locationById = row("OsteoJP (Montemor-o-Novo)");

    expect(await outcome(generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID }))).toBe(
      "no_stamp",
    );
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("switch ON (the default) at a location with NO carimbo: refused", async () => {
    db.locationById = row("OsteoJP (Montemor-o-Novo)");
    expect(await outcome(generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID }))).toBe(
      "no_stamp",
    );
  });
});

describe("declaracaoStampAvailable - the same question, asked before anything is spent", () => {
  it.each(["OsteoJP (LV)", "OsteoJP (CB)", "Linda-a-Velha", "Castelo Branco"])(
    "true for a marcação at %s",
    async (name) => {
      db.locationById = row(name);
      expect(await declaracaoStampAvailable(claims, LOCATION_ID)).toBe(true);
    },
  );

  it("reads the location rows only: no patient, no tenant, no render", async () => {
    db.patient = null;
    db.tenant = null;
    db.locationById = row("OsteoJP (LV)");
    expect(await declaracaoStampAvailable(claims, LOCATION_ID)).toBe(true);
    expect(db.locationReads).toEqual(["byId", "default"]);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("agrees with the generator on every case, so the two cannot disagree at the desk", async () => {
    const cases: { byId: string | null; fallback: string | null }[] = [
      { byId: "OsteoJP (LV)", fallback: "OsteoJP (CB)" },
      { byId: "OsteoJP (Montemor-o-Novo)", fallback: "OsteoJP (LV)" },
      { byId: null, fallback: "OsteoJP (CB)" },
      { byId: null, fallback: "OsteoJP (MN)" },
      { byId: null, fallback: null },
    ];
    for (const c of cases) {
      db.locationById = c.byId ? row(c.byId) : null;
      db.defaultLocation = c.fallback ? row(c.fallback) : null;
      const locationId = c.byId ? LOCATION_ID : null;
      const available = await declaracaoStampAvailable(claims, locationId);
      const generated = await outcome(generateDeclaracaoPdf(claims, { ...inputs, locationId }));
      expect(generated, JSON.stringify(c)).toBe(available ? "produced" : "no_stamp");
    }
  });
});

describe("a patient this tenant context cannot see is still not_found", () => {
  it("not_found, never rendered", async () => {
    db.patient = null;
    db.locationById = row("OsteoJP (LV)");
    expect(await outcome(generateDeclaracaoPdf(claims, { ...inputs, locationId: LOCATION_ID }))).toBe(
      "not_found",
    );
    expect(mockRender).not.toHaveBeenCalled();
  });
});
