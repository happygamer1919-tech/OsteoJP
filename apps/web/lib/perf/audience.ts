import "server-only";
import type { RequestContext } from "@/lib/auth/context";

/**
 * WHO MAY SEE A TIMING BREAKDOWN. One definition, imported by every page that
 * renders the panel, so a second surface cannot come to a different answer.
 *
 * `admin` AND `owner`, and nobody else. The card is about what the OWNER waited
 * for, and he signs in as an owner; `admin` is included because the reported
 * instance is an ADMIN principal and SR-24 requires the measurement be taken as
 * one. Reception and therapists are excluded - not because the numbers are
 * secret, but because an instrument on a screen somebody uses all day is a
 * change to that screen, and this card is explicitly not allowed to change what
 * anybody's page does.
 *
 * IT IS A FUNCTION OF THE ROLE ALONE and never of an environment variable. A
 * flag would make the answer differ between production and everywhere else,
 * which is exactly where a measurement must NOT differ - the whole point is to
 * read the same instrument on the machine that was slow.
 */
export function mayReadTimings(ctx: Pick<RequestContext, "role">): boolean {
  return ctx.role === "admin" || ctx.role === "owner";
}

/**
 * ON REQUEST, NEVER BY DEFAULT. Owner ruling, 2026-09-19.
 *
 * The panel found what it was built to find and then stayed under the title of
 * four pages. It is HIDDEN, not deleted: the `perf` Playwright project reads its
 * numbers off the page, and the next slow page should be one URL parameter away
 * from a measurement rather than one rebuild away.
 *
 * `?medicao=1`, and nothing else. It is a URL parameter and not an environment
 * variable for the reason `mayReadTimings` gives: a flag would make the answer
 * differ between production and everywhere else, which is exactly where a
 * measurement must not differ. The parameter asks; it grants nothing.
 */
export function timingsRequested(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  const raw = searchParams.medicao;
  return (Array.isArray(raw) ? raw[0] : raw) === "1";
}

/**
 * The gate every measured page passes to `collectFor`: the ROLE AND the request.
 * When it is false no span store is opened and no panel element is created, so
 * nothing is serialised into the RSC payload - for a receptionist who typed the
 * parameter exactly as for an admin who did not.
 */
export function shouldMeasure(
  ctx: Pick<RequestContext, "role">,
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  return mayReadTimings(ctx) && timingsRequested(searchParams);
}
