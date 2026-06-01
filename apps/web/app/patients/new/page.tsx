import Link from "next/link";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { PatientForm } from "../_components/patient-form";

const s = getStrings(DEFAULT_LOCALE);

export default function NewPatientPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link href="/patients" className="text-sm text-brand-teal">
        ← {s["patients.back"]}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">
        {s["patients.new"]}
      </h1>
      <PatientForm />
    </main>
  );
}
