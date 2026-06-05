import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { describeFormCatalog } from "@/lib/intake/catalog";
import { locale } from "@/lib/i18n";

// GET /api/v1/me/forms/catalog — the intake forms the patient may submit
// (Ficha Geral + per-therapy supplements), localized PT-first. Read-only, no DB,
// no patient data; still gated on a valid patient session (fail-closed 401).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ forms: describeFormCatalog(locale) });
}
