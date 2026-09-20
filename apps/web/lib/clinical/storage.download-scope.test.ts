import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn() }));
const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { isClinicalError } from "./errors";
import { createAttachmentDownloadUrl } from "./storage";

/**
 * SEC-attachment-download-by-path-skips-the-patient-scope.
 *
 * ===========================================================================
 * THE GAP, FOUND BY A FRESH-CONTEXT REVIEW ON 2026-09-20, PRE-EXISTING ON MAIN
 * ===========================================================================
 * `createAttachmentDownloadUrl(ctx, path)` signed ANY live path in the tenant
 * for ANY role holding `clinical_records:read`. It asked three things: is the
 * path under this tenant's prefix, does a live attachments row hold it, may the
 * role read clinical records. It never asked WHOSE PATIENT the file belongs to,
 * nor whether it hangs off a registo the caller can open.
 *
 * `attachments` carries a tenant-only policy for staff, so RLS does not catch
 * it, and it takes a PATH: paths travel to the browser in every Documentos item
 * and every registo attachment list, so they leak exactly as an id does. A
 * therapist holding the path of another therapist's patient's file was handed a
 * 60 second signed URL, including for a Documentos row the id-based download had
 * just been taught to refuse.
 *
 * ===========================================================================
 * THE RULE NOW, AND WHY IT HAS TWO ARMS
 * ===========================================================================
 * A registo upload carries `clinical_record_id` and NO `patient_id`; a
 * patient-level document carries `patient_id` and no registo. So the path must
 * EITHER hang off a registo the caller can read - the LEFT JOINed
 * `clinical_records` row survives that table's own RLS (therapist: own
 * patients; admin: own clinics), AND the same app-level therapist scope
 * `getRecordDetail` applies holds - OR be a patient-level document under the
 * ficha's rule (therapist scope, else the viewer's clinics).
 *
 * Asserted by rendering the captured WHERE through drizzle's real dialect. The
 * fake transaction answers whatever it is told to, so only the SQL is evidence.
 * THE UNASSIGNED ADMIN IS THE CONTROL: no therapist predicate, no clinic
 * predicate, and still the structural rule that a path must belong somewhere.
 */

const mockRunScoped = vi.mocked(runScoped);
const mockLocations = vi.mocked(viewerLocationScope);

const TENANT = "11111111-1111-4111-8111-111111111111";
const THERAPIST_ID = "44444444-4444-4444-8444-444444444444";
const CLINIC = "55555555-5555-4555-8555-555555555555";
const PATH = `${TENANT}/records/rec-1/scan.pdf`;

const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const admin: RequestContext = { tenantId: TENANT, role: "admin", userId: "admin-1" };

function capture(rows: unknown[]) {
  const wheres: SQL[] = [];
  const joins: { table: unknown; on: SQL }[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "from", "limit"]) b[m] = () => b;
  b.leftJoin = (table: unknown, on: SQL) => {
    joins.push({ table, on });
    return b;
  };
  b.where = (w: SQL) => {
    wheres.push(w);
    return b;
  };
  b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(ok, fail);
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(b as never)));
  return { wheres, joins };
}

const dialect = new PgDialect();
const render = (w: SQL) => dialect.sqlToQuery(w);

const THERAPIST_SCOPE = /ap\.practitioner_id = \$\d+ OR ap\.practitioner_2_id = \$\d+/;
const LOCATION_SCOPE = /ap\.location_id IN \(/;
const REGISTO_READABLE = '"clinical_records"."id" is not null';
const PATIENT_LEVEL = '"attachments"."clinical_record_id" is null';

/**
 * WHY THE THERAPIST ARM IS PINNED WHOLE AND NOT BY SUBSTRING.
 *
 * Every assertion in this file used to be `toContain`, and presence is not
 * structure: flipping the outer `and(...)` that joins path, tenant, deleted_at
 * and the two arms into an `or(...)` leaves EVERY substring exactly where it
 * was, so the suite stayed green while the predicate had become "any live path
 * in the tenant, OR ...". A REVIEWER mutation on 2026-09-20 demonstrated it.
 *
 * So the therapist's WHERE - the widest-privilege composition, and the one the
 * finding is about - is compared in full, with runs of whitespace collapsed so
 * only the SHAPE is under test and a reflow of the scope templates does not
 * fail it. The other three cases keep the readable substring assertions; this
 * one is the mutation gate they lean on.
 */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const THERAPIST_WHERE = squash(`
  ("attachments"."storage_path" = $1
   and "attachments"."tenant_id" = $2
   and "attachments"."deleted_at" is null
   and (("clinical_records"."id" is not null and (
     EXISTS (
       SELECT 1 FROM patients po
       WHERE po.id = "clinical_records"."patient_id" AND po.created_by = $3
     )
     OR EXISTS (
       SELECT 1 FROM appointments ap
       WHERE (ap.patient_id = "clinical_records"."patient_id" OR ap.patient_2_id = "clinical_records"."patient_id")
         AND (ap.practitioner_id = $4 OR ap.practitioner_2_id = $5)
     )
   )) or ("attachments"."clinical_record_id" is null and "attachments"."patient_id" is not null and (
     EXISTS (
       SELECT 1 FROM patients po
       WHERE po.id = "attachments"."patient_id" AND po.created_by = $6
     )
     OR EXISTS (
       SELECT 1 FROM appointments ap
       WHERE (ap.patient_id = "attachments"."patient_id" OR ap.patient_2_id = "attachments"."patient_id")
         AND (ap.practitioner_id = $7 OR ap.practitioner_2_id = $8)
     )
   ))))
`);

beforeEach(() => {
  vi.clearAllMocks();
  createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/a" }, error: null });
});

describe("createAttachmentDownloadUrl - the path must belong to something the caller may see", () => {
  it("joins the registo, so clinical_records RLS decides whether the caller can read it", async () => {
    mockLocations.mockResolvedValue(null);
    const { joins, wheres } = capture([{ id: "a-1" }]);
    await createAttachmentDownloadUrl(therapist, PATH);
    expect(joins, "the read must LEFT JOIN clinical_records exactly once").toHaveLength(1);
    expect(render(joins[0]!.on).sql).toContain('"clinical_records"."id" = "attachments"."clinical_record_id"');
    const q = render(wheres[0]!);
    expect(q.sql).toContain(REGISTO_READABLE);
    expect(q.sql).toContain(PATIENT_LEVEL);
  });

  it("a THERAPIST is held to their own patients on BOTH arms, each keyed on its own patient column", async () => {
    mockLocations.mockResolvedValue(null);
    const { wheres } = capture([{ id: "a-1" }]);
    await createAttachmentDownloadUrl(therapist, PATH);
    const q = render(wheres[0]!);
    expect(q.sql).toMatch(THERAPIST_SCOPE);
    expect(q.sql).toMatch(/po\.id = "clinical_records"\."patient_id"/);
    expect(q.sql).toMatch(/po\.id = "attachments"\."patient_id"/);
    expect(q.params).toEqual(expect.arrayContaining([THERAPIST_ID, PATH, TENANT]));
  });

  it("THE MUTATION GATE: the therapist's WHERE is pinned WHOLE, so a flipped and/or is caught", async () => {
    // Presence is not structure. Substring assertions survive `and(...)` becoming
    // `or(...)` anywhere in this predicate; this one does not. See the note above
    // THERAPIST_WHERE.
    mockLocations.mockResolvedValue(null);
    const { wheres } = capture([{ id: "a-1" }]);
    await createAttachmentDownloadUrl(therapist, PATH);
    expect(squash(render(wheres[0]!).sql)).toBe(THERAPIST_WHERE);
  });

  it("an ADMIN assigned to a clinic is held to that clinic's patients on the patient-level arm", async () => {
    mockLocations.mockResolvedValue([CLINIC]);
    const { wheres } = capture([{ id: "a-1" }]);
    await createAttachmentDownloadUrl(admin, PATH);
    const q = render(wheres[0]!);
    expect(q.sql).toMatch(LOCATION_SCOPE);
    expect(q.sql).toMatch(/pl\.id = "attachments"\."patient_id"/);
    expect(q.sql).not.toMatch(THERAPIST_SCOPE);
    // the registo arm has no app-level clinic predicate: clinical_records RLS is it
    expect(q.sql).toContain(REGISTO_READABLE);
    expect(q.params).toEqual(expect.arrayContaining([CLINIC]));
  });

  it("THE CONTROL: an unassigned admin carries NEITHER scope, and the structural rule is still there", async () => {
    mockLocations.mockResolvedValue(null);
    const { wheres } = capture([{ id: "a-1" }]);
    await expect(createAttachmentDownloadUrl(admin, PATH)).resolves.toBe("https://signed.example/a");
    const q = render(wheres[0]!);
    expect(q.sql).not.toMatch(THERAPIST_SCOPE);
    expect(q.sql).not.toMatch(LOCATION_SCOPE);
    expect(q.sql).toContain(REGISTO_READABLE);
    expect(q.sql).toContain('"attachments"."deleted_at" is null');
  });

  it("a refused path is not_found and NOTHING is signed, exactly like an absent one", async () => {
    mockLocations.mockResolvedValue(null);
    capture([]);
    await expect(createAttachmentDownloadUrl(therapist, PATH)).rejects.toSatisfy(
      (e: unknown) => isClinicalError(e) && e.code === "not_found",
    );
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("a path that CLIMBS is refused before any read, even though its prefix is in-tenant", async () => {
    // Defence in depth for the download, and weaker than the confirm rule on
    // purpose: an imported original is several segments deep, so the question
    // here is only whether a segment climbs. It matters because rows written
    // before the confirm rule landed are still in the table, and because the
    // importer is a second writer into the same column.
    capture([{ id: "a-1" }]);
    await expect(
      createAttachmentDownloadUrl(therapist, `${TENANT}/records/../migration/fisiozero/x.pdf`),
    ).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "invalid");
    expect(mockLocations).not.toHaveBeenCalled();
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("a path outside the tenant prefix is refused BEFORE any read, the clinic lookup included", async () => {
    capture([{ id: "a-1" }]);
    await expect(
      createAttachmentDownloadUrl(therapist, "99999999-9999-4999-8999-999999999999/records/x.pdf"),
    ).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "invalid");
    expect(mockLocations).not.toHaveBeenCalled();
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
