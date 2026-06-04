import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { createPatientFormSubmission, listOwnSubmissions } from "@/lib/intake/submit";
import type { FormSubmissionInput } from "@/lib/intake/catalog";

// Patient form intake — the Ficha Geral + per-therapy supplements.
//
//   POST /api/v1/me/forms  — submit a form. Source-tagged 'patient', lands in
//     'pending_review', and NEVER finalizes a clinical_record (review only;
//     the therapist finalize path is a future wave). patient_id comes from the
//     verified principal, never the body.
//   GET  /api/v1/me/forms  — list the patient's OWN submissions (self-scope).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Build the input from the body — note patient_id/tenant_id are deliberately
  // NOT read from the body; the writer takes them from the principal.
  const input: FormSubmissionInput = {
    formKey: typeof b.formKey === "string" ? b.formKey : "",
    therapy: b.therapy == null ? null : typeof b.therapy === "string" ? b.therapy : "",
    payload: b.payload,
  };

  const result = await createPatientFormSubmission(principal, input);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ submission: result.submission }, { status: 201 });
}

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const submissions = await listOwnSubmissions(principal);
  return NextResponse.json({ submissions });
}
