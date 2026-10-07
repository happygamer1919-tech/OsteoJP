/**
 * EPI-01a: the Registos tab groups a patient's registos the way the Fisiozero
 * ficha did, by episode. PURE: no database, no server import, so the grouping
 * and excerpt rules are unit-tested as statements. `ficha-groups.ts` reads the
 * rows; this file decides the groups.
 *
 * ==========================================================================
 * THE GROUPING RULE (strategy's ruling Q1 (a), and the M3 defaults Q2 to Q10)
 * ==========================================================================
 * The Fisiozero delivery carried no episode id, so the importer made ONE closed
 * episode per evaluation, titled only "Osteopatia" or "Fisioterapia"
 * (production, 2026-10-02: 5,632 imported episodes, 5,603 holding exactly one
 * registo). Grouping by episode id would show every imported evaluation as its
 * own "episode". So:
 *   - an IMPORTED registo (its episode is one the import ledger names) joins ONE
 *     group per specialty per patient, keyed by the episode title (Q1 (a));
 *   - an APP-CREATED registo with an episode joins that episode's group;
 *   - a registo with NO episode joins one "Sem episódio" group, so every registo
 *     the viewer can read is reachable (production: 95 of 173 app registos);
 *   - a later version ("Nova versão") copies its record's episode, so it lands
 *     in the same group as the record it supersedes: history is never hidden.
 * Inside a group the evaluations run oldest to newest by the CLINICAL date
 * (`created_at`, which for an imported row is the evaluation date), never
 * `updated_at`, which for every imported row is the import time (Q4). Groups run
 * newest first by their most recent evaluation; the "Sem episódio" group is
 * last. A group's header is its first evaluation's date and that evaluation's
 * complaint excerpt, with the specialty or episode title as a label (Q2): the
 * episode title is never clinical text (the clinical_episodes policy is
 * tenant-wide until 0102), so the complaint is read from the registo.
 */
import { isEpisodeSpecialty, type EpisodeSpecialty } from "./episode-title";
import { isEpisodeExportable } from "./report/episode-export-core";

/** The record_status axis, as the list shows it. */
export type FichaRecordStatus = "draft" | "locked" | "signed";

/** One registo the viewer may read, with its episode and its excerpt fields. */
export type FichaRecord = {
  id: string;
  status: FichaRecordStatus;
  version: number;
  supersedesId: string | null;
  /** ISO instant: the clinical date (an imported row's evaluation date). */
  createdAt: string;
  updatedAt: string;
  annulled: boolean;
  /** The template's pt-PT title, or null (every imported row has none). */
  templateTitle: string | null;
  episodeId: string | null;
  /** The episode's own title: a specialty or "Episódio (date)"; never clinical text. */
  episodeTitle: string | null;
  /** True when the import ledger names this registo's episode. */
  episodeImported: boolean;
  /** The one-line complaint excerpt (see `excerpt`), or null. */
  excerpt: string | null;
};

export type FichaGroupKind = "imported" | "episode" | "none";

export type FichaGroup = {
  /** Stable key: `imported:<specialty>`, `episode:<id>` or `none`. */
  key: string;
  kind: FichaGroupKind;
  /** The specialty (imported) or the episode title (app); null for "none". */
  label: string | null;
  imported: boolean;
  /** The app episode this group is (kind "episode"); null for the other kinds. */
  episodeId: string | null;
  /** Oldest to newest by createdAt. Empty only for an open episode with no registo yet. */
  records: FichaRecord[];
  /**
   * How many EVALUATIONS the group holds, versions excluded (strategy S-1002-D
   * P2.1): a record that supersedes another record in this group is that
   * record's later version, not a new evaluation. A version whose original is
   * not in the list still counts once, so nothing the viewer sees goes uncounted.
   */
  evaluations: number;
  /** The first evaluation's date (ISO); for an episode with no registo yet, the day it was opened. */
  firstAt: string;
  /** The most recent evaluation's date (ISO), which orders the groups; with no registo yet, the day it was opened. */
  lastAt: string;
  /** The first evaluation's excerpt (Q2), or null. */
  excerpt: string | null;
};

/**
 * The keys an excerpt is read from, in order (Q3): the app's Osteopatia v5 and
 * Fisioterapia v4 complaint fields, then the importer's vendor columns
 * (Fisioterapia `queixas`, Osteopatia `motivos`), then a diagnosis.
 */
export const EXCERPT_KEYS = Object.freeze([
  "consultation_reason",
  "main_complaints",
  "queixas",
  "motivos",
  "diagnostico",
] as const);

/** The longest excerpt, in characters, before the ellipsis. */
export const EXCERPT_MAX = 120;

/**
 * One line of a registo's complaint: the first non-empty value among
 * EXCERPT_KEYS, whitespace collapsed to single spaces, cut at EXCERPT_MAX
 * characters with an ellipsis. A non-string value (a number, a list) is read as
 * its text. Null when none of the keys holds anything.
 */
export function excerpt(fields: Readonly<Record<string, unknown>> | null | undefined): string | null {
  if (!fields) return null;
  for (const key of EXCERPT_KEYS) {
    const raw = fields[key];
    if (raw === null || raw === undefined) continue;
    const text = (typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(", ") : String(raw))
      .replace(/\s+/g, " ")
      .trim();
    if (text === "") continue;
    return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX).trimEnd()}…` : text;
  }
  return null;
}

const byCreatedThenVersion = (a: FichaRecord, b: FichaRecord): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.version - b.version;

/** The group a registo belongs to. */
function groupKeyOf(r: FichaRecord): { key: string; kind: FichaGroupKind; label: string | null } {
  if (r.episodeId && r.episodeImported) {
    const specialty = r.episodeTitle?.trim() || "—";
    return { key: `imported:${specialty}`, kind: "imported", label: specialty };
  }
  if (r.episodeId) return { key: `episode:${r.episodeId}`, kind: "episode", label: r.episodeTitle };
  return { key: "none", kind: "none", label: null };
}

/**
 * EPI-01b, piece 2: an OPEN APP EPISODE WITH NO REGISTO YET, which "+ Episódio"
 * has just opened. The groups are drawn from registos, so without this it would
 * not be on the tab until its first evaluation is filed.
 */
export type FichaEmptyEpisode = {
  id: string;
  /** The episode's title: a specialty and a date. */
  title: string;
  /** ISO instant the episode was opened. */
  openedAt: string;
};

/**
 * The groups for a patient's registos (see the rule above). Every input record
 * appears in exactly one group; no record is dropped or duplicated.
 *
 * `emptyEpisodes` (EPI-01b, piece 2) adds one group, with no registos, per open
 * app episode that has none yet. An episode that already has a group from its
 * registos is never given a second one. It is dated by the day it was opened,
 * so a new episode is the first group on the tab.
 */
export function groupForFicha(
  records: readonly FichaRecord[],
  emptyEpisodes: readonly FichaEmptyEpisode[] = [],
): FichaGroup[] {
  const groups = new Map<string, { kind: FichaGroupKind; label: string | null; records: FichaRecord[] }>();
  for (const r of records) {
    const { key, kind, label } = groupKeyOf(r);
    const g = groups.get(key);
    if (g) g.records.push(r);
    else groups.set(key, { kind, label, records: [r] });
  }
  const out: FichaGroup[] = [];
  for (const [key, g] of groups) {
    const sorted = [...g.records].sort(byCreatedThenVersion);
    const ids = new Set(sorted.map((r) => r.id));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    out.push({
      key,
      kind: g.kind,
      label: g.label,
      imported: g.kind === "imported",
      episodeId: g.kind === "episode" ? first.episodeId : null,
      records: sorted,
      evaluations: sorted.filter((r) => !(r.supersedesId !== null && ids.has(r.supersedesId))).length,
      firstAt: first.createdAt,
      lastAt: last.createdAt,
      excerpt: first.excerpt,
    });
  }
  for (const e of emptyEpisodes) {
    const key = `episode:${e.id}`;
    // Already a group: from its registos, or listed twice.
    if (out.some((g) => g.key === key)) continue;
    out.push({
      key,
      kind: "episode",
      label: e.title,
      imported: false,
      episodeId: e.id,
      records: [],
      evaluations: 0,
      firstAt: e.openedAt,
      lastAt: e.openedAt,
      excerpt: null,
    });
  }
  return out.sort((a, b) => {
    if (a.kind === "none" && b.kind !== "none") return 1;
    if (b.kind === "none" && a.kind !== "none") return -1;
    if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/**
 * EPI-01b (S-1002-D P2.2, piece 1): WHAT "+ Avaliação" ON A GROUP FILES.
 *
 * The design note's section 1 and strategy's Q7 default, as a statement:
 *   - an APP episode group: the new registo is filed in THAT episode;
 *   - an IMPORTED group: the group's SPECIALTY, and nothing else. The server
 *     files the registo in the patient's open app episode of that specialty, or
 *     in a NEW open episode when there is none (ruling R31; records.ts
 *     `createDraftRecord`, episodes.ts `findOpenEpisodeOfSpecialty`), never in
 *     the imported episodes (they are closed, their registos locked). Which of
 *     the two is NOT decided here or on the page: a page can be stale, so no
 *     episode id is carried, and the kind keeps piece 1's name, `newEpisode`.
 *     Only a specialty on EPISODE_SPECIALTIES qualifies, because the server
 *     builds a new title from it and accepts nothing else; any other label gets
 *     no button;
 *   - the "Sem episódio" group: NO button. The design note is silent on it; this
 *     is a judgment, not a ruling (the PR says so). "Nova ficha" at the top of
 *     the tab still files a registo with no episode, as before.
 * Null means the group shows no "+ Avaliação". WHO sees it (an author, on a
 * patient they may write for) is the page's gate, not this function's.
 */
export type AddEvaluationTarget =
  | { kind: "episode"; episodeId: string }
  | { kind: "newEpisode"; specialty: EpisodeSpecialty };

export function addEvaluationTarget(group: FichaGroup): AddEvaluationTarget | null {
  if (group.kind === "episode") {
    // The group's own episode: also when it holds no registo yet ("+ Episódio").
    return group.episodeId ? { kind: "episode", episodeId: group.episodeId } : null;
  }
  if (group.kind === "imported" && isEpisodeSpecialty(group.label)) {
    return { kind: "newEpisode", specialty: group.label };
  }
  return null;
}

/**
 * EPI-01b, piece 3: WHETHER A GROUP SHOWS "PDF do episódio", AND WHAT IT SAYS.
 *
 *   - an APP episode group (`kind: "episode"`) holding at least one registo the
 *     episode's file would include (episode-export-core.ts `isEpisodeExportable`:
 *     finalized, not annulled): the button, for that episode;
 *   - an episode with no registo, or with drafts only: NO button. There is
 *     nothing to export, and the server would produce nothing;
 *   - an IMPORTED group: NO button. It is one group per specialty over many
 *     imported episodes, not an episode;
 *   - the "Sem episódio" group: NO button. It is not an episode.
 * `partial` is true when the group shows a registo the file leaves out (a
 * draft, or an annulled one while "Mostrar anulados" is on), so the tab can say
 * so beside the button.
 *
 * The list does not carry the AI review axis, so it is read as "not under
 * review", as the per-record button's own gate reads it (record-status.ts
 * `canDownloadReport`); the server asks the full rule again for every registo.
 * WHO sees the button (a reader of clinical records) is the page's gate.
 */
export type EpisodePdfTarget = { episodeId: string; partial: boolean };

export function episodePdfTarget(group: FichaGroup): EpisodePdfTarget | null {
  if (group.kind !== "episode" || !group.episodeId) return null;
  const included = group.records.filter((r) =>
    isEpisodeExportable({ status: r.status, aiReviewState: null, annulled: r.annulled }),
  ).length;
  if (included === 0) return null;
  return { episodeId: group.episodeId, partial: included < group.records.length };
}
