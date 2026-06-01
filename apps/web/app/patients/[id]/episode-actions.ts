"use server";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@osteojp/auth";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { createEpisode } from "@/lib/clinical/episodes";
import { defaultEpisodeTitle } from "@/lib/clinical/episode-title";
import { isClinicalError } from "@/lib/clinical/errors";

/**
 * Start a new clinical episode for a patient and land on it. One click: an
 * optional title may be supplied, otherwise a dated default is used. Auth is
 * enforced in createEpisode (authoring only); the button is also hidden from
 * non-authors, and we fail closed here for direct POSTs.
 */
export async function createEpisodeAction(formData: FormData): Promise<void> {
  const ctx = await requireRequestContext();
  const patientId = String(formData.get("patientId") ?? "");
  const titleRaw = String(formData.get("title") ?? "");
  const title =
    titleRaw.trim() ||
    defaultEpisodeTitle(s["clinical.episodeDefaultName"], new Date());

  let target = `/patients/${patientId}?m=episodeErr`;
  try {
    const { id } = await createEpisode(ctx, { patientId, title });
    target = `/clinical/episodes/${id}`;
  } catch (e) {
    // Denied (e.g. reception POSTing directly) or invalid input: bounce back to
    // the profile with a flag. Anything unexpected propagates to the boundary.
    if (!(e instanceof ForbiddenError) && !isClinicalError(e)) throw e;
  }
  redirect(target);
}
