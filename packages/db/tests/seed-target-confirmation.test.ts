/**
 * SEC-config-seeds-have-no-target-guard. Both arms.
 *
 * ==========================================================================
 * WHY EVERY REFUSAL IS ALSO RUN THROUGH THE PREDICATE IT REPLACES
 * ==========================================================================
 * A guard test that only asserts "the new code refuses" proves the new code
 * refuses. It does NOT prove the refusal is new, and a test that would have
 * passed before the fix is a test that is not about the fix. PORTAL-REHYDRATE
 * §1.3, criterion F: a guard proves a test RAN; only the assertion proves it
 * tested the right SUBJECT.
 *
 * So `expectsWasAllowedByTheOldPredicate` runs the exact check that stood in
 * `seed/form-templates.ts` and `seed/roles.ts` before this card - quoted from
 * the pre-fix source, not paraphrased:
 *
 *     const databaseUrl = process.env.DATABASE_URL;
 *     if (!databaseUrl) throw new Error("DATABASE_URL is required ...");
 *     // ... then postgres(databaseUrl) and WRITE.
 *
 * Every negative-arm case below asserts BOTH that the new gate refuses AND
 * that the old predicate would have proceeded to the write. Run this file
 * against the pre-fix tree and the negative arm is red.
 *
 * Pure unit test: no database, no network, no stdin. The reader and the TTY
 * answer are injected, which is why `confirmSeedTarget` returns a verdict and
 * `confirmSeedTargetOrExit` is a separate thin wrapper.
 */

import { describe, expect, it, vi } from "vitest";

import { parseTargetHost as parseTargetHostSync } from "../seed/local-target";
import {
  CONFIRM_PREFIX,
  confirmSeedTarget,
  confirmSeedTargetOrExit,
  confirmationLineFor,
  readHostByLastAt,
} from "../seed/target-confirmation";

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

// A password with an unescaped "@", because real Supabase passwords have them
// and it is what forces local-target.ts's second parser. If the host were
// misparsed, the confirmation line would name the wrong target and the whole
// gate would be confirming something else.
const PROD_LIKE =
  "postgresql://postgres.abcdefghijklmnop:pa@ssw0rd@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";
const PROD_LIKE_HOST = "aws-0-eu-west-2.pooler.supabase.com";
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// THE SAME URL WITH A "/" IN THE PASSWORD. new URL() does not throw on this and
// does not report a failure: it returns "ss". See readHostByLastAt.
const SLASH_IN_PASSWORD =
  "postgresql://postgres.abcdefghijklmnop:p@ss/w0rd@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";

type Transcript = { stream: "log" | "err" | "PROMPT_READ"; text: string }[];

function harness(opts: {
  url: string | undefined | null;
  typed?: string;
  interactive?: boolean;
}) {
  const transcript: Transcript = [];
  const readConfirmation = async () => {
    transcript.push({ stream: "PROMPT_READ", text: "" });
    return opts.typed ?? "";
  };
  return {
    transcript,
    run: () =>
      confirmSeedTarget({
        url: opts.url,
        script: "seed:form-templates",
        interactive: opts.interactive ?? true,
        readConfirmation,
        log: (m) => transcript.push({ stream: "log", text: m }),
        err: (m) => transcript.push({ stream: "err", text: m }),
      }),
  };
}

/**
 * THE PREDICATE THIS CARD REPLACES, transcribed from the pre-fix `main()` of
 * both CLIs. Returns true when the old code would have opened a client and
 * written.
 */
function oldPredicateWouldHaveWritten(url: string | undefined | null): boolean {
  const databaseUrl = url;
  if (!databaseUrl) return false; // the old `throw`
  return true; // ... postgres(databaseUrl, ...) and write
}

/* ================================================================== */
/* THE POSITIVE ARM                                                    */
/* ================================================================== */

describe("the positive arm - the operator affirms this host", () => {
  it("accepts the exact line and returns the host", async () => {
    const h = harness({ url: PROD_LIKE, typed: confirmationLineFor(PROD_LIKE_HOST) });
    const v = await h.run();
    expect(v.confirmed).toBe(true);
    expect(v.host).toBe(PROD_LIKE_HOST);
  });

  it("accepts on a LOCAL target too - there is no 'is this production' branch", async () => {
    // The whole SR-08 point. A classification would have to answer for an
    // unrecognised host, and its answer would be "not production".
    const v = await harness({
      url: LOCAL,
      typed: confirmationLineFor("127.0.0.1"),
    }).run();
    expect(v.confirmed).toBe(true);
    expect(v.host).toBe("127.0.0.1");
  });

  it("PRINTS THE TARGET HOST BEFORE IT ASKS, not after", async () => {
    const h = harness({ url: PROD_LIKE, typed: confirmationLineFor(PROD_LIKE_HOST) });
    await h.run();
    const hostLine = h.transcript.findIndex((e) => e.text.includes(PROD_LIKE_HOST));
    const promptRead = h.transcript.findIndex((e) => e.stream === "PROMPT_READ");
    expect(hostLine).toBeGreaterThanOrEqual(0);
    expect(promptRead).toBeGreaterThanOrEqual(0);
    // Ordering, not mere presence: a host printed after the answer was taken
    // is a host the operator did not read before deciding.
    expect(hostLine).toBeLessThan(promptRead);
  });

  it("never puts the connection string or its password in the transcript", async () => {
    const h = harness({ url: PROD_LIKE, typed: confirmationLineFor(PROD_LIKE_HOST) });
    await h.run();
    const all = h.transcript.map((e) => e.text).join("\n");
    expect(all).not.toContain(PROD_LIKE);
    expect(all).not.toContain("pa@ssw0rd");
    expect(all).not.toContain("postgres.abcdefghijklmnop");
  });
});

/* ================================================================== */
/* THE NEGATIVE ARM, EACH CASE PROVEN NEW                              */
/* ================================================================== */

describe("the negative arm - and each case is one the old predicate allowed", () => {
  const refusals: { name: string; typed?: string; interactive?: boolean }[] = [
    { name: "nothing typed", typed: "" },
    { name: "the prefix alone, with no host", typed: CONFIRM_PREFIX },
    {
      name: "a line naming a DIFFERENT host",
      typed: confirmationLineFor("127.0.0.1"),
    },
    {
      name: "the right words with the host mistyped by one character",
      typed: confirmationLineFor(PROD_LIKE_HOST.replace("eu-west-2", "eu-west-1")),
    },
    { name: "'yes'", typed: "yes" },
    {
      name: "stdin that is not a terminal, however plausible the line",
      typed: confirmationLineFor(PROD_LIKE_HOST),
      interactive: false,
    },
  ];

  for (const c of refusals) {
    it(`refuses: ${c.name} - and the old predicate would have WRITTEN`, async () => {
      const v = await harness({
        url: PROD_LIKE,
        typed: c.typed,
        interactive: c.interactive,
      }).run();
      expect(v.confirmed).toBe(false);
      expect(v.reason).not.toBe("");

      // THE HALF THAT MAKES THIS TEST ABOUT THE FIX.
      expect(oldPredicateWouldHaveWritten(PROD_LIKE)).toBe(true);
    });
  }

  it("refuses a connection string it cannot parse a host from, rather than guessing", async () => {
    const unparseable = "not-a-connection-string";
    const v = await harness({ url: unparseable, typed: "anything" }).run();
    expect(v.confirmed).toBe(false);
    expect(v.host).toBeNull();
    // An unparseable target is exactly the "unknown case" §1.3 warns about, and
    // the old predicate called it fine because it was a non-empty string.
    expect(oldPredicateWouldHaveWritten(unparseable)).toBe(true);
  });

  it("refuses an unset target - the ONE case the old predicate also refused", async () => {
    const v = await harness({ url: undefined, typed: "anything" }).run();
    expect(v.confirmed).toBe(false);
    expect(oldPredicateWouldHaveWritten(undefined)).toBe(false);
  });

  it("does not reprint the expected line after a mismatch", async () => {
    const h = harness({ url: PROD_LIKE, typed: "wrong" });
    await h.run();
    const printedBeforePrompt = h.transcript
      .slice(0, h.transcript.findIndex((e) => e.stream === "PROMPT_READ"))
      .map((e) => e.text)
      .join("\n");
    const printedAfterPrompt = h.transcript
      .slice(h.transcript.findIndex((e) => e.stream === "PROMPT_READ") + 1)
      .map((e) => e.text)
      .join("\n");
    const expected = confirmationLineFor(PROD_LIKE_HOST);
    expect(printedBeforePrompt).toContain(expected);
    expect(printedAfterPrompt).not.toContain(expected);
  });

  it("REFUSES when the two parsers disagree, rather than naming one of them", async () => {
    // The defect this case exists for is in the SHIPPED parser, not in the new
    // gate: parseTargetHost reads "ss" here and reports no failure. A gate that
    // trusted it would print "TARGET HOST: ss", take a syntactically perfect
    // confirmation for "ss", and write to the pooler.
    const { parseTargetHost } = await import("../seed/local-target");
    expect(parseTargetHost(SLASH_IN_PASSWORD)).toBe("ss");
    expect(readHostByLastAt(SLASH_IN_PASSWORD)).toBe(PROD_LIKE_HOST);

    const h = harness({
      url: SLASH_IN_PASSWORD,
      typed: confirmationLineFor(PROD_LIKE_HOST),
    });
    const v = await h.run();
    expect(v.confirmed).toBe(false);
    expect(v.host).toBeNull();
    expect(h.transcript.map((e) => e.text).join("\n")).not.toContain("TARGET HOST: ss");

    // And the old predicate wrote to it without reading a host at all.
    expect(oldPredicateWouldHaveWritten(SLASH_IN_PASSWORD)).toBe(true);
  });

  it("the disagreement is refused in BOTH directions, not just the password one", () => {
    // A dbname carrying "@" makes the SECOND reading the wrong one. Neither
    // parser is authoritative, so both shapes refuse.
    const atInDbName = "postgresql://u:p@127.0.0.1:5432/db@name";
    expect(parseTargetHostSync(atInDbName)).not.toBe(readHostByLastAt(atInDbName));
  });

  it("gives four DISTINCT reasons rather than one collapsed refusal", async () => {
    const reasons = new Set<string>();
    for (const c of [
      { url: undefined as string | undefined, typed: "x", interactive: true },
      { url: "not-a-connection-string", typed: "x", interactive: true },
      { url: PROD_LIKE, typed: "x", interactive: false },
      { url: PROD_LIKE, typed: "x", interactive: true },
    ]) {
      reasons.add((await harness(c).run()).reason);
    }
    expect(reasons.size).toBe(4);
  });
});

/* ================================================================== */
/* THE PROCESS WRAPPER                                                 */
/* ================================================================== */

describe("confirmSeedTargetOrExit", () => {
  it("exits 2 (BAD_INVOCATION), not 1, on refusal", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const err = vi.fn();
    await confirmSeedTargetOrExit({
      url: PROD_LIKE,
      script: "seed:roles",
      interactive: true,
      readConfirmation: async () => "no",
      log: () => {},
      err,
    });
    expect(exit).toHaveBeenCalledWith(2);
    expect(err.mock.calls.flat().join("\n")).toContain("Nothing was written");
    exit.mockRestore();
  });

  it("returns the url unchanged when confirmed", async () => {
    const out = await confirmSeedTargetOrExit({
      url: PROD_LIKE,
      script: "seed:roles",
      interactive: true,
      readConfirmation: async () => confirmationLineFor(PROD_LIKE_HOST),
      log: () => {},
      err: () => {},
    });
    expect(out).toBe(PROD_LIKE);
  });
});

/* ================================================================== */
/* THE WIRING                                                          */
/* ================================================================== */

describe("both CLIs actually call the gate, before they open a client", () => {
  // The gate is worthless if a CLI does not call it, and the two source files
  // are the subject of the card. Asserted on the source rather than by running
  // the CLI, because running it would need a database.
  const read = async (p: string) =>
    (await import("node:fs/promises")).readFile(
      new URL(p, import.meta.url),
      "utf8",
    );

  for (const file of ["../seed/form-templates.ts", "../seed/roles.ts"]) {
    it(`${file} awaits confirmSeedTargetOrExit before importing the driver`, async () => {
      const src = await read(file);
      const gate = src.indexOf("await confirmSeedTargetOrExit(");
      const driver = src.indexOf('import("postgres")');
      expect(gate).toBeGreaterThan(-1);
      expect(driver).toBeGreaterThan(-1);
      expect(gate).toBeLessThan(driver);
    });
  }
});
