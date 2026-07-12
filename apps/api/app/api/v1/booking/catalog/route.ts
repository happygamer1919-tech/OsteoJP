import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { getBookableCatalog } from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

// GET /api/v1/booking/catalog — the bookable service list + locations for the
// patient's tenant. Services are the OsteoJP self-bookable set (the two physio
// wrappers — Massagem Terapêutica, Pilates Terapêutico — included by default;
// RPG is the RGPD consent document, not a bookable service), location-scoped to
// the tenant's active locations. Prices are
// display-only (no payment, no fiscal document); the patient cannot self-claim a
// parceria — there is no price/discount field in any booking input.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();
  try {
    const catalog = await getBookableCatalog(principal, drizzleAppointmentsStore);
    return NextResponse.json(catalog);
  } catch (e) {
    return errorResponse(e);
  }
}
