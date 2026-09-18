import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// SR-62 PU-4 — a soft-deleted document is gone from a registo's Anexos too.
//
// DECISION, READ OFF THE CODE: an imported original linked to a registo is ONE
// `attachments` row that the Documentos tab AND the ficha's Anexos both list
// (owner ruling 2026-09-13, "both places"). Removing it on the Documentos tab
// and leaving it on Anexos would show the same row as present in one place and
// deleted in the other. So getRecordDetail's attachment read filters
// deleted_at IS NULL. The record row, its status and the immutability trigger
// are untouched.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import { attachments, clinicalRecords } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { getRecordDetail } from "./records";

const mockRunScoped = vi.mocked(runScoped);
const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const RECORD = "44444444-4444-4444-8444-444444444444";

type Query = { table: unknown; wheres: SQL[] };

function recordTx() {
  const log: Query[] = [];
  const tx = {
    select: () => {
      const q: Query = { table: undefined, wheres: [] };
      log.push(q);
      const b: Record<string, unknown> = {};
      b.from = (t: unknown) => {
        q.table = t;
        return b;
      };
      b.where = (w: SQL) => {
        q.wheres.push(w);
        return b;
      };
      for (const m of ["innerJoin", "leftJoin", "orderBy", "limit"]) b[m] = () => b;
      b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve(
          q.table === clinicalRecords
            ? [
                {
                  id: RECORD,
                  patientId: "p-1",
                  patientName: "Paciente",
                  patientSex: null,
                  patientNumber: null,
                  patientDateOfBirth: null,
                  patientProfession: null,
                  episodeId: null,
                  episodeTitle: null,
                  formTemplateId: null,
                  status: "signed",
                  source: "migration",
                  aiReviewState: null,
                  version: 1,
                  supersedesId: null,
                  data: {},
                  signedAt: null,
                  signedByName: null,
                  createdAt: new Date("2026-09-01T00:00:00Z"),
                  updatedAt: new Date("2026-09-01T00:00:00Z"),
                  templateTitle: null,
                  templateSchema: null,
                },
              ]
            : [],
        ).then(ok, fail);
      return b;
    },
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return log;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRecordDetail — Anexos (SR-62 PU-4)", () => {
  it("reads this registo's attachments WITHOUT the soft-deleted ones", async () => {
    const log = recordTx();

    const detail = await getRecordDetail(admin, RECORD);

    expect(detail?.attachments).toEqual([]);
    const att = log.find((q) => q.table === attachments);
    expect(att, "the Anexos read ran").toBeDefined();
    const where = new PgDialect().sqlToQuery(att!.wheres[0]!);
    expect(where.sql).toContain('"attachments"."clinical_record_id" = $');
    expect(where.sql).toContain('"attachments"."deleted_at" is null');
    expect(where.params).toContain(RECORD);
  });
});
