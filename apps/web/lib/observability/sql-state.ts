/**
 * The SQLSTATE of a failed write, and nothing else from the error.
 *
 * ==========================================================================
 * NOT THE MESSAGE, NOT THE DETAIL
 * ==========================================================================
 * Only the SQLSTATE is returned. A driver error and a Postgres error both carry
 * free-form text in fields a caller must not hand on, and rule 7 allows a log
 * line ids and classifications and nothing else. Five characters are enough for
 * an operator to find the class of failure, and they cannot hold a value.
 *
 * The `cause` walk is there because a driver error is routinely wrapped once
 * before it reaches a caller, and a wrapper with no `code` of its own would
 * otherwise turn every real SQLSTATE into "unknown".
 *
 * ==========================================================================
 * FIVE CHARACTERS THAT DO NOT BEGIN WITH `E`, AND THAT IS WHAT KEEPS NODE OUT
 * ==========================================================================
 * A Node errno is five characters of `[0-9A-Z]` too - EPIPE, EPERM, EBUSY,
 * EINTR, EBADF, ELOOP, ENXIO, EROFS, EXDEV, ETIME, EIDRM, E2BIG - so the shape
 * alone does not separate the two sets. The leading `E` does.
 *
 * THE SEPARATOR IS THE LEADING `E`, NOT A LEADING DIGIT. PostgreSQL's Appendix
 * A defines classes `F0`, `HV`, `P0` and `XX` as well as the numeric ones, so a
 * leading-digit test would drop real codes - `P0001`, which is what every
 * `RAISE EXCEPTION` with no ERRCODE carries; `P0002`, which
 * `packages/db/migrations/0005_patient_merge_multilocation.sql` raises by its
 * condition name and `lib/patients/actions.ts` branches on; `XX000`; every
 * `HV*`. No PostgreSQL class begins with `E`, and every Node errno does, so
 * excluding a leading `E` separates the two sets exactly and loses nothing.
 *
 * A wrongly labelled code is not a leak, but it sends an operator looking up a
 * Postgres class that does not exist while the real fault was a socket - and a
 * real code reported as `unknown` costs the diagnosis this helper exists for.
 *
 * ==========================================================================
 * THE SECOND COPY, DELIBERATELY
 * ==========================================================================
 * The same function, written for the same reason, is private to
 * apps/api/app/api/v1/booking/guest/route.ts:149-155. That copy stays: apps/web
 * and apps/api cannot import each other, and promoting a five-line predicate
 * into a shared package is a wider change than the ticket that needed it.
 */
export function sqlStateOf(e: unknown): string {
  const code = (x: unknown): unknown =>
    typeof x === "object" && x !== null && "code" in x ? (x as { code: unknown }).code : undefined;
  const cause =
    typeof e === "object" && e !== null && "cause" in e
      ? (e as { cause: unknown }).cause
      : undefined;
  const found = code(e) ?? code(cause);
  return typeof found === "string" && /^(?!E)[0-9A-Z]{5}$/.test(found) ? found : "unknown";
}
