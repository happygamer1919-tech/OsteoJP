import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
}));
// A factory REPLACES THE WHOLE MODULE, so both things the action imports from
// it are named here. R45: `declaracaoAvailability` is the check the action
// makes before the ceiling; it is stubbed "ok" in beforeEach for the suites
// that are not about a refusal.
vi.mock("@/lib/clinical/declaracao/generate", () => ({
  declaracaoAvailability: vi.fn(),
  generateDeclaracaoPdf: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
// PL-20: the action now writes a captured NIF back to the patient when the
// record had none. Both sides of that decision are stubbed so the test asserts
// the DECISION, not the database.
vi.mock("@/lib/patients/queries", () => ({ getPatient: vi.fn() }));
vi.mock("@/lib/patients/actions", () => ({ updatePatient: vi.fn() }));
// SEC-web-surface-limiter-adoption route 6: the action now takes a per-user
// ceiling before it renders. STUBBED OPEN HERE, deliberately - this suite is
// about download-vs-preview and the NIF write-back, and the real helper is
// backed by the DURABLE store, which FAILS CLOSED with no DATABASE_URL. Left
// unstubbed it refuses every call and every assertion below fails for a reason
// that has nothing to do with what they test. The ceiling has its own suite
// (lib/clinical/document-rate-limit.test.ts), including the source guards that
// prove this action is wired to it.
vi.mock("@/lib/clinical/document-rate-limit", () => ({
  documentGenerationAllowed: vi.fn(async () => true),
}));
// EXPORT-01: the action writes one audit row per declaration handed out. The
// writer is stubbed here (it answers, so the suites above it in this file are
// about what they were about); what the ACTION does with it is the last suite
// of this file, and the row itself, on the real table, is
// lib/clinical/export-audit.db.test.ts's.
vi.mock("@/lib/clinical/export-audit", () => ({ recordDeclaracaoExport: vi.fn() }));

import { requireRequestContext } from "@/lib/auth/context";
import {
  declaracaoAvailability,
  generateDeclaracaoPdf,
} from "@/lib/clinical/declaracao/generate";
import { ClinicalError } from "@/lib/clinical/errors";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import { recordDeclaracaoExport } from "@/lib/clinical/export-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPatient } from "@/lib/patients/queries";
import { updatePatient } from "@/lib/patients/actions";
import { generateDeclaracaoUrlAction } from "./declaracao-actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockPdf = vi.mocked(generateDeclaracaoPdf);
const mockAvailability = vi.mocked(declaracaoAvailability);
const mockCeiling = vi.mocked(documentGenerationAllowed);
const mockAdmin = vi.mocked(createSupabaseAdminClient);
const mockAudit = vi.mocked(recordDeclaracaoExport);

const ctx: RequestContext = { tenantId: "t1", role: "reception", userId: "u1" };
// R45: every declaration names its location (the marcação's, or the one chosen
// in the dialog for a manual entry). A request without one is malformed.
const LOCATION_ID = "00000000-0000-4000-8000-0000000000a1";
const req = {
  patientId: "p1",
  date: "2026-07-17",
  startTime: "09:30",
  endTime: "10:30",
  locationId: LOCATION_ID,
};

// Capture the exact args createSignedUrl is called with, so the assertion is on
// the real decision site, not a proxy.
let signedUrlArgs: unknown[] = [];

function stubStorage() {
  const createSignedUrl = vi.fn((...args: unknown[]) => {
    signedUrlArgs = args;
    return Promise.resolve({ data: { signedUrl: "https://storage.example/signed?token=abc" }, error: null });
  });
  const upload = vi.fn(() => Promise.resolve({ data: { path: "x" }, error: null }));
  mockAdmin.mockReturnValue({
    storage: { from: () => ({ upload, createSignedUrl }) },
  } as unknown as ReturnType<typeof createSupabaseAdminClient>);
  return { createSignedUrl, upload };
}

beforeEach(() => {
  vi.clearAllMocks();
  signedUrlArgs = [];
  mockCtx.mockResolvedValue(ctx);
  mockPdf.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), filename: "declaracao-presenca-p1.pdf" });
  mockAvailability.mockResolvedValue("ok");
});

// ---------------------------------------------------------------------------
// R45 (strategy, 2026-10-06): "Never issue one without a stamp."
//   G8 "Declaração at a location with no stamp. EXPECT: refused with the
//       notice, no document produced."
// WHICH locations may be named, and which have a carimbo, is generate.test.ts's
// question. This suite asks what the ACTION does with each answer: it must
// report the refusal the right way and must have produced, stored, signed,
// written and spent nothing.
// ---------------------------------------------------------------------------

/** Everything a refused request must leave untouched. */
function expectNothingProducedOrSpent(storage: ReturnType<typeof stubStorage>) {
  // No PDF, no Storage object, no signed URL.
  expect(mockPdf).not.toHaveBeenCalled();
  expect(mockAdmin).not.toHaveBeenCalled();
  expect(storage.upload).not.toHaveBeenCalled();
  expect(storage.createSignedUrl).not.toHaveBeenCalled();
  // No slot of the per-user generation ceiling.
  expect(mockCeiling).not.toHaveBeenCalled();
  // No write to the patient record.
  expect(vi.mocked(getPatient)).not.toHaveBeenCalled();
  expect(vi.mocked(updatePatient)).not.toHaveBeenCalled();
  // No audit row: nothing was handed out.
  expect(mockAudit).not.toHaveBeenCalled();
}

describe("R45 - a declaration with NO location is malformed input, refused before anything", () => {
  beforeEach(() => {
    // A patient with no NIF on file, so a write-back that ran would be seen.
    vi.mocked(getPatient).mockReset().mockResolvedValue({ id: "p1", nif: null } as never);
    vi.mocked(updatePatient).mockReset();
  });

  it.each([
    ["null (what the manual entry used to send)", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["not a string", 42],
  ])("locationId %s: the invalid-input result, nothing produced or spent", async (_label, locationId) => {
    const storage = stubStorage();

    const result = await generateDeclaracaoUrlAction({
      ...req,
      locationId: locationId as never,
      nif: "123456789",
    });

    // The same result a request with no date gets. Not the carimbo notice.
    expect(result).toEqual({ url: null });
    // Decided on the shape alone: not even the location read is made.
    expect(mockAvailability).not.toHaveBeenCalled();
    expectNothingProducedOrSpent(storage);
  });

  it("the key left out altogether is refused the same way", async () => {
    const storage = stubStorage();
    const withoutLocation = {
      patientId: req.patientId,
      date: req.date,
      startTime: req.startTime,
      endTime: req.endTime,
    };

    expect(await generateDeclaracaoUrlAction({ ...withoutLocation, nif: "123456789" })).toEqual({ url: null });
    expectNothingProducedOrSpent(storage);
  });

  it("a request with no date is refused as before: the shape check still comes first", async () => {
    mockAvailability.mockResolvedValue("no_stamp");
    expect(await generateDeclaracaoUrlAction({ ...req, date: "" })).toEqual({ url: null });
    expect(mockAvailability).not.toHaveBeenCalled();
  });
});

describe("R45 - a location the caller may not name is malformed input too", () => {
  beforeEach(() => {
    vi.mocked(getPatient).mockReset().mockResolvedValue({ id: "p1", nif: null } as never);
    vi.mocked(updatePatient).mockReset();
  });

  it("out of scope, archived or unknown: the invalid-input result, nothing produced or spent", async () => {
    const storage = stubStorage();
    mockAvailability.mockResolvedValue("invalid");

    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });

    expect(result).toEqual({ url: null });
    expect(result).not.toHaveProperty("refused");
    // Asked as THIS caller, about the location the request named.
    expect(mockAvailability).toHaveBeenCalledTimes(1);
    expect(mockAvailability).toHaveBeenCalledWith(ctx, LOCATION_ID);
    expectNothingProducedOrSpent(storage);
  });

  it("the generator's own refusal of the location is the generic result, and nothing is stored", async () => {
    const storage = stubStorage();
    mockPdf.mockRejectedValue(new ClinicalError("invalid"));

    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });

    expect(result).toEqual({ url: null });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(vi.mocked(updatePatient)).not.toHaveBeenCalled();
  });
});

describe("R45 G8 - a location with no carimbo is refused before anything is produced or spent", () => {
  beforeEach(() => {
    // A patient with no NIF on file, so a write-back that ran would be seen.
    vi.mocked(getPatient).mockReset().mockResolvedValue({ id: "p1", nif: null } as never);
    vi.mocked(updatePatient).mockReset();
  });

  it("refused as no_stamp, nothing produced or spent", async () => {
    const storage = stubStorage();
    mockAvailability.mockResolvedValue("no_stamp");

    // A NIF the record lacks is typed too: the write-back must not run either.
    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });

    expect(result).toEqual({ url: null, refused: "no_stamp" });
    expect(mockAvailability).toHaveBeenCalledWith(ctx, LOCATION_ID);
    expectNothingProducedOrSpent(storage);
  });

  it("the check runs BEFORE the ceiling: an allowed location then spends exactly one slot", async () => {
    stubStorage();
    const order: string[] = [];
    mockAvailability.mockImplementation(async () => {
      order.push("location");
      return "ok";
    });
    mockCeiling.mockImplementationOnce(async () => {
      order.push("ceiling");
      return true;
    });
    mockPdf.mockImplementation(async () => {
      order.push("render");
      return { bytes: new Uint8Array([1]), filename: "d.pdf" };
    });

    const result = await generateDeclaracaoUrlAction(req);

    expect(order).toEqual(["location", "ceiling", "render"]);
    expect(result).toEqual({ url: "https://storage.example/signed?token=abc" });
    expect(result).not.toHaveProperty("refused");
    // The generator is handed the caller and the location, to check for itself.
    expect(mockPdf).toHaveBeenCalledWith(ctx, expect.objectContaining({ locationId: LOCATION_ID }));
  });

  it("the generator's own refusal is reported the same way, and nothing is stored", async () => {
    // The generator refuses a location with no carimbo by itself, whatever the
    // check above answered a moment earlier. The record has NO NIF and one was
    // typed, so a write-back placed ahead of the generator would run here.
    const storage = stubStorage();
    mockPdf.mockRejectedValue(new ClinicalError("no_stamp"));

    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });

    expect(result).toEqual({ url: null, refused: "no_stamp" });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(vi.mocked(getPatient)).not.toHaveBeenCalled();
    expect(vi.mocked(updatePatient)).not.toHaveBeenCalled();
  });

  it("the write-back arm above is live: the same request, once generated, DOES save the NIF", async () => {
    // The control for the assertion above. Same patient, same typed NIF; the
    // only difference is that the generator produced a document.
    stubStorage();

    await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });

    expect(vi.mocked(updatePatient)).toHaveBeenCalledWith("p1", { nif: "123456789" });
  });

  it("only no_stamp is named: every other failure keeps the generic result", async () => {
    stubStorage();
    mockPdf.mockRejectedValue(new ClinicalError("not_found"));
    expect(await generateDeclaracaoUrlAction(req)).toEqual({ url: null });

    mockPdf.mockRejectedValue(new Error("boom"));
    expect(await generateDeclaracaoUrlAction(req)).toEqual({ url: null });
  });

  it("a failed location read is not a refusal, and still produces and spends nothing", async () => {
    const storage = stubStorage();
    mockAvailability.mockRejectedValue(new Error("connection lost"));

    const result = await generateDeclaracaoUrlAction(req);

    expect(result).toEqual({ url: null });
    expect(mockCeiling).not.toHaveBeenCalled();
    expect(mockPdf).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe("generateDeclaracaoUrlAction - W9-03 download-vs-preview (CB QA item 2)", () => {
  it("signs the URL with NO download option, so Storage serves it inline (preview, not download)", async () => {
    stubStorage();

    const result = await generateDeclaracaoUrlAction(req);

    expect(result.url).toBe("https://storage.example/signed?token=abc");
    // The fix: createSignedUrl(path, ttl) - exactly two args, no options object.
    // A third `{ download }` arg would force Content-Disposition: attachment and
    // re-introduce the forced download on BOTH the marcação and manual paths.
    expect(signedUrlArgs).toHaveLength(2);
    expect(signedUrlArgs[1]).toBe(60);
    // Belt and braces: whatever the args, none of them carry a `download` key.
    for (const arg of signedUrlArgs) {
      if (arg && typeof arg === "object") {
        expect(arg).not.toHaveProperty("download");
      }
    }
  });

  it("the manual path (a location chosen by hand) signs the URL the same inline way", async () => {
    // R45: "Introdução manual" used to send locationId = null; it now sends the
    // location chosen in the dialog. Both paths hit this one action with a
    // location id, so proving it here proves it for the manual path too.
    stubStorage();

    await generateDeclaracaoUrlAction({ ...req, locationId: "00000000-0000-4000-8000-0000000000a2" });

    expect(signedUrlArgs).toHaveLength(2);
    for (const arg of signedUrlArgs) {
      if (arg && typeof arg === "object") expect(arg).not.toHaveProperty("download");
    }
  });

  it("still returns null (no leak) when the upload fails", async () => {
    const createSignedUrl = vi.fn();
    mockAdmin.mockReturnValue({
      storage: {
        from: () => ({
          upload: vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } })),
          createSignedUrl,
        }),
      },
    } as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const result = await generateDeclaracaoUrlAction(req);

    expect(result).toEqual({ url: null });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

describe("PL-20 — a captured NIF is written back only when the record had none", () => {
  const mockGetPatient = vi.mocked(getPatient);
  const mockUpdate = vi.mocked(updatePatient);

  beforeEach(() => {
    stubStorage();
    mockCtx.mockResolvedValue(ctx);
    mockPdf.mockResolvedValue({ bytes: new Uint8Array([1]), filename: "d.pdf" } as never);
    mockGetPatient.mockReset();
    mockUpdate.mockReset();
  });

  it("saves the NIF when the patient record is empty", async () => {
    mockGetPatient.mockResolvedValue({ id: "p1", nif: null } as never);
    await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });
    expect(mockUpdate).toHaveBeenCalledWith("p1", { nif: "123456789" });
  });

  it("does NOT overwrite a NIF the record already holds", async () => {
    // A one-off value typed onto a single declaration (a patient billing through
    // a company, a correction) must never rewrite the patient's fiscal number.
    mockGetPatient.mockResolvedValue({ id: "p1", nif: "111111111" } as never);
    await generateDeclaracaoUrlAction({ ...req, nif: "222222222" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // INC-nif-validationerror-at-the-desk: `updatePatient` now RETURNS a refusal
  // instead of throwing one. The write-back is a CONVENIENCE and the document is
  // what the user asked for, so a refused write must still not cost them the
  // declaration - the same outcome as before, now reached without an exception.
  it("still hands back the declaration when the write-back is REFUSED", async () => {
    mockGetPatient.mockResolvedValue({ id: "p1", nif: null } as never);
    mockUpdate.mockResolvedValue({
      ok: false,
      error: { field: "nif", message: "NIF inválido: o dígito de controlo não confere." },
    } as never);

    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456780" });

    expect(result.url).toBe("https://storage.example/signed?token=abc");
    expect(mockUpdate).toHaveBeenCalledWith("p1", { nif: "123456780" });
  });

  it("does not even read the patient when no NIF was supplied", async () => {
    await generateDeclaracaoUrlAction({ ...req });
    expect(mockGetPatient).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("still returns the document when the write-back fails", async () => {
    // The declaration is what the user asked for; a failed convenience write
    // must not cost them it.
    mockGetPatient.mockResolvedValue({ id: "p1", nif: null } as never);
    mockUpdate.mockRejectedValue(new Error("boom"));
    const result = await generateDeclaracaoUrlAction({ ...req, nif: "123456789" });
    expect(result.url).toContain("https://storage.example/signed");
  });
});

// ---------------------------------------------------------------------------
// EXPORT-01, G4: "each export. EXPECT: exactly one audit row, no patient text
// in it." What the action asks its writer for, when, and what it does when the
// row cannot be written.
// ---------------------------------------------------------------------------
describe("EXPORT-01 G4 - one audit row per declaration handed out, ids only", () => {
  const SIGNED = "https://storage.example/signed?token=abc";
  let steps: string[] = [];
  let upload: ReturnType<typeof vi.fn>;
  let createSignedUrl: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let logged: ReturnType<typeof vi.spyOn>;

  type Fault = "error" | "throws";
  function stub(opts: { upload?: Fault; sign?: Fault; remove?: Fault } = {}) {
    const answer = (name: string, fault: Fault | undefined, data: unknown) => async () => {
      steps.push(name);
      if (fault === "throws") throw new Error("Zzz Paciente Inventado");
      return fault === "error" ? { data: null, error: { message: "x" } } : { data, error: null };
    };
    upload = vi.fn(answer("upload", opts.upload, { path: "x" }));
    createSignedUrl = vi.fn(answer("sign", opts.sign, { signedUrl: SIGNED }));
    remove = vi.fn(answer("remove", opts.remove, []));
    mockAdmin.mockReturnValue({
      storage: { from: () => ({ upload, createSignedUrl, remove }) },
    } as unknown as ReturnType<typeof createSupabaseAdminClient>);
  }

  beforeEach(() => {
    steps = [];
    stub();
    mockPdf.mockImplementation(async () => {
      steps.push("render");
      return { bytes: new Uint8Array([1]), filename: "d.pdf" };
    });
    mockAudit.mockImplementation(async () => {
      steps.push("audit");
    });
    vi.mocked(getPatient).mockReset().mockResolvedValue({ id: "p1", nif: null } as never);
    vi.mocked(updatePatient).mockReset();
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logged.mockRestore();
  });

  it("the order: the render, the upload, the signed URL, the audit row, and only then the URL", async () => {
    expect(await generateDeclaracaoUrlAction(req)).toEqual({ url: SIGNED });
    expect(steps).toEqual(["render", "upload", "sign", "audit"]);
    expect(remove).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "therapist", "reception"] as const)(
    "%s: asked for ONCE, as that caller, with the patient and the location and nothing else",
    async (role) => {
      const caller: RequestContext = { ...ctx, role };
      mockCtx.mockResolvedValue(caller);
      await generateDeclaracaoUrlAction(req);
      expect(mockAudit).toHaveBeenCalledTimes(1);
      expect(mockAudit).toHaveBeenCalledWith(caller, { patientId: "p1", locationId: LOCATION_ID });
    },
  );

  it("what was typed in the dialog is handed to the document and never to the row: no day, no hours, no NIF, no observações", async () => {
    await generateDeclaracaoUrlAction({ ...req, nif: "123456789", observacoes: "Texto inventado do paciente" });
    const asked = JSON.stringify(mockAudit.mock.calls);
    for (const typed of ["2026-07-17", "09:30", "10:30", "123456789", "Texto", "inventado"]) {
      expect(asked).not.toContain(typed);
    }
    // Control: the same values did reach the generator.
    expect(JSON.stringify(mockPdf.mock.calls)).toContain("Texto inventado do paciente");
  });

  it("two declarations are two rows asked for: one per file handed out", async () => {
    await generateDeclaracaoUrlAction(req);
    await generateDeclaracaoUrlAction(req);
    expect(mockAudit).toHaveBeenCalledTimes(2);
  });

  it("the audit row cannot be written: the signed URL is NOT handed out, and the file just stored is removed", async () => {
    mockAudit.mockRejectedValue(new Error("Zzz Paciente Inventado"));
    expect(await generateDeclaracaoUrlAction(req)).toEqual({ url: null });
    expect(steps).toEqual(["render", "upload", "sign", "remove"]);
    // The object removed is the one this call stored, and no other.
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0]![0]]);
    // One line, naming the document and the step: no id, none of the error's text.
    expect(logged.mock.calls).toEqual([["[declaracao] the export failed at step: audit"]]);
  });

  it.each(["error", "throws"] as const)(
    "the removal is best effort: when it fails too (%s), the answer and the line logged are the same",
    async (fault) => {
      stub({ remove: fault });
      mockAudit.mockRejectedValue(new Error("boom"));
      expect(await generateDeclaracaoUrlAction(req)).toEqual({ url: null });
      expect(remove).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls).toEqual([["[declaracao] the export failed at step: audit"]]);
    },
  );

  it("no row is asked for, and nothing is removed, on any outcome that hands out no file", async () => {
    const outcomes: [string, () => void][] = [
      ["no location", () => mockAvailability.mockResolvedValue("invalid")],
      ["no carimbo", () => mockAvailability.mockResolvedValue("no_stamp")],
      ["the ceiling refuses", () => mockCeiling.mockResolvedValueOnce(false)],
      ["the generator refuses the location", () => mockPdf.mockRejectedValue(new ClinicalError("no_stamp"))],
      ["no such patient for this caller", () => mockPdf.mockRejectedValue(new ClinicalError("not_found"))],
      ["the render fails", () => mockPdf.mockRejectedValue(new Error("boom"))],
      ["the upload answers an error", () => stub({ upload: "error" })],
      ["the upload throws", () => stub({ upload: "throws" })],
      ["the signed URL answers an error", () => stub({ sign: "error" })],
      ["the signed URL throws", () => stub({ sign: "throws" })],
    ];
    for (const [label, arrange] of outcomes) {
      mockAudit.mockClear();
      mockCtx.mockResolvedValue(ctx);
      mockAvailability.mockResolvedValue("ok");
      mockPdf.mockResolvedValue({ bytes: new Uint8Array([1]), filename: "d.pdf" });
      stub();
      arrange();
      expect((await generateDeclaracaoUrlAction(req)).url, label).toBeNull();
      expect(mockAudit, label).not.toHaveBeenCalled();
      expect(remove, label).not.toHaveBeenCalled();
    }
  });
});
