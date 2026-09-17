/**
 * RGPD-01 — the consent captured at patient creation (owner ruling
 * Q-RGPD-NEW = b): asked at creation, NOT required, and the ficha shows
 * "RGPD em falta" until it exists.
 *
 * These run the REAL modules against a fake transaction, so the assertions are
 * on the values the app actually hands the database. The database's own rules
 * (tenant RLS, `recorded_by = auth.uid()`, append-only, the blank-version
 * CHECK) are proven separately and DB-gated in
 * `packages/db/tests/patient-rgpd-acceptances.db.test.ts` — that suite proves
 * the database refuses a lie, this one proves the app does not tell one.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));

import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { RGPD_VERSION, getLatestRgpdAcceptance, insertRgpdAcceptanceTx } from "./rgpd-acceptance";
import { parseCreatePatient } from "./validation";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeAudit);

/** The ACTING STAFF MEMBER. Deliberately not the patient id below. */
const ctx: RequestContext = { tenantId: "tenant-1", role: "reception", userId: "staff-1" };
const PATIENT = "patient-9";

/** Captures what the module inserts, without a database. */
function fakeInsertTx() {
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        inserted.push(v);
      },
    }),
  };
  return { tx, inserted };
}

/** A select chain that yields `rows`, so the read can be asserted without a DB. */
function fakeSelectTx(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => rows,
  };
  return { select: () => chain };
}

describe("the tick is OPTIONAL, and anything but a true boolean means not signed", () => {
  // The ruling is "asked at creation, NOT required". A registration with no
  // consent is a normal registration, so the parser must never refuse it.
  const base = { fullName: "Maria Silva", nifExempt: true, nifExemptReason: "Estrangeira" };

  it("defaults to false when the key is absent — creating without ticking is allowed", () => {
    expect(parseCreatePatient(base).rgpdConsent).toBe(false);
  });

  it("is false for every non-true value a hand-posted payload could carry", () => {
    for (const v of ["true", 1, "on", {}, [], null, undefined]) {
      expect(parseCreatePatient({ ...base, rgpdConsent: v as never }).rgpdConsent).toBe(false);
    }
  });

  it("is true only for the real boolean", () => {
    expect(parseCreatePatient({ ...base, rgpdConsent: true }).rgpdConsent).toBe(true);
  });
});

describe("ticking records WHO and WHEN", () => {
  beforeEach(() => {
    mockRunScoped.mockReset();
    mockAudit.mockClear();
  });

  it("writes patient_id, accepted_at, rgpd_version and recorded_by", async () => {
    const { tx, inserted } = fakeInsertTx();
    const acceptedAt = new Date("2026-09-17T10:15:00.000Z");

    await insertRgpdAcceptanceTx(tx as never, ctx, { patientId: PATIENT, acceptedAt });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      tenantId: "tenant-1",
      patientId: PATIENT,
      acceptedAt,
      rgpdVersion: RGPD_VERSION,
      // THE ACTOR IS THE STAFF MEMBER, never the patient. An acceptance with no
      // attestable actor is worth nothing in a dispute, and the RLS INSERT
      // policy re-checks this against auth.uid().
      recordedBy: "staff-1",
    });
    expect(inserted[0]).not.toMatchObject({ recordedBy: PATIENT });
  });

  it("audits the write in the SAME transaction, with no PII in the metadata", async () => {
    const { tx } = fakeInsertTx();
    await insertRgpdAcceptanceTx(tx as never, ctx, {
      patientId: PATIENT,
      acceptedAt: new Date("2026-09-17T10:15:00.000Z"),
    });

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const [auditTx, auditCtx, entry] = mockAudit.mock.calls[0]!;
    // Hard rule 6: the same tx, so the row and its audit commit together.
    expect(auditTx).toBe(tx);
    expect(auditCtx).toBe(ctx);
    expect(entry.action).toBe("patient.rgpd_accept");
    expect(entry.entityId).toBe(PATIENT);
    // Hard rule 7: a version label only. No name, no NIF, no clinical content.
    expect(entry.metadata).toEqual({ rgpdVersion: RGPD_VERSION });
  });

  it("uses the version label the build is on, and that label identifies real text", () => {
    // Unlike 0058's first terms label, this one is not a placeholder: the
    // wording exists at `clinical.consent.rgpd.body`. A blank label is refused
    // by a CHECK in the migration.
    expect(RGPD_VERSION).toBe("rgpd-v1-2026");
    expect(RGPD_VERSION.trim()).not.toBe("");
  });
});

describe("the badge is the ABSENCE of a row, so existing patients need no backfill", () => {
  // BLOCK BODY, NOT A CONCISE ARROW, and the difference is not style.
  // `mockReset()` RETURNS the mock, and vitest treats a value returned from
  // `beforeEach` as a TEARDOWN function — so a concise body registers the mock
  // ITSELF as teardown, and vitest calls it with ZERO arguments after every
  // test. The implementation then runs with `fn` undefined and throws "fn is
  // not a function", reported against the test that had just passed.
  // terms-acceptance.test.ts carries the same warning for the same reason.
  beforeEach(() => {
    mockRunScoped.mockReset();
  });

  it("returns null when the patient has no consent on file", async () => {
    mockRunScoped.mockImplementation(async (_c, fn) => fn(fakeSelectTx([]) as never));
    expect(await getLatestRgpdAcceptance(ctx, PATIENT)).toBeNull();
  });

  it("returns the latest consent when one exists", async () => {
    const acceptedAt = new Date("2026-09-17T10:15:00.000Z");
    mockRunScoped.mockImplementation(async (_c, fn) =>
      fn(fakeSelectTx([{ acceptedAt, rgpdVersion: RGPD_VERSION }]) as never),
    );
    expect(await getLatestRgpdAcceptance(ctx, PATIENT)).toEqual({
      acceptedAt: acceptedAt.toISOString(),
      rgpdVersion: RGPD_VERSION,
    });
  });

  it("READS THROUGH runScoped, so RLS scopes the row by tenant", async () => {
    // The read scope is not widened by this feature: it goes through the same
    // tenant-scoped transaction every other patient read uses. A direct client
    // would bypass RLS, which is the defect this asserts is absent.
    mockRunScoped.mockImplementation(async (_c, fn) => fn(fakeSelectTx([]) as never));
    await getLatestRgpdAcceptance(ctx, PATIENT);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    expect(mockRunScoped.mock.calls[0]![0]).toBe(ctx);
  });
});

describe("the module offers no way to rewrite history", () => {
  it("exports no update and no delete helper", async () => {
    // The table is append-only and the database enforces it; this asserts the
    // app does not even offer the shape, so nobody writes a helper that would
    // be refused at runtime.
    const mod = await import("./rgpd-acceptance");
    const names = Object.keys(mod);
    expect(names.some((n) => /update|delete|revoke|withdraw/i.test(n))).toBe(false);
    expect(names.sort()).toEqual(["RGPD_VERSION", "getLatestRgpdAcceptance", "insertRgpdAcceptanceTx"]);
  });
});
