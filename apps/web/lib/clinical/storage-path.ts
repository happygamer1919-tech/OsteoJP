/**
 * Storage object-path containment. Pure, and deliberately in a module of its
 * own with no `server-only` and no Supabase import.
 *
 * ==========================================================================
 * WHY IT DOES NOT LIVE IN storage.ts
 * ==========================================================================
 * Four suites stub `@/lib/clinical/storage` down to its bucket constant, to
 * keep `server-only` and the admin client out of a unit test. Had this
 * predicate lived there, every one of those stubs would have had to supply its
 * own version of it — and a stubbed containment check is a containment check
 * that passes everything. The rule that decides whether a caller may name an
 * object must not be mockable by a test that is about something else.
 *
 * ==========================================================================
 * WHY `startsWith` IS NOT CONTAINMENT
 * ==========================================================================
 * A confirmed path is stored verbatim and later spliced into a Storage URL and
 * handed to `fetch`, which NORMALISES it. A path that passes a prefix test
 * therefore need not still be inside that folder by the time it is signed:
 *
 *   `${tenant}/${record}/../migration/fisiozero/x.pdf`
 *        is fetched as `${tenant}/migration/fisiozero/x.pdf`
 *   `${tenant}/${record}/../../OTHER/migration/x.pdf`
 *        is fetched as `OTHER/migration/x.pdf`   — a different tenant
 *
 * Percent-encoded dots collapse the same way, so rejecting a literal `..`
 * would not be enough. Measured against `new Request(url).url` on 2026-09-20.
 *
 * So rather than enumerate the escapes, this asks for the shape the upload-URL
 * minters actually produce: the prefix, then EXACTLY ONE segment, that segment
 * containing neither a separator nor a percent. Both minters name their object
 * through `safeName`, which strips everything outside [A-Za-z0-9._-], so no
 * legitimate object name can contain either character.
 */

/** Is `path` exactly one object sitting directly inside `prefix`? */
export function isSingleObjectUnder(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix)) return false;
  const object = path.slice(prefix.length);
  if (object.length === 0) return false;
  // No separator: one segment, so no `..` can climb and no sub-folder is named.
  // No percent: the URL layer decodes before it resolves, so `%2e%2e` and `%2f`
  // would climb too. Neither character survives `safeName`.
  return !/[/%]/.test(object);
}

/**
 * Does `path` contain a segment that would climb when the URL layer resolves it?
 *
 * The DOWNLOAD counterpart of the rule above, and deliberately weaker, because
 * a download must keep serving paths the confirms never minted: the Fisiozero
 * importer writes `${tenant}/migration/fisiozero/<delivery file name>` through
 * `packages/db`, which is several segments deep and whose names this repo does
 * not control. So this asks only the question that matters — does any segment
 * climb — instead of demanding one segment, and it does not reject `%` outright
 * because an imported file name may legitimately contain one.
 *
 * It exists because rows written BEFORE the confirm-side rule landed are still
 * in the table, and because the importer is a second writer. A stored path is
 * not evidence that it was ever checked.
 */
export function hasTraversalSegment(path: string): boolean {
  // One decode pass, matching what the URL layer does before it resolves.
  // A malformed escape is itself reason enough to refuse.
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return true;
  }
  for (const candidate of [path, decoded]) {
    if (candidate.split("/").some((segment) => segment === "." || segment === "..")) {
      return true;
    }
  }
  return false;
}
