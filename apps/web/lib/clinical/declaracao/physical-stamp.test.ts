/**
 * physical-stamp.test.ts - S-1012-A1 ruling 4 (2026-10-12), gate G6.
 *
 *   "Montemor stamp: blank area for a physical stamp. Build a per-location
 *    setting so a location marked "physical stamp" issues the Declaração with a
 *    blank stamp area and its own place line. A location with neither an image
 *    nor that setting is still refused."
 *
 *   G6 "CHECK: Declaração at a location set to physical stamp. EXPECT: document
 *       produced, blank stamp area, place line "Montemor-o-Novo"."
 *
 * These run the REAL generator, model, resolver, settings reader, scope helper
 * and renderer against a fake database, the way generate.test.ts does. What is
 * asserted about the document is read back out of the PRODUCED PDF: its page
 * content is decoded, so "the place line reads Montemor-o-Novo" and "the stamp
 * area is an empty frame" are facts about the bytes a member of staff prints,
 * not about a model on the way there.
 *
 * Every name is invented.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

vi.mock("server-only", () => ({}));

type LocationRow = { name: string; address: string | null; phone: string | null; isActive: boolean };

const db = vi.hoisted(() => ({
  patient: null as { fullName: string } | null,
  tenant: null as { settings: unknown; name: string | null; nif: string | null } | null,
  locations: new Map<string, LocationRow>(),
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
        limit: async (n: number) => {
          if (table === actual.patients) return db.patient ? [db.patient] : [];
          if (table === actual.tenants) return db.tenant ? [db.tenant] : [];
          if (table === actual.locations) {
            return [...db.locations.entries()]
              .filter(([id]) =>
                filters.every(([column, value]) => (column === actual.locations.id ? id === value : true)),
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

vi.mock("./declaracao-pdf", async (orig) => {
  const actual = await orig<typeof import("./declaracao-pdf")>();
  return { ...actual, renderDeclaracaoPdf: vi.fn(actual.renderDeclaracaoPdf) };
});

import type { RequestContext } from "@osteojp/auth";
import { isClinicalError } from "../errors";
import { OSTEOJP_LOCATION_CONTACTS } from "../report/location-contacts";
import {
  PHYSICAL_STAMP_FRAME_H,
  PHYSICAL_STAMP_FRAME_W,
  renderDeclaracaoPdf,
} from "./declaracao-pdf";
import {
  PHYSICAL_STAMP_PLACE_MAX,
  placeFromAddress,
  readDeclaracaoSettings,
  readPhysicalStampPlace,
  withPhysicalStamp,
} from "./declaracao-settings";
import { buildDeclaracaoModel } from "./declaracao-model";
import { declaracaoAvailability, generateDeclaracaoPdf } from "./generate";
import { signatureStampBytesForLocation } from "./signature-stamp-asset";

const mockRender = vi.mocked(renderDeclaracaoPdf);

const LV = "00000000-0000-4000-8000-0000000000a1";
const CB = "00000000-0000-4000-8000-0000000000a2";
const MN = "00000000-0000-4000-8000-0000000000a3";
const OTHER = "00000000-0000-4000-8000-0000000000a5";
const ARCHIVED = "00000000-0000-4000-8000-0000000000a4";

const MN_NAME = "OsteoJP (Montemor-o-Novo)";
const MN_ADDRESS = "Rua Horta das Almas 4, 7050-356 Montemor-o-Novo";
const MN_PHONE = "926 714 926";
const PLACE = "Montemor-o-Novo";

const actor = (role: RequestContext["role"], userId = `user-${role}`): RequestContext => ({
  tenantId: "tenant-1",
  role,
  userId,
});
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

/** The tenant's settings with these locations marked "physical stamp". */
const marked = (places: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  settings: { declaracao: { physicalStamp: places, ...more } },
  name: "OsteoJP, Lda.",
  nif: "515123456",
});

async function outcome(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "produced";
  } catch (e) {
    return isClinicalError(e) ? e.code : `unexpected: ${String(e)}`;
  }
}

const LV_BYTES = signatureStampBytesForLocation("linda-a-velha");
const CB_BYTES = signatureStampBytesForLocation("castelo-branco");
const sameBytes = (a: Uint8Array | null | undefined, b: Uint8Array | null): boolean =>
  !!a && b !== null && Buffer.from(a).equals(Buffer.from(b));

/* ------------------------------------------------------------------ */
/* Reading the produced document                                       */
/* ------------------------------------------------------------------ */

/** The drawing operators of page 1, decoded, and how many images the file holds. */
async function readPdf(bytes: Uint8Array): Promise<{ ops: string; images: number; pages: number }> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) streams.push(doc.context.lookup(contents.get(i)) as PDFRawStream);
  } else if (contents) {
    streams.push(contents as unknown as PDFRawStream);
  }
  const ops = streams
    .map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"))
    .join("\n");
  let images = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) images += 1;
  }
  return { ops, images, pages: doc.getPageCount() };
}

/** A line of text as pdf-lib writes it for a standard font: WinAnsi, in hex. */
const drawn = (text: string) => `<${Buffer.from(text, "latin1").toString("hex").toUpperCase()}> Tj`;

/** How many images page 1 DRAWS (the logo is one; a carimbo is a second). */
const imagesDrawn = (ops: string) => (ops.match(/ Do$/gm) ?? []).length;

/** The closed, stroked, unfilled rectangle pdf-lib draws for the empty frame. */
const FRAME_PATH = `0 0 m\n0 ${PHYSICAL_STAMP_FRAME_H} l\n${PHYSICAL_STAMP_FRAME_W} ${PHYSICAL_STAMP_FRAME_H} l\n${PHYSICAL_STAMP_FRAME_W} 0 l\nh\nS`;

beforeEach(() => {
  mockRender.mockClear();
  db.patient = { fullName: "Maria Silva" };
  db.tenant = marked({ [MN]: { place: PLACE } });
  db.staffLocations = {};
  db.locations = new Map([
    [LV, row("OsteoJP (LV)")],
    [CB, row("OsteoJP (CB)")],
    [MN, { name: MN_NAME, address: MN_ADDRESS, phone: MN_PHONE, isActive: true }],
    [OTHER, row("OsteoJP (Outro Local)")],
    [ARCHIVED, row("OsteoJP (Arquivado)", false)],
  ]);
});

/* ==================================================================== */
/* G6                                                                    */
/* ==================================================================== */

describe("G6 - a Declaração at a location set to physical stamp", () => {
  it("document produced, blank stamp area, place line \"Montemor-o-Novo\"", async () => {
    expect(await declaracaoAvailability(owner, MN)).toBe("ok");

    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: MN });

    // DOCUMENT PRODUCED: a real one-page PDF.
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const doc = await readPdf(pdf.bytes);
    expect(doc.pages).toBe(1);

    // PLACE LINE: "{place}, {dia}", read out of the page.
    expect(doc.ops).toContain(drawn("Montemor-o-Novo, 12/07/2026"));
    // And not the location's whole stored name, which is what an unmarked
    // location's line would have read had it been let through.
    expect(doc.ops).not.toContain(drawn(`${MN_NAME}, 12/07/2026`));

    // BLANK STAMP AREA: the logo is the only image in the file and the only one
    // drawn; the frame is there and it is empty.
    expect(doc.images).toBe(1);
    expect(imagesDrawn(doc.ops)).toBe(1);
    expect(doc.ops).toContain(FRAME_PATH);

    const model = mockRender.mock.calls[0]![0];
    expect(model.stampBytes).toBeNull();
    expect(model.physicalStampArea).toBe(true);
    expect(model.localidade).toBe(PLACE);
  });

  it("NOTHING is written inside the frame: the page's text is the declaration's and no more", async () => {
    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: MN });
    db.tenant = { settings: { declaracao: { signatureStamp: false } }, name: "OsteoJP, Lda.", nif: "515123456" };
    const atClinic = await generateDeclaracaoPdf(owner, { ...inputs, locationId: LV });

    // The same NUMBER of text lines as a clinic's declaration with its area
    // left blank: title, body, place line, responsável, footer. A footer of a
    // location read from its own row is one line shorter per missing field, so
    // both rows here carry a name, one address line and one phone.
    const lines = (ops: string) => (ops.match(/> Tj$/gm) ?? []).length;
    expect(lines((await readPdf(pdf.bytes)).ops)).toBe(lines((await readPdf(atClinic.bytes)).ops));
  });

  it("the frame sits between the place line and the responsável line, clear of the footer", async () => {
    const { ops } = await readPdf((await generateDeclaracaoPdf(owner, { ...inputs, locationId: MN })).bytes);

    const place = ops.indexOf(drawn("Montemor-o-Novo, 12/07/2026"));
    const frame = ops.indexOf(FRAME_PATH);
    const responsavel = ops.indexOf(drawn("(Dr. João Paulo Santos Silva)"));
    expect(place).toBeGreaterThan(-1);
    expect(frame).toBeGreaterThan(place);
    expect(responsavel).toBeGreaterThan(frame);

    // The frame's bottom edge and the footer rule, in page points.
    const frameY = Number(/1 0 0 1 [\d.]+ ([\d.]+) cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m/.exec(ops)?.[1]);
    const responsavelY = Number(
      new RegExp(`1 0 0 1 [\\d.]+ ([\\d.]+) Tm\\n${drawn("(Dr. João Paulo Santos Silva)").replace(/[()<>]/g, "\\$&")}`).exec(ops)?.[1],
    );
    expect(frameY).toBeGreaterThan(responsavelY);
    expect(responsavelY).toBeGreaterThan(120);
  });

  it("its footer is its OWN row: its name, address and phone, and neither clinic's", async () => {
    await generateDeclaracaoPdf(owner, { ...inputs, locationId: MN });

    const { contact } = mockRender.mock.calls[0]![0];
    expect(contact).toEqual({
      name: MN_NAME,
      addressLines: [MN_ADDRESS],
      postalCode: null,
      city: null,
      phones: [MN_PHONE],
      email: null,
    });
    for (const block of Object.values(OSTEOJP_LOCATION_CONTACTS)) {
      for (const phone of block.phones) expect(contact?.phones).not.toContain(phone);
    }
  });

  it.each(["therapist", "reception", "admin"] as const)(
    "a %s assigned to the marked location issues it; one assigned elsewhere is refused as before",
    async (role) => {
      db.staffLocations[`mn-${role}`] = [MN];
      db.staffLocations[`lv-${role}`] = [LV];

      expect(await outcome(generateDeclaracaoPdf(actor(role, `mn-${role}`), { ...inputs, locationId: MN }))).toBe(
        "produced",
      );
      expect(await outcome(generateDeclaracaoPdf(actor(role, `lv-${role}`), { ...inputs, locationId: MN }))).toBe(
        "invalid",
      );
      expect(await declaracaoAvailability(actor(role, `lv-${role}`), MN)).toBe("invalid");
    },
  );
});

/* ==================================================================== */
/* The image case: unchanged                                             */
/* ==================================================================== */

describe("a location WITH a carimbo image behaves as today, marked or not", () => {
  it.each([
    { at: LV, city: "Linda-a-Velha", own: LV_BYTES, other: CB_BYTES },
    { at: CB, city: "Castelo Branco", own: CB_BYTES, other: LV_BYTES },
  ])("$city, not marked: its own carimbo, its city, no frame", async ({ at, city, own, other }) => {
    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: at });

    const model = mockRender.mock.calls[0]![0];
    expect(sameBytes(model.stampBytes, own)).toBe(true);
    expect(sameBytes(model.stampBytes, other)).toBe(false);
    expect(model.physicalStampArea).toBe(false);
    expect(model.localidade).toBe(city);

    const doc = await readPdf(pdf.bytes);
    expect(imagesDrawn(doc.ops)).toBe(2);
    expect(doc.ops).not.toContain(FRAME_PATH);
    expect(doc.ops).toContain(drawn(`${city}, 12/07/2026`));
  });

  it("a clinic with a carimbo that somebody MARKED: the image wins, and its city, not the stored place", async () => {
    db.tenant = marked({ [LV]: { place: "Outro Sitio" }, [MN]: { place: PLACE } });

    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: LV });

    const model = mockRender.mock.calls[0]![0];
    expect(sameBytes(model.stampBytes, LV_BYTES)).toBe(true);
    expect(model.physicalStampArea).toBe(false);
    expect(model.localidade).toBe("Linda-a-Velha");
    const doc = await readPdf(pdf.bytes);
    expect(doc.ops).not.toContain(FRAME_PATH);
    expect(doc.ops).not.toContain(drawn("Outro Sitio, 12/07/2026"));
  });

  // THE PIN AGAINST THE CODE BEFORE THIS CHANGE. The test under this one
  // compares the new code with itself; this one does not. Each hash is of the
  // page's drawing operators as the generator at d8d97191 (main, before the
  // physical-stamp setting existed) wrote them for the same fixture, computed by
  // running that commit's model, renderer, settings reader and generator. A
  // deliberate change to the clinics' page changes these two values with it.
  it.each([
    { at: LV, city: "Linda-a-Velha", length: 2328, sha256: "dab59be6979f91b705803d2960626afbb213e60f61b699f51e044926802abd27" },
    { at: CB, city: "Castelo Branco", length: 2334, sha256: "7b2516a2abfe3e2ec705ca3b559ae577d38761ecfc419c06d8ff69dff046f243" },
  ])("$city: the page is, operator for operator, the one issued BEFORE this change", async ({ at, length, sha256 }) => {
    const { ops } = await readPdf((await generateDeclaracaoPdf(owner, { ...inputs, locationId: at })).bytes);

    expect(ops.length).toBe(length);
    expect(createHash("sha256").update(ops, "latin1").digest("hex")).toBe(sha256);
  });

  it("the page of a clinic declaration does not change when another location is marked", async () => {
    const withMark = await generateDeclaracaoPdf(owner, { ...inputs, locationId: CB });
    db.tenant = { settings: {}, name: "OsteoJP, Lda.", nif: "515123456" };
    const without = await generateDeclaracaoPdf(owner, { ...inputs, locationId: CB });

    expect((await readPdf(withMark.bytes)).ops).toBe((await readPdf(without.bytes)).ops);
  });

  it("the tenant switch OFF at a clinic with a carimbo: blank space as before, and NO frame", async () => {
    db.tenant = marked({ [MN]: { place: PLACE } }, { signatureStamp: false });

    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: LV });

    const model = mockRender.mock.calls[0]![0];
    expect(model.stampBytes).toBeNull();
    expect(model.physicalStampArea).toBe(false);
    const doc = await readPdf(pdf.bytes);
    expect(imagesDrawn(doc.ops)).toBe(1);
    expect(doc.ops).not.toContain(FRAME_PATH);
  });
});

/* ==================================================================== */
/* The refusal: unchanged                                                */
/* ==================================================================== */

describe("a location with NEITHER an image nor the setting is still refused, with today's refusal", () => {
  it("the same location, not marked: no_stamp, nothing rendered", async () => {
    db.tenant = { settings: {}, name: "OsteoJP, Lda.", nif: "515123456" };

    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, MN)).toBe("no_stamp");
  });

  it("ANOTHER location is marked, this one is not: no_stamp. A mark is one location's", async () => {
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: OTHER }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, OTHER)).toBe("no_stamp");
  });

  it("the tenant switch OFF does not stand in for the mark", async () => {
    db.tenant = { settings: { declaracao: { signatureStamp: false } }, name: null, nif: null };

    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
  });

  it.each([
    ["a mark with no place", { [MN]: {} }],
    ["an empty place", { [MN]: { place: "" } }],
    ["a place of spaces", { [MN]: { place: "   " } }],
    ["a place that is not text", { [MN]: { place: 7 } }],
    ["a place longer than the setting stores", { [MN]: { place: "x".repeat(PHYSICAL_STAMP_PLACE_MAX + 1) } }],
    ["a place the document's font cannot print", { [MN]: { place: "Montemor \u2192 Novo" } }],
    ["a bare true", { [MN]: true }],
    ["a bare string", { [MN]: PLACE }],
    ["a null entry", { [MN]: null }],
    ["a list, not a map", [MN]],
    ["a mark keyed by the NAME, not the id", { [MN_NAME]: { place: PLACE } }],
  ])("a malformed mark (%s) is no mark: no_stamp, never a guessed place", async (_label, places) => {
    db.tenant = marked(places as Record<string, unknown>);

    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, MN)).toBe("no_stamp");
  });

  it("why that place is refused and not drawn: the renderer THROWS on it, and prints a pt-PT one", async () => {
    db.tenant = marked({ [MN]: { place: "S\u00e3o Jo\u00e3o da Madeira" } });
    const pdf = await generateDeclaracaoPdf(owner, { ...inputs, locationId: MN });
    expect((await readPdf(pdf.bytes)).ops).toContain(drawn("S\u00e3o Jo\u00e3o da Madeira, 12/07/2026"));

    const model = mockRender.mock.calls[0]![0];
    await expect(renderDeclaracaoPdf({ ...model, localidade: "Montemor \u2192 Novo" })).rejects.toThrow();
  });

  it("no tenant row in view: no_stamp", async () => {
    db.tenant = null;
    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: MN }))).toBe("no_stamp");
    expect(await declaracaoAvailability(owner, MN)).toBe("no_stamp");
  });

  it("an ARCHIVED location that is marked: invalid, as any archived location", async () => {
    db.tenant = marked({ [ARCHIVED]: { place: PLACE } });

    expect(await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId: ARCHIVED }))).toBe("invalid");
    expect(mockRender).not.toHaveBeenCalled();
    expect(await declaracaoAvailability(owner, ARCHIVED)).toBe("invalid");
  });

  it("the question asked first and the generator agree on every case", async () => {
    for (const locationId of [LV, CB, MN, OTHER, ARCHIVED, null]) {
      const available = await declaracaoAvailability(owner, locationId);
      const generated = await outcome(generateDeclaracaoPdf(owner, { ...inputs, locationId }));
      expect(generated, String(locationId)).toBe(available === "ok" ? "produced" : available);
    }
  });
});

/* ==================================================================== */
/* The setting itself                                                    */
/* ==================================================================== */

describe("the setting: tenants.settings.declaracao.physicalStamp, keyed by location id", () => {
  it("reads the place of a marked location, trimmed, and null for any other", () => {
    const settings = { declaracao: { physicalStamp: { [MN]: { place: "  Montemor-o-Novo " } } } };
    expect(readPhysicalStampPlace(settings, MN)).toBe("Montemor-o-Novo");
    expect(readPhysicalStampPlace(settings, LV)).toBeNull();
    expect(readPhysicalStampPlace(settings, "")).toBeNull();
    expect(readPhysicalStampPlace(null, MN)).toBeNull();
    expect(readPhysicalStampPlace({}, MN)).toBeNull();
    expect(readPhysicalStampPlace({ declaracao: "x" }, MN)).toBeNull();
  });

  it("a mark whose place is empty reads as null, not as an empty place", () => {
    for (const place of ["", "   "]) {
      expect(readPhysicalStampPlace({ declaracao: { physicalStamp: { [MN]: { place } } } }, MN)).toBeNull();
    }
  });

  it("the model never frames a declaration that carries a carimbo image", () => {
    const model = buildDeclaracaoModel({
      patientName: "Maria Silva",
      dia: "12/07/2026",
      horaInicio: "09:30",
      horaFim: "10:30",
      localidade: "Linda-a-Velha",
      stampLocationKey: "linda-a-velha",
      physicalStamp: true,
      tenantSettings: {},
    });
    expect(sameBytes(model.stampBytes, LV_BYTES)).toBe(true);
    expect(model.physicalStampArea).toBe(false);
  });

  it("an id that is also an Object.prototype member is not a marked location", () => {
    const settings = { declaracao: { physicalStamp: {} } };
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(readPhysicalStampPlace(settings, key)).toBeNull();
    }
  });

  it("setting a mark keeps every other key of the blob, of the namespace and of the other marks", () => {
    const before = {
      contacts: { phone: "210 000 000" },
      secrets: { k: "v" },
      declaracao: {
        responsavel: "Dra. Teste",
        signatureStamp: false,
        physicalStamp: { [OTHER]: { place: "Outro" } },
      },
    };

    const after = withPhysicalStamp(before, MN, PLACE);

    expect(after).toEqual({
      contacts: { phone: "210 000 000" },
      secrets: { k: "v" },
      declaracao: {
        responsavel: "Dra. Teste",
        signatureStamp: false,
        physicalStamp: { [OTHER]: { place: "Outro" }, [MN]: { place: PLACE } },
      },
    });
    // The input is not edited in place.
    expect(before.declaracao.physicalStamp).toEqual({ [OTHER]: { place: "Outro" } });
    // The two older settings of the namespace read exactly as before.
    expect(readDeclaracaoSettings(after)).toEqual({ responsavel: "Dra. Teste", signatureStamp: false });
  });

  it("clearing a mark removes that location's entry and no other", () => {
    const both = withPhysicalStamp(withPhysicalStamp({}, MN, PLACE), OTHER, "Outro");
    const cleared = withPhysicalStamp(both, MN, null);

    expect(readPhysicalStampPlace(cleared, MN)).toBeNull();
    expect(readPhysicalStampPlace(cleared, OTHER)).toBe("Outro");
    expect(Object.keys((cleared.declaracao as { physicalStamp: object }).physicalStamp)).toEqual([OTHER]);
  });

  it("a blob with no declaracao namespace, or none at all, gains one and nothing else", () => {
    expect(withPhysicalStamp(null, MN, PLACE)).toEqual({ declaracao: { physicalStamp: { [MN]: { place: PLACE } } } });
    expect(withPhysicalStamp({ locale: "pt" }, MN, PLACE)).toEqual({
      locale: "pt",
      declaracao: { physicalStamp: { [MN]: { place: PLACE } } },
    });
  });

  it("the suggested place is what follows the postal code of the address, and empty without one", () => {
    expect(placeFromAddress(MN_ADDRESS)).toBe("Montemor-o-Novo");
    expect(placeFromAddress("R. Exemplo 6, 6000-140 Castelo Branco ")).toBe("Castelo Branco");
    expect(placeFromAddress("Rua do registo, 1")).toBe("");
    expect(placeFromAddress(null)).toBe("");
    expect(placeFromAddress("")).toBe("");
  });
});
