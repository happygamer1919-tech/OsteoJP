/**
 * W13-05 — the acceptance capture. WAVE-13.md LOOP 5 section 3 DoD:
 * "the acceptance record captures all four fields, with `recorded_by` = the
 * acting staff member, not the patient."
 *
 * These run the REAL module against a fake transaction, so the assertions are on
 * the values the module actually hands the database. The database's own rules
 * (RLS scoping, `recorded_by = auth.uid()`, append-only, the blank-version CHECK)
 * are proven separately and DB-gated in
 * `packages/db/tests/patient-terms-acceptances-rls.test.ts` — that suite proves
 * the database refuses a lie; this one proves the app does not tell one.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import {
  TERMS_VERSION,
  recordTermsAcceptance,
  hasAcceptedTerms,
  getLatestTermsAcceptance,
} from "./terms-acceptance";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

/** The ACTING STAFF MEMBER. Deliberately not the patient id below. */
const ctx: RequestContext = { tenantId: "tenant-1", role: "therapist", userId: "staff-1" };
const PATIENT = "patient-9";

/** Captures what the module inserts, without a database. */
function fakeTx() {
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

describe("recordTermsAcceptance — the four fields", () => {
  beforeEach(() => {
    mockRunScoped.mockReset();
    mockAudit.mockClear();
  });

  it("writes patient_id, accepted_at, terms_version and recorded_by", async () => {
    const { tx, inserted } = fakeTx();
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));
    const acceptedAt = new Date("2026-08-07T09:30:00.000Z");

    await recordTermsAcceptance(ctx, { patientId: PATIENT, acceptedAt });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      tenantId: "tenant-1",
      patientId: PATIENT,
      acceptedAt,
      termsVersion: TERMS_VERSION,
      recordedBy: "staff-1",
    });
  });

  /**
   * THE ONE FIELD A CALLER COULD LIE ABOUT, and the field the row's whole
   * evidential value rests on. An acceptance attributed to the patient would be
   * the patient attesting to their own acceptance, which attests to nothing.
   */
  it("records the ACTING STAFF MEMBER, never the patient", async () => {
    const { tx, inserted } = fakeTx();
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));

    await recordTermsAcceptance(ctx, { patientId: PATIENT, acceptedAt: new Date() });

    expect(inserted[0]!.recordedBy).toBe("staff-1");
    expect(inserted[0]!.recordedBy).not.toBe(PATIENT);
    expect(inserted[0]!.recordedBy).not.toBe(inserted[0]!.patientId);
  });

  it("runs inside the tenant-scoped seam, so RLS applies and auth.uid() resolves", async () => {
    const { tx } = fakeTx();
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));

    await recordTermsAcceptance(ctx, { patientId: PATIENT, acceptedAt: new Date() });

    expect(mockRunScoped).toHaveBeenCalledWith(ctx, expect.any(Function));
  });

  it("audits the capture with identifiers and a version only — no clinical content", async () => {
    const { tx } = fakeTx();
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));

    await recordTermsAcceptance(ctx, { patientId: PATIENT, acceptedAt: new Date() });

    expect(mockAudit).toHaveBeenCalledOnce();
    const args = mockAudit.mock.calls[0]![1];
    expect(args.action).toBe("patient_terms.accept");
    expect(args.entityType).toBe("patient");
    expect(args.entityId).toBe(PATIENT);
    expect(args.actorUserId).toBe("staff-1");
    expect(args.metadata).toEqual({ termsVersion: TERMS_VERSION });
  });

  /**
   * Append-only. There is no update path and no delete path in this module, and
   * adding one would be refused by the database anyway (0058 revokes the grants
   * and defines no UPDATE/DELETE policy). Asserted in source so a future edit
   * that adds one is caught here rather than at runtime in production.
   */
  it("exposes no update or delete path", async () => {
    const mod = await import("./terms-acceptance");
    const names = Object.keys(mod).join(" ").toLowerCase();
    expect(names).not.toContain("update");
    expect(names).not.toContain("delete");
    expect(names).not.toContain("revoke");
  });

  it("carries a terms version that is not blank — the CHECK would refuse one", () => {
    expect(TERMS_VERSION.trim()).not.toBe("");
  });
});

/**
 * A fake `tx` for the read paths. The drizzle builder is chained, so the fake
 * mirrors the chain and records the `where` expression for inspection. Note it
 * runs the CALLBACK rather than stubbing `runScoped`'s return value — stubbing
 * the return would prove the mock works, not that the module reduces rows to a
 * boolean, which is the thing the gate depends on.
 */
function fakeSelectTx(rows: unknown[]) {
  const wheres: unknown[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: (w: unknown) => {
          wheres.push(w);
          return {
            limit: async () => rows,
            orderBy: () => ({ limit: async () => rows }),
          };
        },
      }),
    }),
  };
  return { tx, wheres };
}

/** Walks an object graph (drizzle SQL nodes are cyclic) looking for a value. */
function graphContains(root: unknown, needle: string): boolean {
  const seen = new Set<unknown>();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node === needle) return true;
    if (node === null || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    stack.push(...Object.values(node as Record<string, unknown>));
  }
  return false;
}

describe("hasAcceptedTerms — the gate's per-patient input", () => {
  // Block body, NOT a concise arrow. `mockReset()` returns the mock, and vitest
  // treats a value returned from beforeEach as a TEARDOWN function - so a
  // concise body registers the mock itself as teardown and vitest then calls it
  // with zero arguments after every test.
  beforeEach(() => {
    mockRunScoped.mockReset();
  });

  it("is true when a row exists for the CURRENT version", async () => {
    const { tx } = fakeSelectTx([{ id: "row-1" }]);
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));
    await expect(hasAcceptedTerms(ctx, PATIENT)).resolves.toBe(true);
  });

  it("is false when there is no row at all", async () => {
    const { tx } = fakeSelectTx([]);
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));
    await expect(hasAcceptedTerms(ctx, PATIENT)).resolves.toBe(false);
  });

  /**
   * VERSION-SPECIFIC ON PURPOSE. "Ever accepted anything" would announce a fee
   * under terms the patient never saw — the same failure the per-patient gate
   * exists to prevent, one level down.
   */
  it("asks about a specific version, not about acceptance in general", async () => {
    const { tx, wheres } = fakeSelectTx([]);
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));

    await hasAcceptedTerms(ctx, PATIENT, "2099-01");

    expect(wheres).toHaveLength(1);
    expect(graphContains(wheres[0], "2099-01")).toBe(true);
    expect(graphContains(wheres[0], PATIENT)).toBe(true);
  });

  it("defaults to the current version when the caller does not name one", async () => {
    const { tx, wheres } = fakeSelectTx([]);
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));

    await hasAcceptedTerms(ctx, PATIENT);

    expect(graphContains(wheres[0], TERMS_VERSION)).toBe(true);
  });
});

describe("getLatestTermsAcceptance — display only", () => {
  beforeEach(() => {
    mockRunScoped.mockReset();
  });

  it("returns null when the patient has never accepted", async () => {
    const { tx } = fakeSelectTx([]);
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));
    await expect(getLatestTermsAcceptance(ctx, PATIENT)).resolves.toBeNull();
  });

  it("returns the instant as an ISO string plus the version", async () => {
    const { tx } = fakeSelectTx([
      { acceptedAt: new Date("2026-05-01T10:00:00.000Z"), termsVersion: "2026-08" },
    ]);
    mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));
    await expect(getLatestTermsAcceptance(ctx, PATIENT)).resolves.toEqual({
      acceptedAt: "2026-05-01T10:00:00.000Z",
      termsVersion: "2026-08",
    });
  });
});
