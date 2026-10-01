// ===================================================================
// THE PRODUCTION TARGET, AND THE ONE CHECK BOTH PRODUCTION GUARDS RUN.
// PURE. IMPORTS NOTHING. OPENS NOTHING. PRINTS NOTHING.
// ===================================================================
// Two programs refuse to run anywhere but production, and both import
// checkProductionTarget() from here:
//   scripts/assert-production-target.mjs            the target guard every apply block runs
//   packages/db/scripts/read-applied-migrations.mjs the journal reader
// ONE COPY, because this repository has been burned by a duplicated safety rule
// going stale (scripts/import/prod-refs.mjs says how). A document that pins
// either program by sha256 pins this file too: it is part of what they run.
//
// ==========================================================================
// WHY IT EXISTS: INC-rehearsal-subagent-passed-the-reader-guard, 2026-09-30
// ==========================================================================
// A rehearsal subagent passed the reader's production-only guard on a local
// throwaway by putting the production ref into the URL as an application_name
// label. The reader tested the whole string for a substring. The target guard
// read the ref from the username and checked the port. Neither looked at where
// the connection goes. The lead's ruling the same day: "both halves (reader and
// assert-production-target) compare parsed host and database name".
//
// ==========================================================================
// WHAT "PARSED" HAS TO MEAN: THREE PARSERS READ THIS STRING
// ==========================================================================
// new URL() (this check), libpq (every psql in an apply block) and postgres.js
// (the reader). On ordinary connection strings they agree. On the inputs below
// they do not, and a check that reads one parser's answer while the connection
// uses another's is the incident again by a different road. So a string is
// accepted only when all of these hold, checked in this order:
//
//   control    No whitespace and no control character anywhere: the parsers
//              disagree about them (a tab in a username, a newline after a path).
//   scheme     It begins with exactly `postgres://` or `postgresql://`. libpq
//              reads any other string with no `=` in it as a DATABASE NAME on
//              its default host, the local socket, whatever new URL() reads as
//              the host. libpq's prefix test is case-sensitive; new URL() is not.
//   authority  It carries exactly one `@`, and the host and port written after
//              it are the ones new URL() read. libpq and postgres.js split the
//              user from the host at the FIRST `@`, new URL() at the LAST, and
//              libpq and postgres.js read a `,` in the host as a list of hosts
//              to try in order. Measured with postgres.js 3.4.9 on 2026-09-30,
//              reading its parsed options with no query run:
//              `postgres://u.<ref>:x@127.0.0.1:1,y@<host>:5432/postgres`
//              parses to <host> in new URL() and to ["127.0.0.1", "y@<host>"]
//              in postgres.js, which tries 127.0.0.1 first.
//   ref        The part of the username after its last `.` is the production
//              project ref. That is how Supabase's pooler names the project.
//   host       The host is the production session pooler, compared exactly
//              and without regard to letter case.
//   port       5432, the session pooler. drizzle-kit needs SESSION advisory
//              locks, and the transaction pooler on 6543 has none.
//   database   The text after the host is exactly `/postgres`, optionally
//              followed by a query, and there is no `#` anywhere. new URL()
//              drops a `#` fragment from the path; libpq does not.
//   query      No query key names a connection target: host, hostaddr, port,
//              dbname, database, user or service (postgres.js sends any key it
//              does not know, `database` included, as a startup parameter), compared after decoding and without
//              regard to case. libpq applies those OVER the URL's own parts, so
//              `...:5432/postgres?hostaddr=127.0.0.1` would check as production
//              and connect to 127.0.0.1. Any other key (sslmode,
//              application_name, ...) is allowed and never read.
//
// A QUERY STRING CAN NEVER SATISFY A CHECK. Every comparison reads a parsed
// part (username, host, port, path) or the raw text before the `?`, never the
// query. The `query` check only ever REFUSES.
//
// WHAT IT CANNOT SEE, SAID PLAINLY. libpq also reads PGHOSTADDR and PGSERVICE
// from the environment of the psql that runs after the guard, and either can
// send a connection somewhere the URL does not name. This check reads the
// connection string only.
//
// THE CONSTANTS. The ref is the one CLAUDE.md, the seeders' blocklist
// (packages/db/seed/seed-guard.ts) and every apply document name. The host is
// the one the repository names for that ref everywhere it names one:
// docs/migration-apply-0071.md's Target row, docs/DECISIONS.md (the W11-04
// repoint), docs/handoff/WAVE-12-CLOSE-20260727.md and
// scripts/apply-lane/osteojp-apply-settings.json. The `aws-1-...` hosts in docs/
// belong to other projects (the retired prod and a dev project). Neither
// constant is a credential. The tests pin both by sha256, apart from this file,
// so a changed constant fails there.

export const PRODUCTION = Object.freeze({
  ref: "dfotoodqvmjhbdcxyaxf",
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: "5432",
  database: "postgres",
});

/** Query keys libpq would apply over the URL's own host, port, database or user. */
export const TARGET_QUERY_KEYS = Object.freeze(["host", "hostaddr", "port", "dbname", "database", "user", "service"]);

/**
 * Why a string was refused, one sentence per check, NAMING NO VALUE FROM THE
 * STRING. Only the expected constants appear, and none of them is a secret. A
 * misplaced `/`, `?` or `@` in a password moves part of it into the host or the
 * path, so a message that echoed either could echo a password.
 */
export const REASONS = Object.freeze({
  unset: "no connection string is set.",
  control:
    "the connection string carries whitespace or a control character, which psql, postgres.js and new URL() " +
    "read differently.",
  parse: "the connection string could not be parsed as a URL.",
  scheme:
    "the connection string does not begin with postgres:// or postgresql://, and psql reads anything else " +
    "as a database name on its default host.",
  authority:
    'the connection string does not carry exactly one "@" in its authority, or carries a host or port that is ' +
    "not the one parsed, so psql and postgres.js would not connect where this check reads.",
  ref: `the target's ref is not ${PRODUCTION.ref}.`,
  host: `the target's host is not ${PRODUCTION.host}, the production session pooler.`,
  port: `the target's port is not ${PRODUCTION.port}, the session pooler.`,
  database: `the target's database is not ${PRODUCTION.database}.`,
  query:
    `the connection string's query names a connection target (${TARGET_QUERY_KEYS.join(", ")}), ` +
    "which psql would use instead of what was checked.",
});

const SCHEMES = ["postgresql://", "postgres://"];

/**
 * @param {unknown} raw the connection string, exactly as the environment holds it
 * @returns {{ ok: boolean, failed: string | null, seen: { host: string, port: string, ref: string } | null }}
 *   `failed` is the first check that refused (a key of REASONS), or null when
 *   `ok`. `seen` is what new URL() read, for a guard that prints it; null when
 *   nothing parsed. It never carries the password or the path.
 */
export function checkProductionTarget(raw) {
  if (typeof raw !== "string" || raw === "") return { ok: false, failed: "unset", seen: null };

  // control: no whitespace and no C0 or DEL character anywhere. new URL() strips or encodes some of
  // them, libpq keeps them (a tab in the username, a newline after the path), and postgres.js does
  // either. A production string has none, so refusing them closes every such disagreement at once.
  if (/[\u0000-\u0020\u007f]/.test(raw)) return { ok: false, failed: "control", seen: null };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, failed: "parse", seen: null };
  }
  const seen = { host: url.hostname, port: url.port, ref: url.username.split(".").pop() ?? "" };
  const refuse = (failed) => ({ ok: false, failed, seen });

  // scheme
  const scheme = SCHEMES.find((s) => raw.startsWith(s));
  if (!scheme) return refuse("scheme");

  // authority: the raw text up to the first `/`, `?` or `#`, as new URL() bounds it
  const afterScheme = raw.slice(scheme.length);
  const authority = /^[^/?#]*/.exec(afterScheme)[0];
  const rest = afterScheme.slice(authority.length);
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  const colon = hostPort.lastIndexOf(":");
  const rawHost = colon === -1 ? hostPort : hostPort.slice(0, colon);
  const rawPort = colon === -1 ? "" : hostPort.slice(colon + 1);
  if (
    raw.split("@").length !== 2 ||
    !authority.includes("@") ||
    rawHost.toLowerCase() !== url.hostname.toLowerCase() ||
    rawPort !== url.port
  ) {
    return refuse("authority");
  }

  // ref
  if (seen.ref !== PRODUCTION.ref) return refuse("ref");

  // host
  if (url.hostname.toLowerCase() !== PRODUCTION.host) return refuse("host");

  // port
  if (url.port !== PRODUCTION.port) return refuse("port");

  // database
  const wanted = `/${PRODUCTION.database}`;
  if (url.pathname !== wanted || rest.split("?")[0] !== wanted || raw.includes("#")) return refuse("database");

  // query
  for (const key of url.searchParams.keys()) {
    if (TARGET_QUERY_KEYS.includes(key.trim().toLowerCase())) return refuse("query");
  }

  return { ok: true, failed: null, seen };
}
