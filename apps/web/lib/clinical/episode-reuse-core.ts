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
 * IDS ARE COMPARED AS UUIDS, NOT AS TEXT. Postgres reads a uuid in either case
 * and prints it in lowercase, so the rows always carry lowercase ids, while an
 * id that came from a request can be in uppercase and still name the same
 * patient (the patient read accepts it). Compared as text it would match no
 * episode, and a second one would be opened. Every id is therefore put in its
 * canonical form (`canonicalId`) before it is compared here or put in the lock
 * key (episodes.ts `specialtyEpisodeLock`).
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

/** A uuid's canonical text: lowercase, the form Postgres prints. */
export function canonicalId(id: string): string {
  return id.toLowerCase();
}

export function pickEpisodeToReuse(
  candidates: readonly ReuseCandidate[],
  want: { tenantId: string; patientId: string; specialty: EpisodeSpecialty },
): string | null {
  const [tenantId, patientId] = [canonicalId(want.tenantId), canonicalId(want.patientId)];
  const fit = candidates.filter(
    (e) =>
      canonicalId(e.tenantId) === tenantId &&
      canonicalId(e.patientId) === patientId &&
      e.status === "open" &&
      !e.imported &&
      episodeSpecialtyOf(e.title) === want.specialty,
  );
  fit.sort((a, b) => {
    const byOpened = b.openedAt.getTime() - a.openedAt.getTime();
    if (byOpened !== 0) return byOpened;
    const [x, y] = [canonicalId(a.id), canonicalId(b.id)];
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return fit[0]?.id ?? null;
}
