import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { getRequestContext } from "@/lib/auth/context";
import { resolveLocationControl } from "@/lib/auth/location-choice";
import { bookingLocationScope } from "@/lib/auth/viewer-locations";
import { listActiveLocations } from "@/lib/invoices/queries";
import { AppShell } from "@/components/app-shell";
import { StartConsultation } from "./StartConsultation";

// W4-06 — start-consultation screen (AI recording chain entry). Recording is a
// clinician action: only clinical_records:author roles (therapist/owner) reach
// it; reception/admin are redirected (the server actions re-enforce this).
export default async function ConsultationPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "clinical_records:author")) redirect("/dashboard");

  // PL-34 — a walk-in stub is filed at a clinic, exactly as /patients/new files
  // one. `bookingLocationScope`, not `viewerLocationScope`: the read scope is
  // null for a therapist by design, and a therapist is who this screen is for.
  const [scope, locations] = await Promise.all([
    bookingLocationScope(ctx),
    listActiveLocations(ctx),
  ]);
  const control = resolveLocationControl(
    scope,
    locations.map((l) => ({ id: l.id, label: l.name })),
  );
  const stubLocations =
    control.kind === "fixed"
      ? [{ id: control.location.id, name: control.location.label }]
      : control.options.map((o) => ({ id: o.id, name: o.label }));

  return (
    <AppShell>
      <main className="px-8 py-6">
        <StartConsultation locations={stubLocations} />
      </main>
    </AppShell>
  );
}
