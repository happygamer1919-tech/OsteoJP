import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { getPatient } from "../../../../lib/patients/queries";
import { getRequestContext } from "../../../../lib/auth/context";
import { resolveLocationControl } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { listActiveLocations } from "@/lib/invoices/queries";
import { PatientForm } from "../../_components/patient-form";

export const dynamic = "force-dynamic";

const s = getStrings(DEFAULT_LOCALE);

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getRequestContext();
  if (!actor) redirect("/login");

  const { id } = await params;
  const patient = await getPatient(id, { includeDeleted: true });
  if (!patient) notFound();

  // PL-15b: the clinic is editable here too, so a patient registered before the
  // form carried one (or filed at the wrong clinic) can be corrected. Same PL-14
  // rule: one reachable clinic renders as a line, several as a picker.
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
      <Link href={`/patients/${id}`} className="text-sm text-brand-teal">
        ← {s["patients.back"]}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">
        {s["patients.editRecord"]}
      </h1>
      <PatientForm patient={patient} locations={formLocations} />
    </main>
  );
}
