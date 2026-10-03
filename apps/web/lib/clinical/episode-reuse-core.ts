/**
 * EPI-01b (strategy ruling R31, Q7): WHICH EPISODE "+ Avaliação" ON AN IMPORTED
 * GROUP FILES IN.
 *
 * The ruling: it "reuses the patient's open app episode of that specialty and
 * creates one only when none exists". PURE: no database, no server import, so
 * each word of that sentence is a unit-tested statement. `episodes.ts`
 * (`findOpenEpisodeOfSpecialty`) reads the rows inside the writer's transaction;
 * this file decides.
 *
 * AN EPISODE IS REUSED ONLY WHEN ALL OF THESE HOLD:
 *   - it is in the caller's TENANT and it is THIS PATIENT'S. The read already
 *     asks both; they are compared again here so the answer does not rest on a
 *     WHERE clause alone (the same reason `assertEpisodeIsThePatients` compares
 *     the tenant it read);
 *   - it is OPEN: `clinical_episodes.status = 'open'` (schema.ts `episode_status`,
 *     "open" | "closed"), the same test the guard's `requireOpen` and the
 *     /clinical/new picker use. A closed episode is never reopened or written to;
 *   - it is an APP episode: the import ledger does not name it. That ledger row
 *     is the one fact that says "imported" (ficha-groups.ts); a closed status or
 *     a specialty title is not;
 *   - its title names THE SAME specialty (`episodeSpecialtyOf`, episode-title.ts).
 *
 * MORE THAN ONE (two were opened before this rule, or by two requests at once
 * before the lock in `findOpenEpisodeOfSpecialty`): THE MOST RECENTLY OPENED,
 * by `opened_at`; on a tie, the smallest id, so the answer never depends on the
 * order the rows arrived in. Most recent, because it is the one the therapist
 * last started work in, it is the first group the Registos tab draws, and it is
 * the order the /clinical/new picker already lists episodes in. The others are
 * left exactly as they are.
 *
 * Null means "none: open a new one".
 */
import { episodeSpecialtyOf, type EpisodeSpecialty } from "./episode-title";

export type ReuseCandidate = {
  id: string;
  tenantId: string;
  patientId: string;
  /** `clinical_episodes.status`. */
  status: string;
  title: string;
  openedAt: Date;
  /** True when the import ledger names this episode. */
  imported: boolean;
};

export function pickEpisodeToReuse(
  candidates: readonly ReuseCandidate[],
  want: { tenantId: string; patientId: string; specialty: EpisodeSpecialty },
): string | null {
  const fit = candidates.filter(
    (e) =>
      e.tenantId === want.tenantId &&
      e.patientId === want.patientId &&
      e.status === "open" &&
      !e.imported &&
      episodeSpecialtyOf(e.title) === want.specialty,
  );
  fit.sort((a, b) => {
    const byOpened = b.openedAt.getTime() - a.openedAt.getTime();
    if (byOpened !== 0) return byOpened;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return fit[0]?.id ?? null;
}
