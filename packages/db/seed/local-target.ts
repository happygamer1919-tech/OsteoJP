/**
 * POSITIVE IDENTIFICATION OF A LOCAL TARGET. Strategy ruling, PERF-02 Task 1.
 *
 * ==========================================================================
 * WHY A BLOCKLIST IS THE WRONG SHAPE HERE, AND THIS REPOSITORY HAS THE PROOF
 * ==========================================================================
 * `seed-guard.ts` answers "is this one of the refs we know to be production?"
 * That question is only as good as the list, and the list is only as good as
 * the last person who remembered to edit it. Three recorded failures, all of
 * them in this repository:
 *
 *   1. `PROD_REFS` sat EMPTY for months while its own comment claimed it was
 *      enforced (SEC-seed-guard-prod-blocklist).
 *   2. `scripts/perf-seed-loadtest.mjs` guards `jaxmkwoxjcgzkwxgbayx` - the
 *      RETIRED project - and therefore does not abort on
 *      `dfotoodqvmjhbdcxyaxf`, the live clinic. Its header still advertises
 *      the guard as working (PERF-08).
 *   3. `assert-not-prod.ts` prints "This proves the target is NOT production."
 *      It does not. It proves no ref ON THE LIST is present.
 *
 * Every one of those fails OPEN. A blocklist's default answer for an unknown
 * target is "allowed", and a NEW production project - the next one anybody
 * provisions - is an unknown target on the day it is created.
 *
 * PORTAL-REHYDRATE section 1.3 names the shape exactly: "a one-line
 * convenience that maps an unknown or failed case onto a known,
 * harmless-looking one WILL be read as the harmless one." An unrecognised host
 * is an unknown case. A blocklist calls it safe.
 *
 * ==========================================================================
 * SO THE QUESTION IS INVERTED
 * ==========================================================================
 * Not "is this denied?" but "is this AFFIRMATIVELY one of the handful of hosts
 * that cannot be production?" Everything else is refused, including hosts
 * nobody has heard of, including a brand-new production project, including a
 * URL this file cannot parse at all.
 *
 * The allowlist can be short because the truth is short. `docs/QUESTIONS.md`
 * line 518 records the owner's own verification that the Supabase org has ONE
 * project besides production, that `ufbkzbyghvxtosyrkgjq` "DOES NOT EXIST and
 * never did", and `seed-guard.ts` line 26 records that the remaining one is
 * retired. **There is no remote database left that a dev seed may write to.**
 * `.github/workflows/db-tests.yml` line 54 already runs the whole DB-gated
 * suite against `127.0.0.1:54322`. Local is not a restriction being imposed
 * here; it is the only target that still exists.
 *
 * ==========================================================================
 * EXACT HOST EQUALITY, NEVER `includes()`
 * ==========================================================================
 * `url.includes("127.0.0.1")` is an allowlist with the blocklist's disease.
 * `127.0.0.1.attacker.example.com` contains it. So does a password that happens
 * to be `127.0.0.1`. The host is PARSED and compared whole, and the tests drive
 * both of those strings through to prove the naive predicate would have passed
 * them.
 */

/**
 * The only hosts that cannot be a hosted database.
 *
 * `host.docker.internal` is here because the DB-gated suites and the perf
 * harness both run Postgres in a container; from inside another container that
 * is how the host is addressed. It resolves only to the local machine.
 */
export const ALLOWED_LOCAL_HOSTS: readonly string[] = Object.freeze([
  "127.0.0.1",
  "localhost",
  "::1",
  "host.docker.internal",
]);

/**
 * The host a connection string points at, lowercased and unbracketed, or null.
 *
 * TWO PARSERS, AND THE SECOND IS NOT DECORATION. `new URL()` handles every
 * well-formed case including IPv6 and non-http schemes. It THROWS on a password
 * holding an unescaped `@` or `/`, which real passwords do. The fallback reads
 * the authority between `://` and the first `/`, splitting on the LAST `@` so a
 * password containing one cannot be mistaken for the host.
 *
 * Returns null when neither can find a host. The caller must treat null as a
 * REFUSAL, never as "probably fine" - that is the whole point of this module.
 */
export function parseTargetHost(url: string): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;

  const unbracket = (h: string) =>
    h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;

  try {
    const host = new URL(url).hostname;
    if (host) return unbracket(host.toLowerCase());
  } catch {
    // fall through to the manual parse
  }

  const scheme = url.indexOf("://");
  if (scheme === -1) return null;
  const rest = url.slice(scheme + 3);
  const authority = rest.split("/")[0]?.split("?")[0] ?? "";
  if (authority === "") return null;
  const at = authority.lastIndexOf("@");
  const hostPort = at === -1 ? authority : authority.slice(at + 1);
  if (hostPort === "") return null;

  // IPv6 keeps its brackets until here precisely so the port split cannot cut
  // it at one of its own colons.
  const v6 = hostPort.match(/^\[([^\]]+)\]/);
  if (v6) return v6[1]!.toLowerCase();

  const host = hostPort.split(":")[0] ?? "";
  return host === "" ? null : host.toLowerCase();
}

export type TargetVerdict = {
  /** True ONLY on affirmative recognition. Never a default. */
  local: boolean;
  host: string | null;
  /** Operator-facing, and safe to print: it never contains the URL. */
  reason: string;
};

/**
 * Is this target affirmatively local?
 *
 * NEVER PRINTS OR RETURNS THE URL. A connection string carries a password;
 * standing rule 3. What comes back is a host and a verdict.
 */
export function describeTarget(url: string | undefined | null): TargetVerdict {
  if (url === undefined || url === null || url === "") {
    return { local: false, host: null, reason: "no connection string is set" };
  }
  const host = parseTargetHost(url);
  if (host === null) {
    return {
      local: false,
      host: null,
      reason: "no host could be parsed from the connection string",
    };
  }
  if (ALLOWED_LOCAL_HOSTS.includes(host)) {
    return { local: true, host, reason: `host "${host}" is an allowed local target` };
  }
  return {
    local: false,
    host,
    reason: `host "${host}" is not one of the allowed local targets`,
  };
}

/**
 * Refuse unless the target is affirmatively local. Exits 1; never returns on
 * refusal.
 *
 * `what` names the variable so the operator knows WHICH one is wrong when a
 * shell holds several.
 */
export function assertLocalTarget(
  url: string | undefined | null,
  what = "DATABASE_URL",
): string {
  const v = describeTarget(url);
  if (v.local) return url as string;

  console.error(
    `SAFETY: refusing to run. ${what} ${v.reason}.\n` +
      `Allowed local targets: ${ALLOWED_LOCAL_HOSTS.join(", ")}.\n` +
      "This guard identifies a permitted target POSITIVELY. It does not ask whether\n" +
      "the target is on a list of known-production refs, because an unlisted\n" +
      "production project would pass that question and this one refuses it.",
  );
  process.exit(1);
}
