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
