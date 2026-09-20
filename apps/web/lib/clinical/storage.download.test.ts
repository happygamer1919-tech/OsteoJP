import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// SR-62 PU-4 — the Anexos download signs a path only if a LIVE attachment row
// holds it. Before, it checked the tenant prefix alone, so an imported original
// soft-deleted on the Documentos tab stayed openable from a registo by its path.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));
// The clinic scope is resolved before the transaction; unassigned here. The scope
// itself is owned by storage.download-scope.test.ts.
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn(async () => null) }));
const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { isClinicalError } from "./errors";
import { createAttachmentDownloadUrl } from "./storage";

const mockRunScoped = vi.mocked(runScoped);
const TENANT = "11111111-1111-4111-8111-111111111111";
const admin: RequestContext = { tenantId: TENANT, role: "admin", userId: "admin-1" };
const PATH = `${TENANT}/migration/fisiozero/RGPD-original.pdf`;

function liveRows(rows: unknown[]) {
  const wheres: SQL[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "from", "leftJoin", "limit"]) b[m] = () => b;
  b.where = (w: SQL) => {
    wheres.push(w);
    return b;
  };
  b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(ok, fail);
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(b as never)));
  return wheres;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAttachmentDownloadUrl (SR-62 PU-4)", () => {
  it("signs when a live row in this tenant holds the path", async () => {
    const wheres = liveRows([{ id: "a-1" }]);
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/a" }, error: null });

    await expect(createAttachmentDownloadUrl(admin, PATH)).resolves.toBe("https://signed.example/a");

    expect(createSignedUrl).toHaveBeenCalledWith(PATH, 60);
    const q = new PgDialect().sqlToQuery(wheres[0]!);
    expect(q.sql).toContain('"attachments"."storage_path" = $');
    expect(q.sql).toContain('"attachments"."deleted_at" is null');
    expect(q.params).toEqual(expect.arrayContaining([PATH, TENANT]));
  });

  it("refuses a path with no live row (soft-deleted, or never recorded), and signs nothing", async () => {
    liveRows([]);
    await expect(createAttachmentDownloadUrl(admin, PATH)).rejects.toSatisfy(
      (e: unknown) => isClinicalError(e) && e.code === "not_found",
    );
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("still refuses a foreign-tenant path before reading anything", async () => {
    liveRows([{ id: "a-1" }]);
    await expect(
      createAttachmentDownloadUrl(admin, "99999999-9999-4999-8999-999999999999/x.pdf"),
    ).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "invalid");
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
