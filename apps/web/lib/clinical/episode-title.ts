// Pure helpers for clinical episode titles.
//
// No DB and no `server-only` here so they're unit-testable in isolation (the
// vitest config only picks up lib/**/*.test.ts in a node env). The server-side
// create/read flow lives in episodes.ts and imports these.

const LISBON_TZ = "Europe/Lisbon";
const MAX_TITLE_LEN = 200;

/**
 * EPI-01b (S-1002-D P2.2, Q7): the specialties an imported group can be, and so
 * the only words "+ Avaliação" on an imported group may put in a NEW episode's
 * title. The importer titles every episode with the specialty its file is named
 * for (`Episodios_Osteopatia.csv`, `Episodios_Fisioterapia.csv`; fisiozero.ts
 * `specialtyFromFileName`), and production holds those two and nothing else.
 *
 * A CLOSED LIST, ON PURPOSE. `clinical_episodes` is readable by every staff
 * login of the tenant until 0102 narrows it, so an episode title must never
 * carry clinical text (design note, section 2). The new title is built on the
 * server from one of these words and the date; a posted word that is not on the
 * list files nothing. A group whose label is not on it gets no button.
 */
export const EPISODE_SPECIALTIES = Object.freeze(["Osteopatia", "Fisioterapia"] as const);

export type EpisodeSpecialty = (typeof EPISODE_SPECIALTIES)[number];

/** True only for an exact member of EPISODE_SPECIALTIES (no trimming, no case folding). */
export function isEpisodeSpecialty(value: unknown): value is EpisodeSpecialty {
  return typeof value === "string" && (EPISODE_SPECIALTIES as readonly string[]).includes(value);
}

/** The date part `defaultEpisodeTitle` appends: " (dd/mm/yyyy)". */
const DATED_SUFFIX = /^ \(\d{2}\/\d{2}\/\d{4}\)$/;

/**
 * EPI-01b (strategy ruling R31, Q7): WHICH SPECIALTY AN EPISODE'S TITLE NAMES.
 *
 * `clinical_episodes` has no specialty column: the title is the only place a
 * specialty is written. Two titles name one, and nothing else does:
 *   - the specialty word itself ("Osteopatia"): the comparison an imported
 *     group's label already goes through (`isEpisodeSpecialty`: exact, no
 *     trimming, no case folding);
 *   - the title "+ Avaliação" itself builds for a new episode,
 *     `defaultEpisodeTitle(<specialty>, <day>)`: "Osteopatia (03/10/2026)".
 * Anything else is null: "Episódio (03/10/2026)" (the "Novo episódio" default),
 * a free title that merely starts with the word, another case or spacing.
 * WHETHER the episode is an app episode, open, and this patient's is not this
 * function's question (see `pickEpisodeToReuse`, episode-reuse-core.ts).
 */
export function episodeSpecialtyOf(title: string | null | undefined): EpisodeSpecialty | null {
  if (typeof title !== "string") return null;
  for (const specialty of EPISODE_SPECIALTIES) {
    if (title === specialty) return specialty;
    if (title.startsWith(specialty) && DATED_SUFFIX.test(title.slice(specialty.length))) return specialty;
  }
  return null;
}

/** Trim and collapse whitespace, then clamp a title to a sane length. */
export function normalizeEpisodeTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LEN);
}

/**
 * Default title for a one-click "+ New Episode": "<word> (dd/mm/yyyy)" in the
 * clinic's Lisbon calendar day, e.g. "Episódio (08/06/2026)". `word` is the only
 * localized part (an i18n string passed in); the date uses a fixed dd/mm/yyyy so
 * the result is deterministic across ICU builds and locales. No em/en dashes —
 * the date is parenthesised instead.
 */
export function defaultEpisodeTitle(word: string, now: Date): string {
  // en-CA yields a stable ISO "yyyy-mm-dd"; reorder to dd/mm/yyyy.
  const iso = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: LISBON_TZ,
  }).format(now);
  const [y, m, d] = iso.split("-");
  return `${word} (${d}/${m}/${y})`;
}

/**
 * EPI-01b, piece 2: THE TITLE OF AN EPISODE OPENED BY "+ Episódio".
 *
 * The title is a specialty and a date, by ruling. Built here, on the server,
 * from a word on EPISODE_SPECIALTIES and the clinic's Lisbon calendar day, in
 * the shape "+ Avaliação" already builds (`defaultEpisodeTitle`): "Osteopatia
 * (05/10/2026)". Null for anything that is not exactly one of those words (no
 * trimming, no case folding, no other type), and the caller then opens nothing.
 * There is no other input: nothing a request carries reaches the title.
 */
export function specialtyEpisodeTitle(specialty: unknown, now: Date): string | null {
  if (!isEpisodeSpecialty(specialty)) return null;
  return defaultEpisodeTitle(specialty, now);
}
