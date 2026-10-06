import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// downloadEpisodeReportUrlAction, "PDF do episódio" on the Registos tab
// (EPI-01b, piece 3). These arms pin the action's own order and what each
// refusal leaves behind:
//
//   capability, id shape  ->  which registos (the caller's own reads)
//     ->  the document ceiling, once  ->  render  ->  upload  ->  signed URL
//     ->  the audit row  ->  the URL.
//
// A refusal at any step returns `{ url: null }` and runs NO later step: nothing
// rendered, stored, signed or audited, and before the ceiling, no slot spent.
// A FAILURE (a step that threw, or a Storage call that answered with an error)
// returns the same and logs ONE line naming the step and nothing else. When
// the audit row cannot be written, the file just stored is removed.
// Which registos the file holds is pinned in episode-export-core.test.ts, the
// reads in episode-export.test.ts and, on real rows, episode-export.db.test.ts.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/clinical/report/episode-export", () => ({
  readEpisodeExportSelection: vi.fn(),
  renderEpisodeReport: vi.fn(),
  recordEpisodeExport: vi.fn(),
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import type { RequestContext } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import {
  readEpisodeExportSelection,
  recordEpisodeExport,
  renderEpisodeReport,
} from "@/lib/clinical/report/episode-export";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadEpisodeReportUrlAction } from "./episode-pdf-actions";

const mockCtx = vi.mocked(requireRequestContext);
const mockSelection = vi.mocked(readEpisodeExportSelection);
const mockRender = vi.mocked(renderEpisodeReport);
const mockAudit = vi.mocked(recordEpisodeExport);
const mockCeiling = vi.mocked(documentGenerationAllowed);
const mockAdmin = vi.mocked(createSupabaseAdminClient);

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const EPISODE = "7777cccc-7777-4777-8777-777777777771";
const SIGNED = "https://storage.example/signed?token=opaque";
const BYTES = new Uint8Array([37, 80, 68, 70]);
const ctxOf = (role: RequestContext["role"]): RequestContext => ({ tenantId: TENANT, role, userId: USER });

const selection = { episodeId: EPISODE, patientId: PATIENT, recordIds: ["r1", "r2"], leftOut: 1 };
const pdf = { bytes: BYTES, filename: "relatorio-episodio-7777cccc.pdf", recordIds: ["r1", "r2"], leftOut: 1 };

/** The order the steps ran in. */
let steps: string[] = [];
let upload: ReturnType<typeof vi.fn>;
let createSignedUrl: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let buckets: string[] = [];
let logged: ReturnType<typeof vi.spyOn>;

/** The one line a failed export logs for `step`. */
const failureLine = (step: string) => `[episode-pdf] the episode export failed at step: ${step}`;

type StorageFault = "error" | "throws";
function stubStorage(opts: { upload?: StorageFault; sign?: StorageFault; remove?: StorageFault } = {}) {
  upload = vi.fn(async () => {
    steps.push("upload");
    if (opts.upload === "throws") throw new Error("Zzz Paciente Inventado");
    return opts.upload === "error" ? { data: null, error: { message: "x" } } : { data: { path: "x" }, error: null };
  });
  createSignedUrl = vi.fn(async () => {
    steps.push("sign");
    if (opts.sign === "throws") throw new Error("Zzz Paciente Inventado");
    return opts.sign === "error" ? { data: null, error: { message: "x" } } : { data: { signedUrl: SIGNED }, error: null };
  });
  remove = vi.fn(async () => {
    steps.push("remove");
    if (opts.remove === "throws") throw new Error("Zzz Paciente Inventado");
    return opts.remove === "error" ? { data: null, error: { message: "x" } } : { data: [], error: null };
  });
  mockAdmin.mockImplementation(() => {
    steps.push("admin");
    return {
      storage: {
        from: (bucket: string) => {
          buckets.push(bucket);
          return { upload, createSignedUrl, remove };
        },
      },
    } as unknown as ReturnType<typeof createSupabaseAdminClient>;
  });
}

/** Every step answers yes; an arm then breaks the one it is about. */
function allGood(role: RequestContext["role"] = "therapist") {
  mockCtx.mockResolvedValue(ctxOf(role));
  mockSelection.mockImplementation(async () => {
    steps.push("selection");
    return selection;
  });
  mockCeiling.mockImplementation(async () => {
    steps.push("ceiling");
    return true;
  });
  mockRender.mockImplementation(async () => {
    steps.push("render");
    return pdf;
  });
  mockAudit.mockImplementation(async () => {
    steps.push("audit");
  });
  stubStorage();
}

/** Nothing was rendered, stored, signed or audited, and nothing was removed. */
function expectNothingProduced() {
  expect(mockRender).not.toHaveBeenCalled();
  expect(mockAdmin).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(createSignedUrl).not.toHaveBeenCalled();
  expect(mockAudit).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  steps = [];
  buckets = [];
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  allGood();
});
afterEach(() => {
  logged.mockRestore();
});

describe("downloadEpisodeReportUrlAction: an export, step by step", () => {
  it("the order: which registos, the ceiling, the render, the upload, the signed URL, the audit row, and only then the URL", async () => {
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: SIGNED });
    expect(steps).toEqual(["selection", "ceiling", "render", "admin", "upload", "sign", "audit"]);
    // A finished export removes nothing and logs nothing.
    expect(remove).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "therapist"] as const)("%s reads clinical records, so the export runs", async (role) => {
    allGood(role);
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: SIGNED });
    expect(mockSelection).toHaveBeenCalledWith(ctxOf(role), { patientId: PATIENT, episodeId: EPISODE });
  });

  it("the ceiling is asked ONCE per export, for the caller, whatever the number of registos", async () => {
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(mockCeiling).toHaveBeenCalledTimes(1);
    expect(mockCeiling).toHaveBeenCalledWith(USER);
  });

  it("the render gets the caller, the selection that was read and the app's locale", async () => {
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledWith(ctxOf("therapist"), selection, "pt");
  });

  it("the object: the per-record bucket, a tenant-prefixed path of ids under episode-reports, a PDF", async () => {
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(buckets).toEqual(["clinical-attachments", "clinical-attachments"]);
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, bytes, options] = upload.mock.calls[0]!;
    expect(path).toMatch(
      new RegExp(`^${TENANT}/episode-reports/${EPISODE}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pdf$`),
    );
    expect(String(path)).not.toContain(PATIENT);
    expect(bytes).toBe(BYTES);
    expect(options).toEqual({ contentType: "application/pdf", upsert: true });
  });

  it("two exports of one episode are two objects: the path is new every time", async () => {
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(upload.mock.calls[0]![0]).not.toBe(upload.mock.calls[1]![0]);
  });

  it("the signed URL: the object just stored, 60 seconds, a download named by the episode id's first block", async () => {
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith(upload.mock.calls[0]![0], 60, {
      download: "relatorio-episodio-7777cccc.pdf",
    });
  });

  it("the audit row is asked for once, with the episode, the patient, the registos in the file and the count left out, and nothing else", async () => {
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit).toHaveBeenCalledWith(ctxOf("therapist"), {
      episodeId: EPISODE,
      patientId: PATIENT,
      recordIds: ["r1", "r2"],
      leftOut: 1,
    });
  });

  it("the registos audited are the ones the render put in the file, not the ones selected: one the engine refused at the last moment is counted out and not named", async () => {
    // Selected: r1 and r2. The engine printed r2 only.
    mockRender.mockResolvedValue({ ...pdf, recordIds: ["r2"], leftOut: 2 });
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(mockAudit.mock.calls[0]![1]).toEqual({
      episodeId: EPISODE,
      patientId: PATIENT,
      recordIds: ["r2"],
      leftOut: 2,
    });
  });

  it("the registos audited keep the file's order, whatever order that is", async () => {
    mockRender.mockResolvedValue({ ...pdf, recordIds: ["r2", "r1"] });
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({ recordIds: ["r2", "r1"] });
  });
});

describe("downloadEpisodeReportUrlAction: every refusal produces nothing", () => {
  it("reception (no clinical_records:read): refused before any read, and no slot spent", async () => {
    allGood("reception");
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(mockSelection).not.toHaveBeenCalled();
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
  });

  it.each([
    ["an empty patient id", "", EPISODE],
    ["an empty episode id", PATIENT, ""],
    ["a patient id that is not a uuid", "../../admin", EPISODE],
    ["an episode id that is not a uuid", PATIENT, `${EPISODE}/../x`],
    ["a non-string argument", PATIENT, { id: EPISODE } as unknown as string],
  ] as const)("%s: refused before any read, and no slot spent", async (_label, patientId, episodeId) => {
    expect(await downloadEpisodeReportUrlAction(patientId, episodeId)).toEqual({ url: null });
    expect(mockSelection).not.toHaveBeenCalled();
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
  });

  it("nothing to export (no such episode for this patient or tenant, an imported one, an empty one, none finalized, none the caller reads): no slot spent", async () => {
    mockSelection.mockResolvedValue(null);
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
  });

  it("the selection read fails: the same, and no slot spent", async () => {
    mockSelection.mockRejectedValue(new Error("boom"));
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
  });

  it("the ceiling refuses: nothing is rendered, stored, signed or audited", async () => {
    mockCeiling.mockResolvedValue(false);
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(mockCeiling).toHaveBeenCalledTimes(1);
    expectNothingProduced();
  });

  it("the engine printed no registo after all: nothing is stored, signed or audited", async () => {
    mockRender.mockResolvedValue(null);
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("the render fails: nothing is stored, signed or audited", async () => {
    mockRender.mockRejectedValue(new Error("boom"));
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it.each(["error", "throws"] as const)("the upload fails (%s): nothing is signed or audited", async (fault) => {
    stubStorage({ upload: fault });
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(["error", "throws"] as const)("the signed URL fails (%s): nothing is audited, and no URL is returned", async (fault) => {
    stubStorage({ sign: fault });
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(mockAudit).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("the audit row cannot be written: the signed URL is NOT handed out, and the file just stored is removed", async () => {
    mockAudit.mockRejectedValue(new Error("boom"));
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    expect(steps).toEqual(["selection", "ceiling", "render", "admin", "upload", "sign", "remove"]);
    // The object removed is the one this call stored, in the bucket it stored it in, and no other.
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0]![0]]);
    expect(buckets).toEqual(["clinical-attachments", "clinical-attachments", "clinical-attachments"]);
  });

  it.each(["error", "throws"] as const)(
    "the removal is best effort: when it fails too (%s), the answer and the line logged are still the audit's",
    async (fault) => {
      stubStorage({ remove: fault });
      mockAudit.mockRejectedValue(new Error("boom"));
      expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
      expect(remove).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls).toEqual([[failureLine("audit")]]);
    },
  );

  it("the stored file is removed on that branch ONLY: no other outcome removes anything", async () => {
    const outcomes: [string, () => void][] = [
      ["a finished export", () => {}],
      ["nothing to export", () => mockSelection.mockResolvedValue(null)],
      ["the selection read fails", () => mockSelection.mockRejectedValue(new Error("boom"))],
      ["the ceiling refuses", () => mockCeiling.mockResolvedValue(false)],
      ["the ceiling fails", () => mockCeiling.mockRejectedValue(new Error("boom"))],
      ["no registo printed", () => mockRender.mockResolvedValue(null)],
      ["the render fails", () => mockRender.mockRejectedValue(new Error("boom"))],
      ["the upload answers an error", () => stubStorage({ upload: "error" })],
      ["the upload throws", () => stubStorage({ upload: "throws" })],
      ["the signed URL answers an error", () => stubStorage({ sign: "error" })],
      ["the signed URL throws", () => stubStorage({ sign: "throws" })],
    ];
    for (const [label, arrange] of outcomes) {
      vi.clearAllMocks();
      allGood();
      arrange();
      await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
      expect(remove, label).not.toHaveBeenCalled();
    }
  });

  it("no refusal says why: every one of them is the same answer", async () => {
    const answers: unknown[] = [];
    mockSelection.mockResolvedValueOnce(null);
    answers.push(await downloadEpisodeReportUrlAction(PATIENT, EPISODE));
    mockCeiling.mockResolvedValueOnce(false);
    answers.push(await downloadEpisodeReportUrlAction(PATIENT, EPISODE));
    mockRender.mockRejectedValueOnce(new Error("Zzz Paciente Inventado"));
    answers.push(await downloadEpisodeReportUrlAction(PATIENT, EPISODE));
    expect(answers).toEqual([{ url: null }, { url: null }, { url: null }]);
  });
});

describe("downloadEpisodeReportUrlAction: a failure logs one line naming the step, and nothing else", () => {
  const cases: [string, string, () => void][] = [
    ["the selection read throws", "read", () => mockSelection.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the ceiling throws", "limit", () => mockCeiling.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the render throws", "render", () => mockRender.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the upload answers an error", "upload", () => stubStorage({ upload: "error" })],
    ["the upload throws", "upload", () => stubStorage({ upload: "throws" })],
    ["the signed URL answers an error", "sign", () => stubStorage({ sign: "error" })],
    ["the signed URL throws", "sign", () => stubStorage({ sign: "throws" })],
    ["the audit row cannot be written", "audit", () => mockAudit.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
  ];

  it.each(cases)("%s: one line, for step '%s', as its only argument", async (_label, step, arrange) => {
    arrange();
    expect(await downloadEpisodeReportUrlAction(PATIENT, EPISODE)).toEqual({ url: null });
    // One call, one argument: the static line. No error object rides along.
    expect(logged.mock.calls).toEqual([[failureLine(step)]]);
  });

  it("the line carries no id and none of the error's text, whatever failed", async () => {
    for (const [, , arrange] of cases) {
      vi.clearAllMocks();
      allGood();
      arrange();
      await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
      const line = logged.mock.calls.flat().map(String).join(" ");
      expect(line).toMatch(/^\[episode-pdf\] the episode export failed at step: (read|limit|render|upload|sign|audit)$/);
      for (const secret of [PATIENT, EPISODE, TENANT, USER, "Zzz", "Inventado", "boom", "r1", "r2", SIGNED]) {
        expect(line).not.toContain(secret);
      }
    }
  });

  it.each([
    ["a finished export", () => {}],
    ["reception", () => mockCtx.mockResolvedValue(ctxOf("reception"))],
    ["nothing to export", () => mockSelection.mockResolvedValue(null)],
    ["the ceiling refuses (it logs its own line)", () => mockCeiling.mockResolvedValue(false)],
    ["no registo printed after all", () => mockRender.mockResolvedValue(null)],
  ] as [string, () => void][])("a refusal is not a failure: %s logs nothing here", async (_label, arrange) => {
    arrange();
    await downloadEpisodeReportUrlAction(PATIENT, EPISODE);
    expect(logged).not.toHaveBeenCalled();
  });

  it("a malformed id logs nothing here", async () => {
    await downloadEpisodeReportUrlAction("../../admin", EPISODE);
    expect(logged).not.toHaveBeenCalled();
  });
});
