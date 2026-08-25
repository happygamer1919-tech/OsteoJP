// The PRODUCTION import entrypoint: its gate, and the guarantee that it shares
// the rehearsal's flow rather than copying it.
//
// NOT DB-GATED. Everything here is source-level or a pure function; the write
// path is the shared core, already covered by rehearsal-import.test.ts.

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import {
  PROD_BATCH_ID,
  PROD_CONFIRM_PHRASE,
  readPhraseFromStdin,
} from "../scripts/prod-import";
import { isUuid } from "../scripts/import-core";
import { PROD_REFS } from "../seed/seed-guard";

const SCRIPTS = path.join(import.meta.dirname, "../scripts");
const read = (f: string) => fs.readFileSync(path.join(SCRIPTS, f), "utf8");
const prodSrc = read("prod-import.ts");
const rehearsalSrc = read("rehearsal-import.ts");
const coreSrc = read("import-core.ts");

/* ====================================================================== */
/* THE PHRASE                                                              */
/* ====================================================================== */

describe("the confirmation phrase", () => {
  test("it is the phrase CLAUDE.md ratified, character for character", async () => {
    const claudeMd = fs.readFileSync(path.join(SCRIPTS, "../../../CLAUDE.md"), "utf8");
    expect(PROD_CONFIRM_PHRASE).toBe("IMPORT FISIOZERO INTO PRODUCTION");
    expect(claudeMd).toContain(PROD_CONFIRM_PHRASE);
  });

  test("it equals run-import.mjs's own CONFIRM_PHRASE - one phrase, not two", async () => {
    // Two copies of a gate phrase is one copy too many. If these ever diverge,
    // the target gate would accept a phrase the WRITE gate then rejects, and the
    // operator would be told "refused" after typing the phrase correctly.
    const mod = (await import(
      pathToFileURL(path.resolve(SCRIPTS, "../../../scripts/import/run-import.mjs")).href
    )) as { CONFIRM_PHRASE: string };
    expect(PROD_CONFIRM_PHRASE).toBe(mod.CONFIRM_PHRASE);
  });

  const feed = (s: string) => Readable.from([s]);

  test("the exact phrase is accepted", async () => {
    await expect(readPhraseFromStdin(feed(`${PROD_CONFIRM_PHRASE}\n`))).resolves.toBe(
      PROD_CONFIRM_PHRASE,
    );
  });

  test("surrounding whitespace is trimmed, so a trailing space is not a refusal", async () => {
    await expect(readPhraseFromStdin(feed(`  ${PROD_CONFIRM_PHRASE}  \n`))).resolves.toBe(
      PROD_CONFIRM_PHRASE,
    );
  });

  test("near-misses do NOT equal the phrase", async () => {
    // Each of these is a plausible mistype, and each must fail the comparison
    // the gate performs.
    for (const near of [
      "import fisiozero into production",
      "IMPORT FISIOZERO INTO PRODUCAO",
      "IMPORT  FISIOZERO  INTO  PRODUCTION",
      "IMPORT FISIOZERO INTO PRODUCTION!",
      "",
    ]) {
      await expect(readPhraseFromStdin(feed(`${near}\n`))).resolves.not.toBe(PROD_CONFIRM_PHRASE);
    }
  });

  test("empty stdin resolves to empty, which the gate refuses", async () => {
    await expect(readPhraseFromStdin(feed(""))).resolves.toBe("");
  });
});

/* ====================================================================== */
/* HOW THE PHRASE IS SOURCED - the part that is a security property         */
/* ====================================================================== */

describe("the phrase is typed, never stored", () => {
  test("it is read from STDIN and not from --confirm or an env var", () => {
    expect(prodSrc).toMatch(/readPhraseFromStdin/);
    // No env read for the phrase anywhere in the file.
    expect(prodSrc).not.toMatch(/process\.env\.[A-Z_]*CONFIRM/);
    expect(prodSrc).not.toMatch(/process\.env\.[A-Z_]*PHRASE/);
  });

  test("--confirm is REJECTED rather than ignored", () => {
    // An operator carrying the rehearsal's habit must be told, not silently run
    // with a phrase this entrypoint never read.
    expect(prodSrc).toMatch(/--confirm is not accepted here/);
  });

  test("the phrase is never echoed, and the expected value is not printed on refusal", () => {
    // Printing it on failure turns a refusal into a copy-paste prompt.
    const refusal = prodSrc.slice(prodSrc.indexOf("REFUSED - the confirmation phrase"));
    expect(refusal).not.toMatch(/\$\{PROD_CONFIRM_PHRASE\}/);
    expect(refusal).not.toMatch(/\$\{typed\}/);
    // And the VARIABLE is never interpolated or passed to a logger anywhere.
    // (Matching the bare word `typed` would false-positive on the prose in the
    // --confirm refusal message, which says "the phrase is typed on stdin".)
    expect(prodSrc).not.toMatch(/\$\{\s*typed\s*\}/);
    expect(prodSrc).not.toMatch(/console\.(log|error)\(\s*typed\s*[,)]/);
    expect(prodSrc).not.toMatch(/,\s*typed\s*\)/);
  });
});

/* ====================================================================== */
/* NO BLOCKLIST HERE - and that is the point of the file                   */
/* ====================================================================== */

describe("the production gate is the phrase, not the blocklist", () => {
  test("prod-import does NOT refuse a blocklisted ref", () => {
    // The blocklist protects prod FROM the rehearsal. A prod entrypoint that
    // also refused prod refs could never run at all.
    expect(prodSrc).not.toMatch(/PROD_REFS\.includes/);
    expect(prodSrc).not.toMatch(/refusing to run against blocklisted/);
  });

  test("the REHEARSAL entrypoint still does refuse them", () => {
    // The pair only makes sense together; this is the half that must not rot.
    expect(rehearsalSrc).toMatch(/PROD_REFS\.includes\(ref\)/);
    expect(rehearsalSrc).toMatch(/refusing to run against blocklisted/);
  });

  test("no production ref is hardcoded in either entrypoint", () => {
    for (const ref of PROD_REFS) {
      expect(prodSrc).not.toContain(ref);
      expect(rehearsalSrc).not.toContain(ref);
      expect(coreSrc).not.toContain(ref);
    }
  });
});

/* ====================================================================== */
/* ONE FLOW, TWO GATES - the anti-drift guarantee                           */
/* ====================================================================== */

describe("the two entrypoints share the flow rather than copying it", () => {
  test("both delegate to runEntrypoint in the shared core", () => {
    expect(prodSrc).toMatch(/from "\.\/import-core"/);
    expect(rehearsalSrc).toMatch(/from "\.\/import-core"/);
    expect(prodSrc).toMatch(/runEntrypoint\(\{/);
    expect(rehearsalSrc).toMatch(/runEntrypoint\(\{/);
  });

  test("neither entrypoint re-implements any step of the flow", () => {
    // If any of these appear outside the core, the flow has been copied and the
    // two paths can drift - which on this project means a fix that lands on the
    // rehearsal and not on the one run that cannot be repeated.
    for (const step of [
      "adaptFisiozeroDelivery(",
      "runner.runImport(",
      "readDelivery(",
      "livePipeline(",
      "attachmentMapping(",
    ]) {
      expect(coreSrc, `${step} belongs in the core`).toContain(step);
      expect(prodSrc, `${step} must NOT be re-implemented in prod-import`).not.toContain(step);
      expect(rehearsalSrc, `${step} must NOT be re-implemented in rehearsal-import`).not.toContain(
        step,
      );
    }
  });

  test("the entrypoints are THIN - a copied flow could not be", () => {
    // A crude but honest ceiling. The core is ~570 lines; an entrypoint that
    // grows past 160 has almost certainly absorbed a step that belongs shared.
    expect(prodSrc.split("\n").length).toBeLessThan(160);
    expect(rehearsalSrc.split("\n").length).toBeLessThan(160);
  });
});

/* ====================================================================== */
/* THE BATCH ID                                                            */
/* ====================================================================== */

describe("the production batch id", () => {
  test("it is a uuid, because the column is", () => {
    expect(isUuid(PROD_BATCH_ID)).toBe(true);
  });

  test("it is FIXED - nothing random, nothing clock-derived", () => {
    // A fresh id per run gives the second --apply an empty batch to reconcile,
    // which reports zero of everything and looks exactly like the clean no-op
    // that proves the run is repeatable.
    expect(prodSrc).not.toMatch(/randomUUID|Date\.now\(\)|new Date\(\)/);
  });

  test("it differs from the rehearsal's, so a rehearsal cannot reconcile as prod", () => {
    const m = rehearsalSrc.match(/REHEARSAL_BATCH_ID = "([^"]+)"/);
    expect(m).toBeTruthy();
    expect(PROD_BATCH_ID).not.toBe(m![1]);
  });
});
