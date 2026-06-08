import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { getOwnProfile, updateOwnProfile, type PatientProfilePatch } from "@/lib/patient/profile";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/patient/profile — the authenticated patient's OWN profile.
export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();
  try {
    const profile = await getOwnProfile(principal);
    if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/v1/patient/profile — update the patient's own editable fields.
// Editable whitelist: phone, address, postalCode, city.
// NOT editable via portal: fullName (identity), email (identity), nif (Phase 4).
export async function PATCH(req: Request): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Extract only the whitelisted fields — any other keys are silently ignored
  const raw = body as Record<string, unknown>;
  const patch: PatientProfilePatch = {};

  if ("phone" in raw) patch.phone = raw.phone === null ? null : String(raw.phone);
  if ("address" in raw) patch.address = raw.address === null ? null : String(raw.address);
  if ("postalCode" in raw) patch.postalCode = raw.postalCode === null ? null : String(raw.postalCode);
  if ("city" in raw) patch.city = raw.city === null ? null : String(raw.city);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_editable_fields" }, { status: 400 });
  }

  try {
    const profile = await updateOwnProfile(principal, patch);
    if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_PHONE") {
      return NextResponse.json({ error: "invalid_phone" }, { status: 422 });
    }
    return errorResponse(e);
  }
}
