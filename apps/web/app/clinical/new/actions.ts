"use server";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { createDraftRecord } from "@/lib/clinical/records";
import { isClinicalError } from "@/lib/clinical/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * THE record-creation action: the /clinical/new form, and (EPI-01b) "+ Avaliação"
 * on an episode group of the patient's Registos tab. One write path for both:
 * `createDraftRecord`, which asks the patient scope, holds the episode to the
 * same patient and tenant (Q9's app half), and audits.
 *
 * EPI-01b adds two optional fields, both posted by the Registos tab only:
 *   - `newEpisodeSpecialty`: "+ Avaliação" on an IMPORTED group (Q7). The
 *     registo is filed in a NEW open episode for that specialty, never in the
 *     imported one. createDraftRecord accepts only a word on its closed list.
 *   - `from=ficha`: a refusal lands back on that patient's Registos tab, with
 *     its message, instead of on an empty /clinical/new form. The patient id is
 *     put in the path only when it is a uuid; anything else falls back to
 *     /clinical/new, so no posted text reaches a redirect.
 *
 * A refusal of the episode has its own message (`episode_mismatch`: not this
 * patient's; `episode_closed`: a new registo goes only into an open episode);
 * every other clinical refusal keeps the generic one it had. Anything that is not a
 * ClinicalError (a ForbiddenError for a role that may not author) propagates to
 * the error boundary, as before.
 */
export async function createRecordAction(formData: FormData): Promise<void> {
  const ctx = await requireRequestContext();
  const patientId = String(formData.get("patientId") ?? "");
  const formTemplateId = String(formData.get("formTemplateId") ?? "");
  const episodeId = String(formData.get("episodeId") ?? "") || null;
  const newEpisodeSpecialty = String(formData.get("newEpisodeSpecialty") ?? "") || null;
  const fromFicha = formData.get("from") === "ficha" && UUID_RE.test(patientId);

  const back = fromFicha ? `/patients/${patientId}?tab=registos&m=` : "/clinical/new?m=";
  let target = `${back}${fromFicha ? "avaliacaoErr" : "err"}`;
  try {
    const { id } = await createDraftRecord(ctx, { patientId, formTemplateId, episodeId, newEpisodeSpecialty });
    target = `/clinical/${id}`;
  } catch (e) {
    if (!isClinicalError(e)) throw e;
    if (e.code === "episode_mismatch") target = `${back}episodeMismatch`;
    if (e.code === "episode_closed") target = `${back}episodeClosed`;
  }
  redirect(target);
}
