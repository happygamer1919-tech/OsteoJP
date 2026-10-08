import { beforeEach, describe, expect, it, vi } from "vitest";

// EXPORT-01: "Exportar ficha", the whole patient's PDF, on the tab's read
// replaced by rows. The real rows and the real RLS are in
// ficha-export.db.test.ts, where every registo is a draft; the FINALIZED cases
// are here, and the drawn pages are in ficha-export-pdf.test.ts.
//
//   WHO      a reader of clinical records; reception is refused before any
//            read. The read is the Registos tab's own (`listFichaRecords`, with
//            the caller's context), asked with annulled registos included.
//   WHICH    the tab's grouping run again (`groupForFicha`), then the pure rule
//            (ficha-export-core.ts): finalized registos, an annulled one among
//            them, never a draft, under one section per group, oldest first,
//            "Sem episódio" last.
//   RENDER   a heading page per section, then each registo through the
//            per-record engine as the caller (`generateRegistoReportPdf`, with
//            the read scope asked once), joined in that order.

vi.mock("server-only", () => ({}));
vi.mock("../ficha-groups", () => ({ listFichaRecords: vi.fn() }));
vi.mock("./generate", () => ({ generateRegistoReportPdf: vi.fn(), registoReadScope: vi.fn() }));
vi.mock("./episode-pdf", () => ({ mergeReportPdfs: vi.fn() }));
vi.mock("./pdf", () => ({ renderSectionPagePdf: vi.fn() }));

import { sql } from "drizzle-orm";
import { ForbiddenError, type RequestContext } from "@osteojp/auth";
import { ClinicalError } from "../errors";
import { listFichaRecords } from "../ficha-groups";
import type { FichaRecord } from "../ficha-groups-core";
import { mergeReportPdfs } from "./episode-pdf";
import {
  readPatientFichaExportSelection,
  readPatientFichaGroups,
  renderPatientFichaReport,
  type FichaExportSelection,
} from "./ficha-export";
import { generateRegistoReportPdf, registoReadScope } from "./generate";
import { renderSectionPagePdf } from "./pdf";

const mockList = vi.mocked(listFichaRecords);
const mockGenerate = vi.mocked(generateRegistoReportPdf);
const mockScope = vi.mocked(registoReadScope);
const mockMerge = vi.mocked(mergeReportPdfs);
const mockSection = vi.mocked(renderSectionPagePdf);

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const EP_APP = "77777777-7777-4777-8777-777777777771";
const ctxOf = (role: RequestContext["role"]): RequestContext => ({ tenantId: TENANT, role, userId: USER });
const owner = ctxOf("owner");
const ask = { patientId: PATIENT };

let seq = 0;
function rec(id: string, at: string, over: Partial<FichaRecord> = {}): FichaRecord {
  seq += 1;
  return {
    id,
    status: "signed",
    version: 1,
    supersedesId: null,
    createdAt: at,
    updatedAt: "2026-09-20T10:00:00.000Z",
    annulled: false,
    templateTitle: null,
    episodeId: null,
    episodeTitle: null,
    episodeImported: false,
    excerpt: null,
    ...over,
  };
}
const app = (id: string, at: string, over: Partial<FichaRecord> = {}) =>
  rec(id, at, { episodeId: EP_APP, episodeTitle: "Osteopatia (01/03/2026)", ...over });
const imported = (id: string, at: string, over: Partial<FichaRecord> = {}) =>
  rec(id, at, { episodeId: `imported-${seq}`, episodeTitle: "Fisioterapia", episodeImported: true, status: "locked", ...over });

const day = (d: string) => `${d}T09:00:00.000Z`;

beforeEach(() => {
  mockList.mockReset();
  mockGenerate.mockReset();
  mockScope.mockReset();
  mockMerge.mockReset();
  mockSection.mockReset();
});

describe("readPatientFichaGroups: who may ask, and what is read", () => {
  it("reception is refused before any read", async () => {
    await expect(readPatientFichaGroups(ctxOf("reception"), ask)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readPatientFichaExportSelection(ctxOf("reception"), ask)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockList).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "therapist"] as const)("%s: the tab's own read, once, as that caller, for this patient, annulled registos included", async (role) => {
    mockList.mockResolvedValue([app("a1", day("2026-03-01"))]);
    await readPatientFichaGroups(ctxOf(role), ask);
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith(ctxOf(role), { patientId: PATIENT, includeAnnulled: true });
  });

  it("a patient id posted in uppercase is read in lowercase", async () => {
    mockList.mockResolvedValue([]);
    await readPatientFichaGroups(owner, { patientId: PATIENT.toUpperCase() });
    expect(mockList).toHaveBeenCalledWith(owner, { patientId: PATIENT, includeAnnulled: true });
  });

  it.each([
    ["a patient id that is not a uuid", "not-a-uuid"],
    ["an empty patient id", ""],
    ["a patient id that is not a string", null as unknown as string],
  ])("%s: null, and nothing is read", async (_label, patientId) => {
    expect(await readPatientFichaGroups(owner, { patientId })).toBeNull();
    expect(await readPatientFichaExportSelection(owner, { patientId })).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("the groups are the tab's: an app episode, the imported specialty, 'Sem episódio'", async () => {
    mockList.mockResolvedValue([app("a1", day("2026-03-01")), imported("f1", day("2019-05-10")), rec("free1", day("2026-07-01"))]);
    expect((await readPatientFichaGroups(owner, ask))?.map((g) => g.key).sort()).toEqual(
      [`episode:${EP_APP}`, "imported:Fisioterapia", "none"].sort(),
    );
  });
});

describe("readPatientFichaExportSelection: what the file holds", () => {
  it("every finalized registo the caller reads, under its section, oldest first, 'Sem episódio' last; an ANNULLED one among them; a DRAFT counted out (G3)", async () => {
    mockList.mockResolvedValue([
      // Handed over out of order: the order is the rule's, not the read's.
      rec("free1", day("2018-01-01")),
      app("a2-annulled", day("2026-03-08"), { annulled: true }),
      app("a-draft", day("2026-03-15"), { status: "draft" }),
      imported("f2", day("2019-06-10")),
      app("a1", day("2026-03-01"), { status: "locked" }),
      imported("f1", day("2019-05-10")),
      imported("f-draft", day("2019-07-10"), { status: "draft" }),
    ]);
    expect(await readPatientFichaExportSelection(owner, ask)).toEqual({
      patientId: PATIENT,
      sections: [
        { kind: "imported", label: "Fisioterapia", recordIds: ["f1", "f2"] },
        { kind: "episode", label: "Osteopatia (01/03/2026)", recordIds: ["a1", "a2-annulled"] },
        { kind: "none", label: null, recordIds: ["free1"] },
      ],
      leftOut: 2,
    });
  });

  it.each([
    ["drafts only", [app("d1", day("2026-03-01"), { status: "draft" }), rec("d2", day("2026-04-01"), { status: "draft" })]],
    ["an annulled draft only", [rec("d1", day("2026-03-01"), { status: "draft", annulled: true })]],
    ["no registo the caller reads (a patient outside their reach, or none filed)", []],
  ])("%s: null, and nothing is rendered (G2, G3)", async (_label, rows) => {
    mockList.mockResolvedValue(rows);
    expect(await readPatientFichaExportSelection(owner, ask)).toBeNull();
    expect(mockScope).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSection).not.toHaveBeenCalled();
  });

  it("a patient whose only finalized registo is ANNULLED is exported: an export never refuses it", async () => {
    mockList.mockResolvedValue([rec("only-annulled", day("2026-07-01"), { annulled: true })]);
    expect(await readPatientFichaExportSelection(owner, ask)).toEqual({
      patientId: PATIENT,
      sections: [{ kind: "none", label: null, recordIds: ["only-annulled"] }],
      leftOut: 0,
    });
  });
});

describe("renderPatientFichaReport: a heading page per section, then each registo as the caller", () => {
  const selection: FichaExportSelection = {
    patientId: PATIENT,
    sections: [
      { kind: "imported", label: "Fisioterapia", recordIds: ["r1", "r2"] },
      { kind: "episode", label: "Osteopatia (01/03/2026)", recordIds: ["r3"] },
      { kind: "none", label: null, recordIds: ["r4"] },
    ],
    leftOut: 1,
  };
  const part = (n: number) => new Uint8Array([n]);
  /** A heading page's bytes, told apart from a registo's by the title's length. */
  const headingBytes = (title: string) => new Uint8Array([200, title.length]);
  const JOINED = new Uint8Array([9, 9, 9]);
  // A marker: the box `registoReadScope` answered with must be the one every
  // registo is printed under, itself and not a look-alike.
  const SCOPE = { value: sql`READ_SCOPE_MARKER` };

  function engine(refuse: Record<string, "not_found" | "not_printable"> = {}) {
    mockScope.mockResolvedValue(SCOPE);
    mockGenerate.mockImplementation(async (_ctx, id) => {
      if (refuse[id]) throw new ClinicalError(refuse[id]);
      return { bytes: part(Number(id.slice(1))), filename: "x.pdf" };
    });
    mockSection.mockImplementation(async (heading) => headingBytes(heading.title));
    mockMerge.mockResolvedValue(JOINED);
  }

  it.each(["owner", "admin", "therapist"] as const)("%s: one engine call per registo, as that caller, with the read scope asked ONCE", async (role) => {
    engine();
    const c = ctxOf(role);
    expect(await renderPatientFichaReport(c, selection, "pt")).toEqual({
      bytes: JOINED,
      filename: "relatorio-ficha-4444aaaa.pdf",
      recordIds: ["r1", "r2", "r3", "r4"],
      sections: 3,
      leftOut: 1,
    });
    expect(mockScope).toHaveBeenCalledTimes(1);
    expect(mockScope).toHaveBeenCalledWith(c);
    expect(mockGenerate.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      [c, "r1", "pt"],
      [c, "r2", "pt"],
      [c, "r3", "pt"],
      [c, "r4", "pt"],
    ]);
    for (const call of mockGenerate.mock.calls) expect(call[3]).toBe(SCOPE);
  });

  it("reception is refused before the read scope is asked, whoever made the selection", async () => {
    engine();
    await expect(renderPatientFichaReport(ctxOf("reception"), selection, "pt")).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockScope).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSection).not.toHaveBeenCalled();
  });

  it("the headings: an episode by its title, the imported history by its specialty and 'Importado', and 'Sem episódio' in the tab's own words", async () => {
    engine();
    await renderPatientFichaReport(owner, selection, "pt");
    expect(mockSection.mock.calls).toEqual([
      [{ overline: "Episódio", title: "Fisioterapia", note: "Importado" }, "pt"],
      [{ overline: "Episódio", title: "Osteopatia (01/03/2026)", note: null }, "pt"],
      [{ overline: null, title: "Sem episódio", note: null }, "pt"],
    ]);
  });

  it("a section with no name to give (a blank imported title groups under a dash, or no label at all) is headed 'Episódio', once, and never by the dash", async () => {
    engine();
    const unnamed: FichaExportSelection = {
      patientId: PATIENT,
      sections: [
        { kind: "imported", label: "\u2014", recordIds: ["r1"] },
        { kind: "episode", label: null, recordIds: ["r2"] },
      ],
      leftOut: 0,
    };
    await renderPatientFichaReport(owner, unnamed, "pt");
    expect(mockSection.mock.calls.map((c) => c[0])).toEqual([
      { overline: null, title: "Episódio", note: "Importado" },
      { overline: null, title: "Episódio", note: null },
    ]);
    expect(JSON.stringify(mockSection.mock.calls)).not.toMatch(/[\u2013\u2014]/);
  });

  it("the headings follow the language asked for", async () => {
    engine();
    await renderPatientFichaReport(owner, selection, "en");
    expect(mockSection.mock.calls.map((c) => c[0])).toEqual([
      { overline: "Episode", title: "Fisioterapia", note: "Imported" },
      { overline: "Episode", title: "Osteopatia (01/03/2026)", note: null },
      { overline: null, title: "No episode", note: null },
    ]);
  });

  it("the file: each section's heading, then its registos, in the selection's order, joined once", async () => {
    engine();
    await renderPatientFichaReport(owner, selection, "pt");
    expect(mockMerge).toHaveBeenCalledTimes(1);
    expect(mockMerge.mock.calls[0]![0]).toEqual([
      headingBytes("Fisioterapia"),
      part(1),
      part(2),
      headingBytes("Osteopatia (01/03/2026)"),
      part(3),
      headingBytes("Sem episódio"),
      part(4),
    ]);
    expect(mockMerge.mock.calls[0]![1]).toBe("Relatório Clínico");
  });

  it.each(["not_found", "not_printable"] as const)(
    "a registo the engine answers %s for at the render (a draft, or one out of reach) is left out and counted, and the rest is the file",
    async (code) => {
      engine({ r2: code });
      expect(await renderPatientFichaReport(owner, selection, "pt")).toMatchObject({
        recordIds: ["r1", "r3", "r4"],
        sections: 3,
        leftOut: 2,
      });
      expect(mockMerge.mock.calls[0]![0]).toEqual([
        headingBytes("Fisioterapia"),
        part(1),
        headingBytes("Osteopatia (01/03/2026)"),
        part(3),
        headingBytes("Sem episódio"),
        part(4),
      ]);
    },
  );

  it("a section the engine prints nothing of gets NO heading page", async () => {
    engine({ r3: "not_printable" });
    expect(await renderPatientFichaReport(owner, selection, "pt")).toMatchObject({
      recordIds: ["r1", "r2", "r4"],
      sections: 2,
      leftOut: 2,
    });
    expect(mockSection.mock.calls.map((c) => c[0].title)).toEqual(["Fisioterapia", "Sem episódio"]);
    expect(mockMerge.mock.calls[0]![0]).toEqual([headingBytes("Fisioterapia"), part(1), part(2), headingBytes("Sem episódio"), part(4)]);
  });

  it("the engine refuses every registo: null, no heading drawn, and nothing is joined", async () => {
    engine({ r1: "not_found", r2: "not_found", r3: "not_printable", r4: "not_found" });
    expect(await renderPatientFichaReport(owner, selection, "pt")).toBeNull();
    expect(mockSection).not.toHaveBeenCalled();
    expect(mockMerge).not.toHaveBeenCalled();
  });

  it("any other fault ends the export: it is not swallowed, and nothing is joined", async () => {
    engine();
    const fault = new Error("connection reset");
    mockGenerate.mockRejectedValue(fault);
    await expect(renderPatientFichaReport(owner, selection, "pt")).rejects.toBe(fault);
    expect(mockMerge).not.toHaveBeenCalled();
  });
});
