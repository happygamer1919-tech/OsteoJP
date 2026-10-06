/**
 * EPI-01b, piece 2: "+ Episódio" ON THE REGISTOS TAB. WHO MAY OPEN AN EPISODE,
 * AND WHEN THE SERVER ASKS FIRST.
 *
 * PURE: no database, no server import, so each rule is a unit-tested statement.
 * `episodes.ts` (`createEpisode`) reads the rows in the write's own transaction;
 * this file decides.
 *
 * WHO. A therapist, and no other role. The capability check, the patient scope
 * and the tenant are `createEpisode`'s; this is the role itself. The page asks
 * the same function before it draws the control, so the screen and the server
 * cannot disagree.
 *
 * WHEN THE SERVER ASKS FIRST. "+ Episódio" never closes, edits, merges or
 * removes an episode: it only opens one. When the patient already has an OPEN
 * app episode of the chosen specialty (the one "+ Avaliação" on an imported
 * group files in, ruling R31: the most recently opened), a second one is opened
 * only after the therapist has been shown that episode and has confirmed. The
 * confirmation NAMES THE EPISODE THAT WAS SHOWN, by id:
 *   - none open: open one;
 *   - one open, no confirmation: open nothing, answer with that episode;
 *   - one open, and the confirmation names it: open another;
 *   - one open, and the confirmation names a DIFFERENT episode (another was
 *     opened since the page was drawn): open nothing, answer with the current
 *     one, so what the therapist confirms is always what is true now.
 * Ids are compared in canonical form (`canonicalId`), as R31's choice does.
 */
import type { Role } from "@osteojp/auth";
import { canonicalId } from "./episode-reuse-core";

/** The one role that opens an episode with "+ Episódio". */
export function mayOpenEpisode(role: Role): boolean {
  return role === "therapist";
}

export type OpenEpisodeDecision =
  /** Open a new episode. */
  | { kind: "create" }
  /** Open nothing: this open episode of the specialty is shown first. */
  | { kind: "confirm"; episodeId: string };

export function decideOpenEpisode(
  /** The patient's open app episode of the specialty (R31's choice), or null. */
  openEpisodeId: string | null,
  /** The episode the therapist was shown and confirmed against, or null. */
  confirmedOpenEpisodeId: string | null | undefined,
): OpenEpisodeDecision {
  if (openEpisodeId === null) return { kind: "create" };
  if (
    typeof confirmedOpenEpisodeId === "string" &&
    canonicalId(confirmedOpenEpisodeId) === canonicalId(openEpisodeId)
  ) {
    return { kind: "create" };
  }
  return { kind: "confirm", episodeId: openEpisodeId };
}
