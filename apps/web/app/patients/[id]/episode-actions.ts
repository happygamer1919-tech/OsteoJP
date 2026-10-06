"use server";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { createEpisode } from "@/lib/clinical/episodes";
import { isClinicalError } from "@/lib/clinical/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * EPI-01b, piece 2: "+ Episódio" on the patient's Registos tab. THE ONE WAY A
 * SCREEN OPENS AN EPISODE BY ITSELF ("+ Avaliação" on an imported group opens
 * one with its registo, through the same insert).
 *
 * THREE FIELDS ARE READ, AND NO OTHER:
 *   - `patientId`;
 *   - `specialty`: a word on the closed list. The title is a specialty and a
 *     date, by ruling, and `createEpisode` builds it on the server;
 *   - `confirmOpenEpisodeId`: posted only by the confirmation step, and names
 *     the open episode the therapist was shown.
 * Anything else a request carries (a title, a note, any text) is not read.
 *
 * WHO is `createEpisode`'s question, on the server: a therapist, for a patient
 * they may write registos for, in their tenant. The page hides the control from
 * everyone else; a direct POST is refused there and lands on the error flag.
 *
 * WHERE IT LANDS, always on that patient's Registos tab:
 *   - opened: `episodio=<id>`, and the tab draws the new group, focused, with
 *     "+ Avaliação" at hand;
 *   - an open episode of that specialty exists and was not confirmed against:
 *     `m=episodioAberto&esp=<specialty>`, and the tab shows that episode and
 *     asks. Nothing was written;
 *   - refused or invalid: `m=episodeErr`. Nothing was written.
 * The patient id reaches the path only when it is a uuid, and the specialty
 * reaches the query only after `createEpisode` accepted it, so no posted text
 * reaches a redirect.
 */
export async function createEpisodeAction(formData: FormData): Promise<void> {
  const ctx = await requireRequestContext();
  const patientId = String(formData.get("patientId") ?? "");
  const specialty = String(formData.get("specialty") ?? "");
  const confirmedOpenEpisodeId = String(formData.get("confirmOpenEpisodeId") ?? "") || null;

  const back = UUID_RE.test(patientId) ? `/patients/${patientId.toLowerCase()}?tab=registos&` : "/patients?";
  let target = `${back}m=episodeErr`;
  try {
    const result = await createEpisode(ctx, { patientId, specialty, confirmedOpenEpisodeId });
    target =
      result.kind === "created"
        ? `${back}episodio=${result.id}`
        : `${back}m=episodioAberto&esp=${encodeURIComponent(specialty)}`;
  } catch (e) {
    // Refused (a role that may not open an episode, a patient outside the
    // caller's reach) or invalid input: back to the tab with a flag. Anything
    // unexpected propagates to the boundary.
    if (!(e instanceof ForbiddenError) && !isClinicalError(e)) throw e;
  }
  redirect(target);
}
