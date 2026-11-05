import { beforeEach, describe, expect, it, vi } from "vitest";

// RODICA-export-edit-before-download: the export dialog's rows. One per
// registo the file would print, in the file's order, read with the render's
// own reach (the loader, under the registo page's read scope, with the
// caller's claims), and with what each prints when nothing is changed. A
// registo the engine would not print has no row. Reception is refused before
// any read.

vi.mock("server-only", () => ({}));
vi.mock("./load", () => ({ loadClinicalReportInputs: vi.fn() }));
vi.mock("./generate", () => ({ registoReadScope: vi.fn() }));

import { sql } from "drizzle-orm";
import { ForbiddenError, toClaims, type RequestContext } from "@osteojp/auth";
import { readExportRows } from "./export-rows";
import { registoReadScope } from "./generate";
import { loadClinicalReportInputs } from "./load";
import type { ReportInputs } from "./report-model";

const mockLoad = vi.mocked(loadClinicalReportInputs);
const mockScope = vi.mocked(registoReadScope);

const TENANT = "11111111-1111-4111-8111-111111111111";
const ctxOf = (role: RequestContext["role"]): RequestContext => ({
  tenantId: TENANT,
  role,
  userId: "22222222-2222-4222-8222-222222222222",
});
const SCOPE = { value: sql`READ_SCOPE_MARKER` };

function inputs(id: string, record: Partial<ReportInputs["record"]>): ReportInputs {
  return {
    record: {
      id,
      status: "locked",
      aiReviewState: null,
      version: 1,
      episodeId: null,
      data: {},
      view: "form",
      annulledAt: null,
      consultationDate: new Date("2026-11-01T09:00:00Z"),
      appointmentStartsAt: new Date("2026-11-01T09:00:00Z"),
      signedAt: null,
      ...record,
    },
    patient: { fullName: "Zzz Paciente Inventado", dateOfBirth: null, nif: null },
    practitioner: { fullName: null, title: null, signedByName: null },
    clinic: { fiscalName: "Clinica Inventada", nif: "999000222" },
    location: { name: "Linda-a-Velha", address: null, phone: null },
  };
}

const STORED: Record<string, ReportInputs | null> = {
  imp: inputs("imp", { view: "imported", appointmentStartsAt: null, consultationDate: new Date("2019-05-10T23:00:00Z") }),
  form: inputs("form", { version: 2 }),
  draft: inputs("draft", { status: "draft" }),
  review: inputs("review", { aiReviewState: "pending_review" }),
  gone: null,
};

beforeEach(() => {
  mockLoad.mockReset();
  mockScope.mockReset();
  mockScope.mockResolvedValue(SCOPE);
  mockLoad.mockImplementation(async (_claims, id) => STORED[id] ?? null);
});

describe("readExportRows", () => {
  it("one row per printable registo, in the file's order, with its group and its defaults", async () => {
    const owner = ctxOf("owner");
    const rows = await readExportRows(
      owner,
      [
        { group: "Fisioterapia", recordIds: ["imp", "draft"] },
        { group: null, recordIds: ["gone", "form", "review"] },
      ],
      "pt",
    );
    expect(rows).toEqual([
      { recordId: "imp", group: "Fisioterapia", version: 1, date: "2019-05-11", time: "", text: "Conteúdo importado" },
      { recordId: "form", group: null, version: 2, date: "2026-11-01", time: "09:00", text: "" },
    ]);
    // The render's reach: the scope asked once, every read under it, with the caller's claims.
    expect(mockScope).toHaveBeenCalledTimes(1);
    expect(mockLoad.mock.calls.map((c) => c[1])).toEqual(["imp", "draft", "gone", "form", "review"]);
    for (const call of mockLoad.mock.calls) {
      expect(call[0]).toEqual(toClaims(owner));
      expect(call[2]).toBe(SCOPE.value);
    }
  });

  it("reception is refused before the scope or any registo is read", async () => {
    await expect(readExportRows(ctxOf("reception"), [{ group: null, recordIds: ["form"] }], "pt")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(mockScope).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
