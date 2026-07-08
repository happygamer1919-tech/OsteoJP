import { redirect } from "next/navigation";
import Link from "next/link";
import { can } from "@osteojp/auth";
import { Button } from "@osteojp/ui";
import { s, locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  listActiveTemplates,
  listEpisodesForPicker,
} from "@/lib/clinical/records";
import { getPatient } from "@/lib/patients/queries";
import { createRecordAction } from "./actions";
import { PatientPicker } from "./patient-picker";

export default async function NewRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; patientId?: string; episodeId?: string }>;
}) {
  const ctx = await requireRequestContext();
  // Authoring is owner/therapist only; admins can read but not create.
  if (!can(ctx.role, "clinical_records:author")) redirect("/clinical");

  const [templates, episodes] = await Promise.all([
    listActiveTemplates(ctx),
    listEpisodesForPicker(ctx),
  ]);
  // Prefill when arriving from an episode ("+ New record in this episode").
  const { m, patientId, episodeId } = await searchParams;
  // W5-02: the Paciente field is an async search Combobox (the old Select
  // listed EVERY patient). Resolve the prefill id to a name so the pre-selected
  // patient is visible without a client round-trip; a bad/foreign id resolves
  // to null (no prefill), same denial the create action enforces server-side.
  const prefillPatient = patientId ? await getPatient(patientId) : null;

  return (
    <section className="max-w-xl space-y-4">
      <h2 className="text-base font-semibold">{s["clinical.newTitle"]}</h2>
      {m === "err" && <p className="text-sm text-error">{s["clinical.error"]}</p>}

      <form action={createRecordAction} className="space-y-3">
        <PatientPicker
          initial={
            prefillPatient
              ? { id: prefillPatient.id, name: prefillPatient.fullName }
              : null
          }
        />

        <label className="block space-y-1">
          <span className="text-sm font-medium">{s["clinical.template"]} *</span>
          <select name="formTemplateId" required className="block w-full rounded border px-2 py-1.5 text-sm">
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {(t.title?.[locale] ?? t.key) + ` v${t.version}`}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{s["clinical.episode"]}</span>
          <select name="episodeId" defaultValue={episodeId ?? ""} className="block w-full rounded border px-2 py-1.5 text-sm">
            <option value="">{s["clinical.episodeNone"]}</option>
            {episodes.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm">
            {s["clinical.create"]}
          </Button>
          <Link href="/clinical" className="rounded border px-3 py-2 text-sm">
            {s["common.cancel"]}
          </Link>
        </div>
      </form>
    </section>
  );
}
