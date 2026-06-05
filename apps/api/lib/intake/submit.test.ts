import { describe, expect, it, vi, beforeEach } from "vitest";

// submit.ts is `server-only`; neutralize the guard so the node test can import
// the real module (we exercise its logic with a mocked runAsPatient).
vi.mock("server-only", () => ({}));

// Mock the patient gate so the writer test never loads server-only / Supabase.
// runAsPatient(principal, fn) just runs fn with a fake tx that captures the
// insert — letting us assert exactly what would be written.
const { runAsPatient } = vi.hoisted(() => ({ runAsPatient: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ runAsPatient }));

import { createPatientFormSubmission } from "./submit";
import { patientFormSubmissions, clinicalRecords } from "@osteojp/db";

type Insert = { table: unknown; values: Record<string, unknown> };

function fakeTxCapturing(capture: Insert[]) {
  return {
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          capture.push({ table, values });
          return {
            returning: () =>
              Promise.resolve([
                {
                  id: "sub-1",
                  formKey: values.formKey,
                  therapy: values.therapy ?? null,
                  source: values.source,
                  reviewState: values.reviewState,
                  submittedAt: new Date("2026-06-04T10:00:00Z"),
                },
              ]),
          };
        },
      };
    },
  };
}

/** Install a runAsPatient that runs the handler against a capturing fake tx.
 * Guards non-function args: importing drizzle table objects from @osteojp/db
 * provokes a spurious zero-arg spy invocation under vitest; ignore it. */
function captureWrites(): Insert[] {
  const writes: Insert[] = [];
  runAsPatient.mockImplementation((...args: unknown[]) => {
    const fn = args[1];
    if (typeof fn !== "function") return undefined;
    return (fn as (tx: unknown) => unknown)(fakeTxCapturing(writes));
  });
  return writes;
}

const PRINCIPAL = { tenantId: "tenant-A", patientId: "patient-1", userId: "auth-sub-1" };

beforeEach(() => runAsPatient.mockReset());

describe("createPatientFormSubmission", () => {
  it("tags source='patient', lands in 'pending_review', writes ONLY the submission", async () => {
    const writes = captureWrites();

    const res = await createPatientFormSubmission(PRINCIPAL, {
      formKey: "supplement",
      therapy: "osteopathy",
      payload: { pain: "lombar" },
    });

    expect(res.ok).toBe(true);
    expect(writes).toHaveLength(1);
    // NO-AUTO-FINALIZE: the only write is to patient_form_submissions, never to
    // clinical_records (the finalized clinical lifecycle table).
    expect(writes[0].table).toBe(patientFormSubmissions);
    expect(writes[0].table).not.toBe(clinicalRecords);
    expect(writes[0].values.source).toBe("patient");
    expect(writes[0].values.reviewState).toBe("pending_review");
  });

  it("derives patient_id + tenant_id from the PRINCIPAL, never the payload", async () => {
    const writes = captureWrites();

    // Adversarial: the input type has no patient_id/tenant_id, and even a
    // smuggled one (cast through) must be ignored — ids come from the principal.
    await createPatientFormSubmission(PRINCIPAL, {
      formKey: "ficha_geral",
      payload: {},
      ...({ patientId: "patient-VICTIM", tenantId: "tenant-EVIL", reviewState: "approved" } as object),
    });

    expect(writes[0].values.patientId).toBe("patient-1"); // principal, not "patient-VICTIM"
    expect(writes[0].values.tenantId).toBe("tenant-A"); // principal, not "tenant-EVIL"
    expect(writes[0].values.reviewState).toBe("pending_review"); // not the smuggled "approved"
  });

  it("returns a validation error without writing anything", async () => {
    const writes = captureWrites();
    const res = await createPatientFormSubmission(PRINCIPAL, { formKey: "bogus" });
    expect(res).toEqual({ ok: false, error: "unknown_form" });
    expect(writes).toHaveLength(0); // validation fails before runAsPatient
  });
});
