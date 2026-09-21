import { vi, describe, it, expect, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

/**
 * THE RECORDING CHAIN ASKS THE DATABASE WHO THE PATIENT IS.
 *
 * ===========================================================================
 * WHY A SECOND FILE, AND WHY IT RENDERS SQL
 * ===========================================================================
 * `actions.test.tsx` stubs `@osteojp/db` down to `{ patients: { id: ... } }`
 * and its fake transaction answers with whatever rows it was handed, whatever
 * the WHERE says. That file can therefore prove the CALL — that a scoped read
 * happens, in the right order, and that its answer is the id every write
 * downstream uses — but it can never prove the PREDICATE. A read that asked
 * `WHERE true` would pass every assertion in it.
 *
 * This file imports the REAL schema and renders the captured WHERE through
 * drizzle's real Postgres dialect, the technique
 * lib/patients/documents.visibility-scope.test.ts established. It reads the SQL
 * Postgres would actually receive.
 *
 * ===========================================================================
 * THE OWNER IS THE CONTROL, AND IT IS THE ONLY CONTROL AVAILABLE
 * ===========================================================================
 * Only two roles reach these three actions at all: `clinical_records:author` is
 * granted to owner and therapist and DENIED to admin and reception, which
 * lib/auth/permission-matrix.test.ts pins independently of PERMISSIONS. So
 * `therapistPatientScope` alone is the WHOLE of the visibility rule here —
 * there is no located receptionist or admin to hold to a clinic, and
 * `patientLocationScope` would be dead weight that lib/patients/
 * scope-call-sites.test.ts would then have to carry.
 *
 * The owner arm is what stops a scope string that is always present from
 * passing every positive arm.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn(), runScoped: vi.fn() }));
vi.mock("@/lib/patients/actions", () => ({ createStubPatient: vi.fn() }));
vi.mock("@/lib/auth/viewer-locations", () => ({ bookingLocationScope: vi.fn() }));
vi.mock("@/lib/patients/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/consultation/audio-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/consultation/audio-storage")>()),
  signAudioUpload: vi.fn(),
  signAudioDownload: vi.fn(),
}));
vi.mock("@/lib/consultation/m1-webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/consultation/m1-webhook")>()),
  fireM1Webhook: vi.fn(),
}));
vi.mock("@/lib/consultation/consultation-store", () => ({
  persistConsultation: vi.fn(),
  markDelivered: vi.fn(),
  markPending: vi.fn(),
  markNeedsAttention: vi.fn(),
  SCAN_LIMIT: 100,
}));

import { runScoped, requireRequestContext } from "@/lib/auth/context";
import { signAudioDownload, signAudioUpload } from "@/lib/consultation/audio-storage";
import { fireM1Webhook } from "@/lib/consultation/m1-webhook";
import { persistConsultation } from "@/lib/consultation/consultation-store";
import type { RequestContext } from "@osteojp/auth";
import {
  fireConsultationWebhookAction,
  signAudioUploadAction,
  startConsultationAction,
} from "./actions";

const mockRunScoped = vi.mocked(runScoped);
const mockCtx = vi.mocked(requireRequestContext);
const mockSignUpload = vi.mocked(signAudioUpload);
const mockSignDownload = vi.mocked(signAudioDownload);
const mockFire = vi.mocked(fireM1Webhook);
const mockPersist = vi.mocked(persistConsultation);

const TENANT = "11111111-1111-4111-8111-111111111111";
const PATIENT = "22222222-2222-4222-8222-222222222222";
const THERAPIST_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";
const STARTED_AT = "2026-07-07T01:00:00.000Z";
const ENDED_AT = "2026-07-07T01:30:00.000Z";
const OBJECT_KEY = `${TENANT}/${PATIENT}/2026-07-07T01-00-00-000Z/consultation.webm`;

const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const owner: RequestContext = { tenantId: TENANT, role: "owner", userId: OWNER_ID };

const dialect = new PgDialect();

/**
 * Captures the WHERE of every `patients` read the action makes, and answers it
 * with the row regardless — "it refused" would prove nothing about the SQL.
 */
function capturingTx(): SQL[] {
  const wheres: SQL[] = [];
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = (w: SQL) => {
    wheres.push(w);
    return chain;
  };
  chain.limit = async () => [{ id: PATIENT }];
  mockRunScoped.mockImplementation(async (_c, fn) => fn({ select: () => chain } as never));
  return wheres;
}

const ACTIONS: ReadonlyArray<[string, () => Promise<unknown>]> = [
  ["startConsultationAction", () => startConsultationAction({ patientId: PATIENT, consent: true })],
  [
    "signAudioUploadAction",
    () => signAudioUploadAction({ patientId: PATIENT, consultationStartedAt: STARTED_AT }),
  ],
  [
    "fireConsultationWebhookAction",
    () =>
      fireConsultationWebhookAction({
        objectKey: OBJECT_KEY,
        patientId: PATIENT,
        consultationStartedAt: STARTED_AT,
        consultationEndedAt: ENDED_AT,
      }),
  ],
];

// The distinctive halves of lib/patients/scope.ts. `ap.practitioner_id` appears
// only in the therapist scope; `po.created_by` is its other arm.
const THERAPIST_SCOPE = /ap\.practitioner_id = \$\d+ OR ap\.practitioner_2_id = \$\d+/;
const CREATED_BY_ARM = /po\.created_by = \$\d+/;

async function patientQuery(run: () => Promise<unknown>, ctx: RequestContext) {
  mockCtx.mockResolvedValue(ctx);
  const wheres = capturingTx();
  await run();
  expect(wheres, "the action must make exactly one patients read").toHaveLength(1);
  return dialect.sqlToQuery(wheres[0]!);
}

describe.each(ACTIONS)("%s resolves the patient under the visibility rule", (_name, run) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUpload.mockResolvedValue({ url: "https://s3/put?sig", objectKey: OBJECT_KEY });
    mockSignDownload.mockResolvedValue("https://s3/get?sig");
    mockFire.mockResolvedValue({ ok: true, status: 200 });
    mockPersist.mockResolvedValue({ id: "c-1", attemptCount: 0, fireStatus: "pending" });
  });

  it("a THERAPIST is held to their own patients, keyed on the patients row itself", async () => {
    const q = await patientQuery(run, therapist);
    expect(q.sql).toMatch(THERAPIST_SCOPE);
    expect(q.sql).toMatch(CREATED_BY_ARM);
    // INSIDE the scope, not merely somewhere in the WHERE: a scope keyed on the
    // wrong table renders fine here and is rejected by Postgres at runtime,
    // which the server action would swallow into a refusal.
    expect(q.sql).toMatch(/po\.id = "patients"\."id"/);
    expect(q.sql).toMatch(/ap\.patient_id = "patients"\."id"/);
    expect(q.params).toEqual(expect.arrayContaining([THERAPIST_ID]));
    // and the read is still keyed on the id that was asked for
    expect(q.sql).toMatch(/"patients"\."id" = \$\d+/);
    expect(q.params).toEqual(expect.arrayContaining([PATIENT]));
    // THE CONNECTIVE, PINNED SEPARATELY. Every assertion above matches an `or`
    // form just as well as an `and` one, so `and(byId, scope)` becoming
    // `or(byId, scope)` — one character — would keep this file green while
    // widening the read to every patient the therapist can see. This is the arm
    // that goes red for that.
    expect(q.sql).toMatch(/"patients"\."id" = \$\d+ and \(\s*EXISTS/);
  });

  it("THE CONTROL: an owner carries no therapist narrowing, only the id", async () => {
    const q = await patientQuery(run, owner);
    expect(q.sql).not.toMatch(THERAPIST_SCOPE);
    expect(q.sql).not.toMatch(CREATED_BY_ARM);
    expect(q.sql).toMatch(/"patients"\."id" = \$\d+/);
    expect(q.params).toEqual([PATIENT]);
  });
});
