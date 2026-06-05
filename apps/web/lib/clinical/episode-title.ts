// Pure helpers for clinical episode titles.
//
// No DB and no `server-only` here so they're unit-testable in isolation (the
// vitest config only picks up lib/**/*.test.ts in a node env). The server-side
// create/read flow lives in episodes.ts and imports these.

const LISBON_TZ = "Europe/Lisbon";
const MAX_TITLE_LEN = 200;

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
