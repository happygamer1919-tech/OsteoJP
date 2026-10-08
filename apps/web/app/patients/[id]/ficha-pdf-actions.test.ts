import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// downloadPatientFichaUrlAction, "Exportar ficha" on the Registos tab
// (EXPORT-01). These arms pin the action's own order and what each refusal
// leaves behind:
//
//   capability, input shape  ->  which registos (the caller's own reads)
//     ->  the document ceiling, once  ->  render  ->  upload  ->  signed URL
//     ->  the audit row  ->  the URL.
//
// G2: a refusal at any step returns `{ url: null }` and runs NO later step:
// nothing rendered, stored, signed or audited, and before the ceiling, no slot
// spent. Reception is refused before any read. A caller whose own reads show no
// registo of the patient (a patient outside their reach) gets the same answer.
// Which registos the reads return for which role is ficha-export.db.test.ts's,
// on real rows.
//
// G4: a finished export asks for its audit row exactly once, with ids and
// counts and nothing else (no section's name is among them). When the row
// cannot be written the URL is not handed out and the file just stored is
// removed. The row itself, on the real table, is export-audit.db.test.ts's.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/clinical/report/ficha-export", () => ({
  readPatientFichaExportSelection: vi.fn(),
  renderPatientFichaReport: vi.fn(),
}));
vi.mock("@/lib/clinical/export-audit", () => ({ recordPatientFichaExport: vi.fn() }));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import type { RequestContext } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import { recordPatientFichaExport } from "@/lib/clinical/export-audit";
import { readPatientFichaExportSelection, renderPatientFichaReport } from "@/lib/clinical/report/ficha-export";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadPatientFichaUrlAction } from "./ficha-pdf-actions";

const mockCtx = vi.mocked(requireRequestContext);
const mockSelection = vi.mocked(readPatientFichaExportSelection);
const mockRender = vi.mocked(renderPatientFichaReport);
const mockAudit = vi.mocked(recordPatientFichaExport);
const mockCeiling = vi.mocked(documentGenerationAllowed);
const mockAdmin = vi.mocked(createSupabaseAdminClient);

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const SIGNED = "https://storage.example/signed?token=opaque";
const BYTES = new Uint8Array([37, 80, 68, 70]);
const ctxOf = (role: RequestContext["role"]): RequestContext => ({ tenantId: TENANT, role, userId: USER });

const selection = {
  patientId: PATIENT,
  sections: [
    { kind: "imported" as const, label: "Osteopatia", recordIds: ["r1", "r2"] },
    { kind: "none" as const, label: null, recordIds: ["r3"] },
  ],
  leftOut: 1,
};
const pdf = { bytes: BYTES, filename: "relatorio-ficha-4444aaaa.pdf", recordIds: ["r1", "r2", "r3"], sections: 2, leftOut: 1 };

let steps: string[] = [];
let upload: ReturnType<typeof vi.fn>;
let createSignedUrl: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let buckets: string[] = [];
let logged: ReturnType<typeof vi.spyOn>;

const failureLine = (step: string) => `[ficha-pdf] the ficha export failed at step: ${step}`;

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

describe("downloadPatientFichaUrlAction: an export, step by step", () => {
  it("the order: which registos, the ceiling, the render, the upload, the signed URL, the audit row, and only then the URL", async () => {
    expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: SIGNED });
    expect(steps).toEqual(["selection", "ceiling", "render", "admin", "upload", "sign", "audit"]);
    // A finished export removes nothing and logs nothing.
    expect(remove).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "therapist"] as const)("%s reads clinical records, so the export runs, as that caller", async (role) => {
    allGood(role);
    expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: SIGNED });
    expect(mockSelection).toHaveBeenCalledWith(ctxOf(role), { patientId: PATIENT });
    expect(mockRender).toHaveBeenCalledWith(ctxOf(role), selection, "pt");
    expect(mockCeiling).toHaveBeenCalledTimes(1);
    expect(mockCeiling).toHaveBeenCalledWith(USER);
  });

  it("the object: the per-record bucket, a tenant-prefixed path of ids in the export's own folder, a PDF", async () => {
    await downloadPatientFichaUrlAction(PATIENT);
    expect(buckets).toEqual(["clinical-attachments", "clinical-attachments"]);
    const [path, bytes, options] = upload.mock.calls[0]!;
    expect(path).toMatch(
      new RegExp(`^${TENANT}/ficha-reports/${PATIENT}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pdf$`),
    );
    expect(path).not.toContain("Osteopatia");
    expect(bytes).toBe(BYTES);
    expect(options).toEqual({ contentType: "application/pdf", upsert: true });
  });

  it("the signed URL: the object just stored, 60 seconds, a download named by the patient id's first block", async () => {
    await downloadPatientFichaUrlAction(PATIENT);
    const [path, ttl, options] = createSignedUrl.mock.calls[0]!;
    expect(path).toBe(upload.mock.calls[0]![0]);
    expect(ttl).toBe(60);
    expect(options).toEqual({ download: "relatorio-ficha-4444aaaa.pdf" });
  });
});

describe("downloadPatientFichaUrlAction: the audit row of an export (G4)", () => {
  it.each(["owner", "admin", "therapist"] as const)(
    "%s: asked for ONCE, as that caller, with the patient, the registos in the file and three counts, and nothing else",
    async (role) => {
      allGood(role);
      await downloadPatientFichaUrlAction(PATIENT);
      expect(mockAudit).toHaveBeenCalledTimes(1);
      expect(mockAudit).toHaveBeenCalledWith(ctxOf(role), {
        patientId: PATIENT,
        recordIds: ["r1", "r2", "r3"],
        sections: 2,
        leftOut: 1,
      });
    },
  );

  it("no section's name is handed to the row: a section's name is an episode's title", async () => {
    await downloadPatientFichaUrlAction(PATIENT);
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain("Osteopatia");
  });

  it("the registos and the sections audited are the ones the render put in the file, not the ones selected", async () => {
    // Selected: r1 and r2 in one section, r3 in another. The engine printed r3 only.
    mockRender.mockResolvedValue({ ...pdf, recordIds: ["r3"], sections: 1, leftOut: 3 });
    await downloadPatientFichaUrlAction(PATIENT);
    expect(mockAudit.mock.calls[0]![1]).toEqual({ patientId: PATIENT, recordIds: ["r3"], sections: 1, leftOut: 3 });
  });

  it("two exports are two rows asked for: one per file handed out", async () => {
    await downloadPatientFichaUrlAction(PATIENT);
    await downloadPatientFichaUrlAction(PATIENT);
    expect(mockAudit).toHaveBeenCalledTimes(2);
  });

  it("the audit row cannot be written: the signed URL is NOT handed out, and the file just stored is removed", async () => {
    mockAudit.mockRejectedValue(new Error("boom"));
    expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: null });
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
      expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: null });
      expect(remove).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls).toEqual([[failureLine("audit")]]);
    },
  );

  it("no row is asked for, and nothing is removed, on any outcome that hands out no file", async () => {
    const outcomes: [string, () => void][] = [
      ["reception", () => mockCtx.mockResolvedValue(ctxOf("reception"))],
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
      expect(await downloadPatientFichaUrlAction(PATIENT), label).toEqual({ url: null });
      expect(mockAudit, label).not.toHaveBeenCalled();
      expect(remove, label).not.toHaveBeenCalled();
    }
  });
});

describe("downloadPatientFichaUrlAction: every refusal produces nothing (G2)", () => {
  it("RECEPTION (no clinical_records:read): refused before any read, and no slot spent", async () => {
    allGood("reception");
    expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: null });
    expect(mockSelection).not.toHaveBeenCalled();
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
    expect(logged).not.toHaveBeenCalled();
  });

  it.each([
    ["a patient id that is not a uuid", "not-a-uuid"],
    ["an empty patient id", ""],
    ["a patient id that is not a string", 7 as unknown as string],
    ["a patient id sent as an object", { patientId: PATIENT } as unknown as string],
  ])("%s: refused before any read", async (_label, patientId) => {
    expect(await downloadPatientFichaUrlAction(patientId)).toEqual({ url: null });
    expect(mockSelection).not.toHaveBeenCalled();
    expect(mockCeiling).not.toHaveBeenCalled();
    expectNothingProduced();
  });

  it.each(["owner", "admin", "therapist"] as const)(
    "%s against a patient of whom their own reads show no registo to export: nothing, and no slot spent",
    async (role) => {
      allGood(role);
      mockSelection.mockResolvedValue(null);
      expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: null });
      expect(mockCeiling).not.toHaveBeenCalled();
      expectNothingProduced();
      expect(logged).not.toHaveBeenCalled();
    },
  );

  it("the ceiling refuses: nothing is rendered, stored or signed", async () => {
    mockCeiling.mockResolvedValue(false);
    expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: null });
    expectNothingProduced();
  });

  it("the engine printed no registo after all (drafts only at the render): nothing is stored or signed", async () => {
    mockRender.mockResolvedValue(null);
    expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: null });
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("downloadPatientFichaUrlAction: a failure logs one line naming the step, and nothing else", () => {
  const cases: [string, string, () => void][] = [
    ["the selection read throws", "read", () => mockSelection.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the ceiling throws", "limit", () => mockCeiling.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the render throws", "render", () => mockRender.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
    ["the upload answers with an error", "upload", () => stubStorage({ upload: "error" })],
    ["the upload throws", "upload", () => stubStorage({ upload: "throws" })],
    ["the signed URL answers with an error", "sign", () => stubStorage({ sign: "error" })],
    ["the signed URL throws", "sign", () => stubStorage({ sign: "throws" })],
    ["the audit row cannot be written", "audit", () => mockAudit.mockRejectedValue(new Error("Zzz Paciente Inventado"))],
  ];

  it.each(cases)("%s: no URL, and one line, for step '%s', with no id and none of the error's text", async (_label, step, arrange) => {
    arrange();
    expect(await downloadPatientFichaUrlAction(PATIENT)).toEqual({ url: null });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([failureLine(step)]);
    const line = String(logged.mock.calls[0]![0]);
    expect(line).not.toContain(PATIENT);
    expect(line).not.toContain("Inventado");
  });
});
