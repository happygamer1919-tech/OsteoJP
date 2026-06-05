import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { getPatient } from "../../../../lib/patients/queries";
import { getRequestContext } from "../../../../lib/auth/context";
import { PatientForm } from "../../_components/patient-form";

export const dynamic = "force-dynamic";

const s = getStrings(DEFAULT_LOCALE);

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getRequestContext())) redirect("/login");

  const { id } = await params;
  const patient = await getPatient(id, { includeDeleted: true });
  if (!patient) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link href={`/patients/${id}`} className="text-sm text-brand-teal">
        ← {s["patients.back"]}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">
        {s["patients.editRecord"]}
      </h1>
      <PatientForm patient={patient} />
    </main>
  );
}
