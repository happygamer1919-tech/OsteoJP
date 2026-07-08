import { redirect } from "next/navigation";
import Link from "next/link";
import { can } from "@osteojp/auth";
import { Button } from "@osteojp/ui";
import { s, locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  listActiveTemplates,
  listEpisodesForPicker,
  listPatients,
} from "@/lib/clinical/records";
import { createRecordAction } from "./actions";
import { PatientEpisodeFields } from "./patient-episode-fields";

export default async function NewRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; patientId?: string; episodeId?: string }>;
}) {
  const ctx = await requireRequestContext();
  // Authoring is owner/therapist only; admins can read but not create.
  if (!can(ctx.role, "clinical_records:author")) redirect("/clinical");

  const [patients, templates, episodes] = await Promise.all([
    listPatients(ctx),
    listActiveTemplates(ctx),
    listEpisodesForPicker(ctx),
  ]);
  // Prefill when arriving from an episode ("+ New record in this episode").
  const { m, patientId, episodeId } = await searchParams;

  return (
    <section className="max-w-xl space-y-4">
      <h2 className="text-base font-semibold">{s["clinical.newTitle"]}</h2>
      {m === "err" && <p className="text-sm text-error">{s["clinical.error"]}</p>}

      <form action={createRecordAction} className="space-y-3">
        {/* W5-04: the Episódio options are scoped client-side to the selected
            patient. The Modelo picker below passes through as children so its
            markup and the field sequence stay untouched (Batch 4 territory). */}
        <PatientEpisodeFields
          patients={patients}
          episodes={episodes}
          defaultPatientId={patientId}
          defaultEpisodeId={episodeId}
        >
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
        </PatientEpisodeFields>

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
