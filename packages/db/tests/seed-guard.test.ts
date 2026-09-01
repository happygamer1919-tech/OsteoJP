/**
 * seed-guard.test.ts
 *
 * Pure unit test — no DB required, always runs.
 *
 * The dev-data seeds (patients-dev, appointments-dev, episodes-dev,
 * dev-reference, ...) all funnel through resolveSeedDatabaseUrl before they
 * write anything. This suite pins the two guarantees that make that guard
 * worth having:
 *
 *   1. The PRODUCTION project ref is on the blocklist. It was empty for the
 *      whole pre-prod period and stayed empty after the prod project was
 *      provisioned, which left SEED_DEV_CONFIRM as the only thing standing
 *      between a stale shell and 50 fake patients in the live clinic database.
 *   2. The blocklist OUTRANKS the opt-in. Setting SEED_DEV_CONFIRM to a
 *      blocklisted ref must still refuse — otherwise the blocklist is only a
 *      speed bump for exactly the operator most likely to hit it.
 *
 * The parse cases are here because a blocklist that cannot recognise a real
 * production connection string does not block anything: both the pooler and
 * the direct URL forms must resolve to the same ref.
 *
 * ==========================================================================
 * THE CONTRACT CHANGED ON 2026-09-01 AND THESE CASES CHANGED WITH IT (PERF-02)
 * ==========================================================================
 * `resolveSeedDatabaseUrl` now runs `assertLocalTarget` FIRST, so a REMOTE
 * target is refused whether or not its ref is blocklisted. The case this file
 * used to assert — "returns the URL for a non-blocklisted, confirmed ref",
 * driven through a remote pooler URL — no longer describes the product, and it
 * is REPLACED rather than deleted: the same shape is now asserted to REFUSE,
 * and the accepting case moved to a local URL.
 *
 * That is a real behaviour change and it removes the ability to seed a remote
 * Supabase project. It costs nothing, because there is no such project:
 * `docs/QUESTIONS.md:518` records the owner's verification that
 * `ufbkzbyghvxtosyrkgjq` "DOES NOT EXIST and never did", and the only other
 * non-production project is the retired one on the blocklist below.
 *
 * The blocklist tests below are KEPT even though gate 1 now refuses those URLs
 * before the blocklist is consulted. They pin gate 2 against the day somebody
 * widens the allowlist; a test deleted because the code above it currently
 * makes it unreachable is a test missing when that code changes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PROD_REFS,
  blocklistedRef,
  parseProjectRef,
  resolveSeedDatabaseUrl,
} from "../seed/seed-guard";

/** CLAUDE.md "Supabase setup" — the live clinic database (Central EU). */
const PROD_REF = "dfotoodqvmjhbdcxyaxf";
/** CLAUDE.md "Supabase setup" — the RETIRED old prod ("do not target it"). */
const OLD_PROD_REF = "jaxmkwoxjcgzkwxgbayx";
/**
 * Every ref the blocklist must carry, asserted by name. A membership test
 * (`PROD_REFS.length > 0`) would stay green if someone replaced the contents
 * rather than emptying them, so each entry is pinned individually AND the pair
 * is driven through the full refusal path below.
 */
const BLOCKED_REFS: ReadonlyArray<readonly [label: string, ref: string]> = [
  ["production", PROD_REF],
  ["retired old production", OLD_PROD_REF],
];
/** Shape-accurate but non-existent; 20 chars, same as a real Supabase ref. */
const DEV_REF = "aaaabbbbccccddddeeee";

const poolerUrl = (ref: string) =>
  `postgresql://postgres.${ref}:redacted@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
const directUrl = (ref: string) =>
  `postgresql://postgres:redacted@db.${ref}.supabase.co:5432/postgres`;
/** The CI database, .github/workflows/db-tests.yml:54 — the one shape that passes. */
const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Run resolveSeedDatabaseUrl with a controlled env, capturing whether it exited.
 * process.exit is stubbed to THROW so the function stops where it really would
 * (it is typed as returning a string but never returns on the refuse paths).
 */
function runGuard(env: { databaseUrl?: string; confirm?: string }): {
  exited: boolean;
  stderr: string;
  returned: string | null;
} {
  const saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_DEV: process.env.DATABASE_URL_DEV,
    SEED_DEV_CONFIRM: process.env.SEED_DEV_CONFIRM,
  };

  delete process.env.DATABASE_URL_DEV;
  if (env.databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = env.databaseUrl;
  if (env.confirm === undefined) delete process.env.SEED_DEV_CONFIRM;
  else process.env.SEED_DEV_CONFIRM = env.confirm;

  const stderr: string[] = [];
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => {
    throw new Error("__process_exit__");
  }) as never);

  let exited = false;
  let returned: string | null = null;
  try {
    returned = resolveSeedDatabaseUrl();
  } catch (err) {
    if ((err as Error).message !== "__process_exit__") throw err;
    exited = true;
  } finally {
    errSpy.mockRestore();
    exitSpy.mockRestore();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  return { exited, stderr: stderr.join("\n"), returned };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PROD_REFS blocklist", () => {
  it.each(BLOCKED_REFS)("contains the %s project ref", (_label, ref) => {
    expect(PROD_REFS).toContain(ref);
  });

  it("is not empty", () => {
    // Guards the regression this file was written for: the list shipped as []
    // with a comment saying to populate it, and nothing failed when nobody did.
    expect(PROD_REFS.length).toBeGreaterThan(0);
  });
});

describe("parseProjectRef", () => {
  it.each(BLOCKED_REFS)(
    "reads the %s ref from a transaction/session pooler URL",
    (_label, ref) => {
      expect(parseProjectRef(poolerUrl(ref))).toBe(ref);
    },
  );

  it.each(BLOCKED_REFS)("reads the %s ref from a direct db.<ref>.supabase.co URL", (_label, ref) => {
    expect(parseProjectRef(directUrl(ref))).toBe(ref);
  });

  it("returns null when no ref can be parsed", () => {
    expect(parseProjectRef("postgresql://postgres:redacted@localhost:5432/postgres")).toBeNull();
  });
});

/**
 * GATE 2, PINNED DIRECTLY. Gate 1 makes every production URL unreachable here,
 * so without this block the blocklist would have no test at all from the day
 * the allowlist landed — and nobody would notice until somebody widened
 * `ALLOWED_LOCAL_HOSTS` and found the second gate had rotted underneath.
 */
describe("blocklistedRef — the second gate, tested independently of the first", () => {
  it.each(BLOCKED_REFS)("identifies the %s ref in a pooler URL", (_label, ref) => {
    expect(blocklistedRef(poolerUrl(ref))).toBe(ref);
  });

  it.each(BLOCKED_REFS)("identifies the %s ref in a direct URL", (_label, ref) => {
    expect(blocklistedRef(directUrl(ref))).toBe(ref);
  });

  it("returns null for a ref that is not blocklisted", () => {
    expect(blocklistedRef(poolerUrl(DEV_REF))).toBeNull();
  });

  it("returns null for a local URL, which carries no ref at all", () => {
    expect(blocklistedRef(LOCAL_URL)).toBeNull();
  });
});

describe("resolveSeedDatabaseUrl", () => {
  /**
   * REFUSAL IS THE ASSERTION, AND THE GATE THAT PRODUCES IT IS NOW GATE 1.
   * These URLs are remote, so `assertLocalTarget` refuses them before the
   * blocklist is consulted. The message therefore names the host rather than
   * the blocklist, and asserting the old string would only prove which gate
   * fired, not that the target was refused.
   */
  it.each(BLOCKED_REFS)(
    "refuses the %s ref even when SEED_DEV_CONFIRM matches it",
    (_label, ref) => {
      const result = runGuard({ databaseUrl: poolerUrl(ref), confirm: ref });
      expect(result.exited).toBe(true);
      expect(result.returned).toBeNull();
      expect(result.stderr).toContain("not one of the allowed local targets");
    },
  );

  it.each(BLOCKED_REFS)("refuses the %s ref given as a direct URL", (_label, ref) => {
    const result = runGuard({ databaseUrl: directUrl(ref), confirm: ref });
    expect(result.exited).toBe(true);
    expect(result.returned).toBeNull();
  });

  /**
   * THE CASE THE PERF-02 RULING EXISTS FOR. `DEV_REF` is shape-accurate and NOT
   * on the blocklist, so the old guard returned this URL. It is a remote host,
   * so the new one refuses it — and it would refuse a real production project
   * provisioned tomorrow for exactly the same reason.
   */
  it("REFUSES a remote target even when its ref is not blocklisted and IS confirmed", () => {
    const result = runGuard({ databaseUrl: poolerUrl(DEV_REF), confirm: DEV_REF });
    expect(result.exited).toBe(true);
    expect(result.returned).toBeNull();
    expect(result.stderr).toContain("not one of the allowed local targets");
  });

  it("still requires SEED_DEV_CONFIRM once the target IS local", () => {
    const result = runGuard({ databaseUrl: LOCAL_URL });
    expect(result.exited).toBe(true);
    expect(result.stderr).toContain("not confirmed");
  });

  it("returns the URL for a confirmed LOCAL target", () => {
    const result = runGuard({ databaseUrl: LOCAL_URL, confirm: "127.0.0.1" });
    expect(result.exited).toBe(false);
    expect(result.returned).toBe(LOCAL_URL);
  });

  it("refuses when DATABASE_URL is absent", () => {
    const result = runGuard({});
    expect(result.exited).toBe(true);
  });
});
