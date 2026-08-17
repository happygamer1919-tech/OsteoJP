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
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PROD_REFS, parseProjectRef, resolveSeedDatabaseUrl } from "../seed/seed-guard";

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

describe("resolveSeedDatabaseUrl", () => {
  it.each(BLOCKED_REFS)(
    "refuses the %s ref even when SEED_DEV_CONFIRM matches it",
    (_label, ref) => {
      const result = runGuard({ databaseUrl: poolerUrl(ref), confirm: ref });
      expect(result.exited).toBe(true);
      expect(result.returned).toBeNull();
      expect(result.stderr).toContain("blocklisted");
    },
  );

  it.each(BLOCKED_REFS)("refuses the %s ref given as a direct URL", (_label, ref) => {
    const result = runGuard({ databaseUrl: directUrl(ref), confirm: ref });
    expect(result.exited).toBe(true);
    expect(result.stderr).toContain("blocklisted");
  });

  it("still requires SEED_DEV_CONFIRM for a non-blocklisted ref", () => {
    const result = runGuard({ databaseUrl: poolerUrl(DEV_REF) });
    expect(result.exited).toBe(true);
    expect(result.stderr).toContain("not confirmed");
  });

  it("returns the URL for a non-blocklisted, confirmed ref", () => {
    const url = poolerUrl(DEV_REF);
    const result = runGuard({ databaseUrl: url, confirm: DEV_REF });
    expect(result.exited).toBe(false);
    expect(result.returned).toBe(url);
  });

  it("refuses when DATABASE_URL is absent", () => {
    const result = runGuard({});
    expect(result.exited).toBe(true);
  });
});
