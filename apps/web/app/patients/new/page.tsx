import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { resolveLocationControl } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { listActiveLocations } from "@/lib/invoices/queries";
import { PatientForm } from "../_components/patient-form";

const s = getStrings(DEFAULT_LOCALE);

export const dynamic = "force-dynamic";

export default async function NewPatientPage() {
  // PL-15b: a new patient is filed at a clinic, and PL-14 decides whether that is
  // a question at all - a single-clinic staffer gets it applied silently, a
  // multi-clinic one picks from their OWN clinics, the owner from all of them.
  // Without this the column stayed NULL and the patient was invisible to
  // everyone but the owner and whoever created them.
  // OSTEOJP-WEB-8: the guard redirects on its own now. The .catch() also
  // swallowed a real Auth outage into a login bounce.
  const actor = await requireRequestContext();
  const [scope, locations] = await Promise.all([
    viewerLocationScope(actor),
    listActiveLocations(actor),
  ]);
  const control = resolveLocationControl(
    scope,
    locations.map((l) => ({ id: l.id, label: l.name })),
  );
  const formLocations =
    control.kind === "fixed"
      ? [{ id: control.location.id, name: control.location.label }]
      : control.options.map((o) => ({ id: o.id, name: o.label }));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link href="/patients" className="inline-flex items-center gap-1 text-sm text-accent-2-700">
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />{s["patients.back"]}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">
        {s["patients.new"]}
      </h1>
      <PatientForm locations={formLocations} />
    </main>
  );
}
