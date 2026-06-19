// tools/fisiozero-extractor/src/html.ts
//
// Dependency-free HTML scraping helpers. We extract href ATTRIBUTES only (not a
// full DOM): attachment links and episode-detail links are discovered by pattern,
// resolved to absolute URLs, and de-duplicated. The recon's hard rule — hashed
// attachment URLs and episode-detail ids are NOT derivable and MUST be scraped,
// never guessed — is enforced by only ever returning links that physically
// appear in the page.
//
// Login-redirect and "patient not found" detection use conservative, CONFIGURABLE
// markers. Defaults are best-effort; the gated 8-patient run calibrates them
// (docs/QUESTIONS.md 2026-06-18, absent-detection note).

import { resolveHref } from "./urls";

/** Match every `href="..."` / `href='...'` value in document order. */
const HREF_RE = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Extract all raw href values from an HTML string, in document order. */
export function extractHrefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(HREF_RE)) {
    const value = m[1] ?? m[2];
    if (value && value.trim()) out.push(value.trim());
  }
  return out;
}

/**
 * Match inline onclick navigation in both quote combinations:
 *   onclick="...location.href='URL'..."  (double-quoted attr, single-quoted target)
 *   onclick='...location.href="URL"...'  (single-quoted attr, double-quoted target)
 * The `i` flag makes this match onClick, ONCLICK, etc.
 */
const ONCLICK_SQ = /onclick\s*=\s*"[^"]*?location\.href\s*=\s*'([^']+)'[^"]*?"/gi;
const ONCLICK_DQ = /onclick\s*=\s*'[^']*?location\.href\s*=\s*"([^"]+)"[^']*?'/gi;

/**
 * Extract URL strings from onclick="...location.href='URL'..." handlers and
 * the inverted-quote variant. Fisiozero episode rows use href="#" with the
 * real navigation target in an inline onclick; href-only scraping misses them.
 */
export function extractOnclickTargets(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(ONCLICK_SQ)) { if (m[1]) out.push(m[1]); }
  for (const m of html.matchAll(ONCLICK_DQ)) { if (m[1]) out.push(m[1]); }
  return out;
}

/**
 * Default path fragments that mark a Fisiozero attachment URL (recon: hashed
 * statics under the "user_rgpd_files/" folder and other "user_" folders).
 * Configurable so the gated run can widen them without code changes.
 */
export const DEFAULT_ATTACHMENT_PATTERNS = ["user_rgpd_files/", "user_"];

/**
 * Default token that marks an episode-detail link. Matched as a whole op= token
 * (must be followed by `&`, `#`, or end of string) so `op=r6` never matches
 * `op=r60` or similar. Real episode rows use onclick="location.href='?op=r6&i=...'".
 */
export const DEFAULT_EPISODE_PATTERNS = ["op=r6"];

function matchesAny(href: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => href.includes(p));
}

/**
 * Match each pattern as a whole op= token: must be followed by `&`, `#`, or
 * end of string. Prevents `op=r6` from matching `op=r60` etc.
 */
function matchesOpToken(href: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => new RegExp(p + "(?:[&#]|$)").test(href));
}

function uniqueResolved(
  baseUrl: string,
  hrefs: readonly string[],
  patterns: readonly string[],
  matcher: (href: string, patterns: readonly string[]) => boolean = matchesAny,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of hrefs) {
    if (href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    if (!matcher(href, patterns)) continue;
    let abs: string;
    try {
      abs = resolveHref(baseUrl, href);
    } catch {
      continue; // unparseable href — skip, don't crash the patient
    }
    if (!seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  return out;
}

/** Absolute, de-duplicated attachment URLs found in the HTML. */
export function extractAttachmentUrls(
  baseUrl: string,
  html: string,
  patterns: readonly string[] = DEFAULT_ATTACHMENT_PATTERNS,
): string[] {
  return uniqueResolved(baseUrl, extractHrefs(html), patterns);
}

/**
 * Absolute, de-duplicated episode-detail URLs found in a list page.
 *
 * Candidates are the union of href attributes AND onclick navigation targets,
 * because Fisiozero episode rows use `<a href="#">` with the real URL in an
 * inline onclick — href-only scraping returns the new-episode button instead.
 * Patterns are matched as whole op= tokens (see matchesOpToken).
 */
export function extractEpisodeUrls(
  baseUrl: string,
  html: string,
  patterns: readonly string[] = DEFAULT_EPISODE_PATTERNS,
): string[] {
  const candidates = [...extractHrefs(html), ...extractOnclickTargets(html)];
  return uniqueResolved(baseUrl, candidates, patterns, matchesOpToken);
}

/**
 * Default path fragment that marks a server-rendered episode PDF link.
 * Appears as a plain <a href> on both osteo_epi.html and avl.html list pages.
 */
export const DEFAULT_EPISODE_PDF_PATTERNS = ["export_pdf_osteopatia2.php"];

/** Absolute, de-duplicated episode PDF URLs found in a list page. */
export function extractEpisodePdfUrls(
  baseUrl: string,
  html: string,
  patterns: readonly string[] = DEFAULT_EPISODE_PDF_PATTERNS,
): string[] {
  return uniqueResolved(baseUrl, extractHrefs(html), patterns);
}

/** Default markers that indicate a response is actually the login screen. */
export const DEFAULT_LOGIN_URL_MARKERS = ["op=login", "/login", "login.php"];
export const DEFAULT_LOGIN_BODY_MARKERS = ['name="password"', 'name="pass"', "op=login"];

/**
 * True if a response looks like the login screen — i.e. the session expired and
 * the app bounced us. The caller treats this as fatal: stop and ask Ivan to
 * recapture storageState. Never retried, never logged with cookie values.
 */
export function looksLikeLogin(
  finalUrl: string,
  body: string,
  urlMarkers: readonly string[] = DEFAULT_LOGIN_URL_MARKERS,
  bodyMarkers: readonly string[] = DEFAULT_LOGIN_BODY_MARKERS,
): boolean {
  const url = finalUrl.toLowerCase();
  if (urlMarkers.some((m) => url.includes(m.toLowerCase()))) return true;
  return bodyMarkers.some((m) => body.includes(m));
}

/** Default markers that indicate a patient id is absent (deleted / not found). */
export const DEFAULT_NOT_FOUND_MARKERS = ["não encontrad", "nao encontrad", "not found", "registo inexistente"];

/**
 * Classify a ficha response as a present patient or an absent (gapped) id.
 * Absent ids are recorded and skipped, NOT treated as errors. Heuristic:
 * an explicit not-found marker, or a suspiciously short body, means absent.
 * `minBodyLength` and `markers` are configurable; calibrate on the gated run.
 */
export function isFichaAbsent(
  body: string,
  markers: readonly string[] = DEFAULT_NOT_FOUND_MARKERS,
  minBodyLength = 256,
): boolean {
  const lower = body.toLowerCase();
  if (markers.some((m) => lower.includes(m.toLowerCase()))) return true;
  return body.trim().length < minBodyLength;
}

/** Best-effort filename from a URL path (hashed statics keep their basename). */
export function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last && last.length > 0 ? decodeURIComponent(last) : "attachment";
  } catch {
    return "attachment";
  }
}
