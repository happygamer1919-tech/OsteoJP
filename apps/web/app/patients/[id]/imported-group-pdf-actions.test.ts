import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// downloadImportedGroupReportUrlAction, "PDF do episódio" on an IMPORTED group
// of the Registos tab (EXPORT-01). These arms pin the action's own order and
// what each refusal leaves behind:
//
//   capability, input shape  ->  which registos (the caller's own reads)
//     ->  the document ceiling, once  ->  render  ->  upload  ->  signed URL
//     ->  the URL.
//
// G2: a refusal at any step returns `{ url: null }` and runs NO later step:
// nothing rendered, stored or signed, and before the ceiling, no slot spent.
// Reception is refused before any read. A caller whose own reads show no such
// group (a patient outside their reach) gets the same answer. Which registos
// the reads return for which role is registo-export.db.test.ts's, on real rows.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/clinical/report/episode-export", () => ({
  readEpisodeExportSelection: vi.fn(),
  renderEpisodeReport: vi.fn(),
  recordEpisodeExport: vi.fn(),
  readImportedGroupExportSelection: vi.fn(),
  renderImportedGroupReport: vi.fn(),
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import type { RequestContext } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import {
  readEpisodeExportSelection,
  readImportedGroupExportSelection,
  renderEpisodeReport,
  renderImportedGroupReport,
} from "@/lib/clinical/report/episode-export";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadImportedGroupReportUrlAction } from "./episode-pdf-actions";

const mockCtx = vi.mocked(requireRequestContext);
const mockSelection = vi.mocked(readImportedGroupExportSelection);
const mockRender = vi.mocked(renderImportedGroupReport);
const mockCeiling = vi.mocked(documentGenerationAllowed);
const mockAdmin = vi.mocked(createSupabaseAdminClient);

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const SIGNED = "https://storage.example/signed?token=opaque";
const BYTES = new Uint8Array([37, 80, 68, 70]);
const ctxOf = (role: RequestContext["role"]): RequestContext => ({ tenantId: TENANT, role, userId: USER });

const selection = { patientId: PATIENT, specialty: "Osteopatia", recordIds: ["r1", "r2", "r3"], leftOut: 1 };
const pdf = { bytes: BYTES, filename: "relatorio-episodio-importado-4444aaaa.pdf", recordIds: ["r1", "r2", "r3"], leftOut: 1 };

let steps: string[] = [];
let upload: ReturnType<typeof vi.fn>;
let createSignedUrl: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let buckets: string[] = [];
let logged: ReturnType<typeof vi.spyOn>;

const failureLine = (step: string) => `[episode-pdf] the episode export failed at step: ${step}`;

type StorageFault = "error" | "throws";
function stubStorage(opts: { upload?: StorageFault; sign?: StorageFault } = {}) {
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
  remove = vi.fn();
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

function allGood(role: RequestContext["role"] = "owner") {
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
  stubStorage();
}

function expectNothingProduced() {
  expect(mockRender).not.toHaveBeenCalled();
  expect(mockAdmin).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(createSignedUrl).not.toHaveBeenCalled();
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

describe("downloadImportedGroupReportUrlAction: an export, step by step", () => {
  it("the order: which registos, the ceiling, the render, the upload, the signed URL, and only then the URL", async () => {
    expect(await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia")).toEqual({ url: SIGNED });
    expect(steps).toEqual(["selection", "ceiling", "render", "admin", "upload", "sign"]);
    expect(remove).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "therapist"] as const)("%s reads clinical records, so the export runs, as that caller", async (role) => {
    allGood(role);
    expect(await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia")).toEqual({ url: SIGNED });
    expect(mockSelection).toHaveBeenCalledWith(ctxOf(role), { patientId: PATIENT, specialty: "Osteopatia" });
    expect(mockRender).toHaveBeenCalledWith(ctxOf(role), selection, "pt");
    expect(mockCeiling).toHaveBeenCalledTimes(1);
    expect(mockCeiling).toHaveBeenCalledWith(USER);
  });

  it("it is the IMPORTED group's read and render, never the app episode's", async () => {
    await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia");
    expect(readEpisodeExportSelection).not.toHaveBeenCalled();
    expect(renderEpisodeReport).not.toHaveBeenCalled();
  });

  it("the object: the per-record bucket, a tenant-prefixed path of ids in the group's own folder, a PDF; the specialty is not in it", async () => {
    await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia");
    expect(buckets).toEqual(["clinical-attachments", "clinical-attachments"]);
    const [path, bytes, options] = upload.mock.calls[0]!;
    expect(path).toMatch(
      new RegExp(`^${TENANT}/imported-episode-reports/${PATIENT}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pdf$`),
    );
    expect(path).not.toContain("Osteopatia");
    expect(bytes).toBe(BYTES);
    expect(options).toEqual({ contentType: "application/pdf", upsert: true });
  });

  it("the signed URL: the object just stored, 60 seconds, a download named by the patient id's first block", async () => {
    await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia");
    const [path, ttl, options] = createSignedUrl.mock.calls[0]!;
    expect(path).toBe(upload.mock.calls[0]![0]);
    expect(ttl).toBe(60);
    expect(options).toEqual({ download: "relatorio-episodio-importado-4444aaaa.pdf" });
  });
});

describe("downloadImportedGroupReportUrlAction: every refusal produces nothing (G2)", () => {
  it("RECEPTION (no clinical_records:read): refused before any read, and no slot spent", async () => {
    allGood("reception");
    expect(await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia")).toEqual({ url: null });
    expect(mockSelection).not.toHaveBeenCalled();
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
  });

  it.each([
    ["a patient id that is not a uuid", "not-a-uuid", "Osteopatia"],
    ["an empty label", PATIENT, ""],
    ["a patient id that is not a string", 7 as unknown as string, "Osteopatia"],
    ["a label that is not a string", PATIENT, { specialty: "Osteopatia" } as unknown as string],
  ])("%s: refused before any read", async (_label, patientId, specialty) => {
    expect(await downloadImportedGroupReportUrlAction(patientId, specialty)).toEqual({ url: null });
    expect(mockSelection).not.toHaveBeenCalled();
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
  });

  it.each(["owner", "admin", "therapist"] as const)(
    "%s against a patient whose imported group their own reads do not show: nothing, and no slot spent",
    async (role) => {
      allGood(role);
      mockSelection.mockResolvedValue(null);
      expect(await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia")).toEqual({ url: null });
      expect(mockCeiling).not.toHaveBeenCalled();
      expectNothingProduced();
      expect(logged).not.toHaveBeenCalled();
    },
  );

  it("the ceiling refuses: nothing is rendered, stored or signed", async () => {
    mockCeiling.mockResolvedValue(false);
    expect(await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia")).toEqual({ url: null });
    expectNothingProduced();
  });

  it("the engine printed no registo after all (drafts only at the render): nothing is stored or signed", async () => {
    mockRender.mockResolvedValue(null);
    expect(await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia")).toEqual({ url: null });
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("downloadImportedGroupReportUrlAction: a failure logs one line naming the step, and nothing else", () => {
  const cases: [string, string, () => void][] = [
    ["the selection read throws", "read", () => mockSelection.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the ceiling throws", "limit", () => mockCeiling.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the render throws", "render", () => mockRender.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the upload answers with an error", "upload", () => stubStorage({ upload: "error" })],
    ["the upload throws", "upload", () => stubStorage({ upload: "throws" })],
    ["the signed URL answers with an error", "sign", () => stubStorage({ sign: "error" })],
    ["the signed URL throws", "sign", () => stubStorage({ sign: "throws" })],
  ];

  it.each(cases)("%s: no URL, and one line, for step '%s', with no id and none of the error's text", async (_label, step, arrange) => {
    arrange();
    expect(await downloadImportedGroupReportUrlAction(PATIENT, "Osteopatia")).toEqual({ url: null });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([failureLine(step)]);
    const line = String(logged.mock.calls[0]![0]);
    expect(line).not.toContain(PATIENT);
    expect(line).not.toContain("Inventado");
    expect(line).not.toContain("Osteopatia");
  });
});
