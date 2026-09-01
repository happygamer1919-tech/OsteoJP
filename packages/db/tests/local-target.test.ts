/**
 * local-target.test.ts — pure unit test, no DB, always runs.
 *
 * SR-08: THE NEGATIVE ARM IS PROVEN TO FAIL UNDER THE NAIVE PREDICATE.
 *
 * Every case below that the guard must REFUSE is also driven through the two
 * predicates this guard replaces:
 *
 *   naiveBlocklist  - "the URL does not contain a known production ref", which
 *                     is `scripts/perf-seed-loadtest.mjs:23` and the shape
 *                     `assert-not-prod.ts` calls a proof.
 *   naiveSubstring  - "the URL contains 127.0.0.1", the allowlist somebody
 *                     writes when they are told to use an allowlist.
 *
 * A test that only asserts the new guard says no is a test that cannot tell you
 * the old guard said yes. These assert BOTH, so the suite fails if the guard is
 * ever reduced to either predicate.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  ALLOWED_LOCAL_HOSTS,
  assertLocalTarget,
  describeTarget,
  parseTargetHost,
} from "../seed/local-target";
import { PROD_REFS } from "../seed/seed-guard";

/** `perf-seed-loadtest.mjs:23`, generalised: absence of a denied ref. */
const naiveBlocklist = (url: string) => !PROD_REFS.some((r) => url.includes(r));
/** The allowlist written carelessly. */
const naiveSubstring = (url: string) => url.includes("127.0.0.1");

const LIVE = "dfotoodqvmjhbdcxyaxf"; // production, on the blocklist
const RETIRED = "jaxmkwoxjcgzkwxgbayx"; // retired, on the blocklist
/** Shape-accurate, 20 chars, NOT on the blocklist. The next project provisioned. */
const UNLISTED = "zzzzyyyyxxxxwwwwvvvv";

describe("parseTargetHost", () => {
  it.each([
    ["postgresql://postgres:postgres@127.0.0.1:54322/postgres", "127.0.0.1"],
    ["postgres://postgres:perf@localhost:55432/perf", "localhost"],
    ["postgresql://u:p@[::1]:5432/db", "::1"],
    ["postgresql://u:p@host.docker.internal:5432/db", "host.docker.internal"],
    [
      `postgresql://postgres.${LIVE}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
      "aws-0-eu-central-1.pooler.supabase.com",
    ],
    [`postgresql://postgres:pw@db.${LIVE}.supabase.co:5432/postgres`, `db.${LIVE}.supabase.co`],
    ["postgresql://U:P@EXAMPLE.COM:5432/db", "example.com"],
  ])("reads the host from %s", (url, host) => {
    expect(parseTargetHost(url)).toBe(host);
  });

  it("splits on the LAST @, so a password containing one is not read as the host", () => {
    // new URL() rejects this outright; the fallback parser must not be fooled.
    expect(parseTargetHost("postgresql://user:p@ss@prod.example.com:5432/db")).toBe(
      "prod.example.com",
    );
  });

  it.each([["", null], ["not a url", null], ["postgresql://", null]] as const)(
    "returns null rather than guessing for %s",
    (url, expected) => {
      expect(parseTargetHost(url)).toBe(expected);
    },
  );
});

describe("describeTarget ACCEPTS only affirmative local hosts", () => {
  it.each(ALLOWED_LOCAL_HOSTS.map((h) => [h] as const))("accepts %s", (host) => {
    const url = `postgresql://postgres:postgres@${host.includes(":") ? `[${host}]` : host}:54322/postgres`;
    const v = describeTarget(url);
    expect(v.local).toBe(true);
    expect(v.host).toBe(host);
  });

  it("is the CI database URL", () => {
    // .github/workflows/db-tests.yml:54 — the guard must not break the suite.
    expect(describeTarget("postgresql://postgres:postgres@127.0.0.1:54322/postgres").local).toBe(
      true,
    );
  });
});

describe("describeTarget REFUSES, and the naive predicates would not", () => {
  /** The case the whole ruling exists for: a production project nobody listed. */
  it("refuses an UNLISTED production-shaped ref that the blocklist lets through", () => {
    const url = `postgresql://postgres.${UNLISTED}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

    expect(naiveBlocklist(url)).toBe(true); // the old guard SAYS YES
    expect(describeTarget(url).local).toBe(false); // this one says no
  });

  it("refuses the LIVE clinic (both guards agree here, and that is the easy case)", () => {
    const url = `postgresql://postgres.${LIVE}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
    expect(naiveBlocklist(url)).toBe(false);
    expect(describeTarget(url).local).toBe(false);
  });

  it("refuses a host that merely BEGINS with a local address", () => {
    const url = "postgresql://u:p@127.0.0.1.attacker.example.com:5432/db";
    expect(naiveSubstring(url)).toBe(true); // the careless allowlist SAYS YES
    expect(naiveBlocklist(url)).toBe(true); // the blocklist SAYS YES
    expect(describeTarget(url).local).toBe(false);
    expect(describeTarget(url).host).toBe("127.0.0.1.attacker.example.com");
  });

  it("refuses when the local address is only in the PASSWORD", () => {
    const url = `postgresql://postgres.${UNLISTED}:127.0.0.1@aws-0-eu-central-1.pooler.supabase.com:6543/db`;
    expect(naiveSubstring(url)).toBe(true); // SAYS YES
    expect(naiveBlocklist(url)).toBe(true); // SAYS YES
    expect(describeTarget(url).local).toBe(false);
  });

  it("refuses a URL it cannot parse, rather than defaulting to allowed", () => {
    expect(describeTarget("garbage").local).toBe(false);
    expect(describeTarget("garbage").host).toBeNull();
  });

  it.each([[undefined], [null], [""]] as const)("refuses %s rather than passing vacuously", (v) => {
    expect(describeTarget(v).local).toBe(false);
  });

  it("refuses the RETIRED project too - retired is not local", () => {
    expect(describeTarget(`postgresql://postgres.${RETIRED}:pw@x.pooler.supabase.com:6543/db`).local).toBe(
      false,
    );
  });
});

describe("assertLocalTarget", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the url for a local target", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    expect(assertLocalTarget(url)).toBe(url);
  });

  it("exits 1 for a production-shaped target and never returns", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("exited");
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      assertLocalTarget(
        `postgresql://postgres.${LIVE}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
      ),
    ).toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    // The refusal names the host and NEVER the connection string (rule 3).
    const printed = err.mock.calls.flat().join("\n");
    expect(printed).toContain("aws-0-eu-central-1.pooler.supabase.com");
    expect(printed).not.toContain("pw@");
  });

  it("names the variable it refused, so a shell holding several is diagnosable", () => {
    vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("exited");
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertLocalTarget("postgresql://u:p@prod.example.com/db", "DATABASE_URL_DIRECT")).toThrow();
    expect(err.mock.calls.flat().join("\n")).toContain("DATABASE_URL_DIRECT");
  });
});
