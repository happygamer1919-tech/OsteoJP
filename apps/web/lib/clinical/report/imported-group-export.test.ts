import { beforeEach, describe, expect, it, vi } from "vitest";

// EXPORT-01: the imported group's PDF, on the tab's read replaced by rows.
// The real rows and the real RLS are in registo-export.db.test.ts, where every
// registo is a draft; the FINALIZED cases are here.
//
//   WHO      a reader of clinical records; reception is refused before any
//            read. The read is the Registos tab's own (`listFichaRecords`, with
//            the caller's context), asked with annulled registos included.
//   WHICH    the tab's grouping run again (`groupForFicha`): the registos of
//            imported episodes whose title is the label asked for, oldest
//            first. Finalized ones are in the file, an annulled one among them;
//            a draft never is.
//   RENDER   each registo through the per-record engine as the caller, under
//            the registo page's read scope asked once, joined in the group's
//            order.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/patients/scope", () => ({ therapistPatientReadScope: vi.fn(async () => undefined) }));
vi.mock("../ficha-groups", () => ({ listFichaRecords: vi.fn() }));
vi.mock("./generate", () => ({ generateRegistoReportPdf: vi.fn(), registoReadScope: vi.fn() }));
vi.mock("./episode-pdf", () => ({ mergeReportPdfs: vi.fn() }));

import { sql } from "drizzle-orm";
import { ForbiddenError, type RequestContext } from "@osteojp/auth";
import { ClinicalError } from "../errors";
import { listFichaRecords } from "../ficha-groups";
import type { FichaRecord } from "../ficha-groups-core";
import {
  readImportedGroupExportSelection,
  readImportedGroupRecords,
  renderImportedGroupReport,
} from "./episode-export";
import { mergeReportPdfs } from "./episode-pdf";
import { generateRegistoReportPdf, registoReadScope } from "./generate";

const mockList = vi.mocked(listFichaRecords);
const mockGenerate = vi.mocked(generateRegistoReportPdf);
const mockScope = vi.mocked(registoReadScope);
const mockMerge = vi.mocked(mergeReportPdfs);

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const ctxOf = (role: RequestContext["role"]): RequestContext => ({ tenantId: TENANT, role, userId: USER });
const owner = ctxOf("owner");
const ask = { patientId: PATIENT, specialty: "Osteopatia" };

let seq = 0;
/** One registo of the tab's read; imported, locked, in an episode of its own. */
function rec(id: string, at: string, over: Partial<FichaRecord> = {}): FichaRecord {
  seq += 1;
  return {
    id,
    status: "locked",
    version: 1,
    supersedesId: null,
    createdAt: at,
    updatedAt: "2026-09-20T10:00:00.000Z",
    annulled: false,
    templateTitle: null,
    episodeId: `imported-episode-${seq}`,
    episodeTitle: "Osteopatia",
    episodeImported: true,
    excerpt: null,
    ...over,
  };
}

const MAY = "2024-05-10T23:00:00.000Z";
const JUNE = "2024-06-10T23:00:00.000Z";
const JULY = "2024-07-10T23:00:00.000Z";
const AUGUST = "2024-08-10T23:00:00.000Z";

beforeEach(() => {
  mockList.mockReset();
  mockGenerate.mockReset();
  mockScope.mockReset();
  mockMerge.mockReset();
});

describe("readImportedGroupRecords: who may ask, and what is read", () => {
  it("reception is refused before any read", async () => {
    await expect(readImportedGroupRecords(ctxOf("reception"), ask)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockList).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "therapist"] as const)("%s: the tab's own read, as that caller, for this patient, annulled registos included", async (role) => {
    mockList.mockResolvedValue([rec("r1", MAY)]);
    await readImportedGroupRecords(ctxOf(role), ask);
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith(ctxOf(role), { patientId: PATIENT, includeAnnulled: true });
  });

  it("a patient id posted in uppercase is read in lowercase", async () => {
    mockList.mockResolvedValue([]);
    await readImportedGroupRecords(owner, { patientId: PATIENT.toUpperCase(), specialty: "Osteopatia" });
    expect(mockList).toHaveBeenCalledWith(owner, { patientId: PATIENT, includeAnnulled: true });
  });

  it.each([
    ["a patient id that is not a uuid", { patientId: "not-a-uuid", specialty: "Osteopatia" }],
    ["an empty label", { patientId: PATIENT, specialty: "" }],
    ["a label longer than any specialty", { patientId: PATIENT, specialty: "x".repeat(121) }],
    ["a label that is not a string", { patientId: PATIENT, specialty: 7 as unknown as string }],
    ["a patient id that is not a string", { patientId: null as unknown as string, specialty: "Osteopatia" }],
  ])("%s: null, and nothing is read", async (_label, input) => {
    expect(await readImportedGroupRecords(owner, input)).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("the group is the imported registos of THAT specialty: another specialty, an app episode and 'Sem episódio' are not in it", async () => {
    mockList.mockResolvedValue([
      rec("osteo-2", JUNE),
      rec("fisio-1", MAY, { episodeTitle: "Fisioterapia" }),
      rec("app-1", JULY, { episodeId: "app-episode", episodeTitle: "Osteopatia (01/07/2024)", episodeImported: false }),
      // An APP episode titled exactly like the specialty is still not imported.
      rec("app-2", JULY, { episodeId: "app-episode-2", episodeTitle: "Osteopatia", episodeImported: false }),
      rec("free-1", AUGUST, { episodeId: null, episodeTitle: null, episodeImported: false }),
      rec("osteo-1", MAY),
    ]);
    expect((await readImportedGroupRecords(owner, ask))?.map((r) => r.id)).toEqual(["osteo-1", "osteo-2"]);
  });

  it("no imported group of that label among the registos the caller reads: null", async () => {
    mockList.mockResolvedValue([rec("fisio-1", MAY, { episodeTitle: "Fisioterapia" })]);
    expect(await readImportedGroupRecords(owner, ask)).toBeNull();
    mockList.mockResolvedValue([]);
    expect(await readImportedGroupRecords(owner, ask)).toBeNull();
  });
});

describe("readImportedGroupExportSelection: what the file holds", () => {
  it("the finalized registos of the group, oldest first, an ANNULLED one among them; a DRAFT is counted out", async () => {
    mockList.mockResolvedValue([
      // Handed over out of order: the order is the grouping's, not the read's.
      rec("r-july-annulled", JULY, { status: "signed", annulled: true }),
      rec("r-may", MAY),
      rec("r-august-draft", AUGUST, { status: "draft" }),
      rec("r-june", JUNE, { status: "signed" }),
    ]);
    expect(await readImportedGroupExportSelection(owner, ask)).toEqual({
      patientId: PATIENT,
      specialty: "Osteopatia",
      recordIds: ["r-may", "r-june", "r-july-annulled"],
      leftOut: 1,
    });
  });

  it("a later version stays with its record, after it", async () => {
    mockList.mockResolvedValue([
      rec("v2", MAY, { version: 2, supersedesId: "v1", status: "signed", episodeId: "same-episode" }),
      rec("v1", MAY, { episodeId: "same-episode" }),
    ]);
    expect((await readImportedGroupExportSelection(owner, ask))?.recordIds).toEqual(["v1", "v2"]);
  });

  it.each([
    ["drafts only", [rec("d1", MAY, { status: "draft" }), rec("d2", JUNE, { status: "draft" })]],
    ["an annulled draft only", [rec("d1", MAY, { status: "draft", annulled: true })]],
    ["no imported registo of that specialty", [rec("f1", MAY, { episodeTitle: "Fisioterapia" })]],
    ["no registo the caller reads", []],
  ])("%s: null, and nothing is rendered", async (_label, rows) => {
    mockList.mockResolvedValue(rows);
    expect(await readImportedGroupExportSelection(owner, ask)).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("an imported group whose only finalized registo is ANNULLED is exported: an export never refuses it", async () => {
    mockList.mockResolvedValue([rec("r-annulled", MAY, { status: "signed", annulled: true })]);
    expect(await readImportedGroupExportSelection(owner, ask)).toEqual({
      patientId: PATIENT,
      specialty: "Osteopatia",
      recordIds: ["r-annulled"],
      leftOut: 0,
    });
  });
});

describe("renderImportedGroupReport: each registo through the per-record engine, as the caller, under the registo page's read scope", () => {
  const selection = { patientId: PATIENT, specialty: "Osteopatia", recordIds: ["r1", "r2", "r3"], leftOut: 1 };
  const part = (n: number) => new Uint8Array([n]);
  const JOINED = new Uint8Array([9, 9, 9]);
  // A marker: the box `registoReadScope` answered with must be the one every
  // registo is printed under, itself and not a look-alike.
  const SCOPE = { value: sql`READ_SCOPE_MARKER` };

  beforeEach(() => {
    mockScope.mockResolvedValue(SCOPE);
  });

  it.each(["owner", "admin", "therapist"] as const)("%s: one engine call per registo, in the group's order, with the read scope asked ONCE; the parts are joined in that order", async (role) => {
    mockGenerate.mockImplementation(async (_ctx, id) => ({ bytes: part(Number(id.slice(1))), filename: "x.pdf" }));
    mockMerge.mockResolvedValue(JOINED);
    const c = ctxOf(role);
    expect(await renderImportedGroupReport(c, selection, "pt")).toEqual({
      bytes: JOINED,
      filename: "relatorio-episodio-importado-4444aaaa.pdf",
      recordIds: ["r1", "r2", "r3"],
      leftOut: 1,
    });
    expect(mockScope).toHaveBeenCalledTimes(1);
    expect(mockScope).toHaveBeenCalledWith(c);
    expect(mockGenerate.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      [c, "r1", "pt"],
      [c, "r2", "pt"],
      [c, "r3", "pt"],
    ]);
    // The selection is never trusted for reach: every registo is read under
    // the scope, so one of a patient the caller may not open is not printed.
    for (const call of mockGenerate.mock.calls) expect(call[3]).toBe(SCOPE);
    expect(mockMerge).toHaveBeenCalledTimes(1);
    expect(mockMerge.mock.calls[0]![0]).toEqual([part(1), part(2), part(3)]);
  });

  it("reception is refused before the read scope is asked, whoever made the selection", async () => {
    await expect(renderImportedGroupReport(ctxOf("reception"), selection, "pt")).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockScope).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockMerge).not.toHaveBeenCalled();
  });

  it.each(["not_found", "not_printable"] as const)(
    "a registo the engine answers %s for at the render is left out and counted, and the rest is the file",
    async (code) => {
      mockGenerate.mockImplementation(async (_ctx, id) => {
        if (id === "r2") throw new ClinicalError(code);
        return { bytes: part(Number(id.slice(1))), filename: "x.pdf" };
      });
      mockMerge.mockResolvedValue(JOINED);
      expect(await renderImportedGroupReport(owner, selection, "pt")).toMatchObject({
        recordIds: ["r1", "r3"],
        leftOut: 2,
      });
      expect(mockMerge.mock.calls[0]![0]).toEqual([part(1), part(3)]);
    },
  );

  it("the engine refuses every registo: null, and nothing is joined", async () => {
    mockGenerate.mockRejectedValue(new ClinicalError("not_printable"));
    expect(await renderImportedGroupReport(owner, selection, "pt")).toBeNull();
    expect(mockMerge).not.toHaveBeenCalled();
  });

  it("any other fault ends the export: it is not swallowed, and nothing is joined", async () => {
    const fault = new Error("connection reset");
    mockGenerate.mockRejectedValue(fault);
    await expect(renderImportedGroupReport(owner, selection, "pt")).rejects.toBe(fault);
    expect(mockMerge).not.toHaveBeenCalled();
  });
});
