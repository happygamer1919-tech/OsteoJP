import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import {
  getOwnProfile,
  ownSurveySwitchOffered,
  updateOwnProfile,
  type PatientProfilePatch,
} from "@/lib/patient/profile";
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
// Editable whitelist: phone, address, postalCode, city, reminderSmsEnabled, reminderEmailEnabled.
// NOT editable via portal: fullName (identity), email (identity), nif (Phase 4).
//
// SAT-01: `surveyEnabled` joins the whitelist ONLY for a patient who is offered
// the survey switch (lib/patient/profile.ts, ownSurveySwitchOffered). For
// everyone else, which is everyone while SURVEY_SEND_MODE reads off, it is one
// more key this route does not know: ignored, and alone it is a 400 like any
// other body with nothing editable in it. A value that is not a boolean is
// refused rather than coerced, so the string "false" can never turn it on.
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
  if ("reminderSmsEnabled" in raw) patch.reminderSmsEnabled = Boolean(raw.reminderSmsEnabled);
  if ("reminderEmailEnabled" in raw) patch.reminderEmailEnabled = Boolean(raw.reminderEmailEnabled);
  if ("surveyEnabled" in raw && ownSurveySwitchOffered(principal)) {
    if (typeof raw.surveyEnabled !== "boolean") {
      return NextResponse.json({ error: "invalid_survey_enabled" }, { status: 422 });
    }
    patch.surveyEnabled = raw.surveyEnabled;
  }

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
