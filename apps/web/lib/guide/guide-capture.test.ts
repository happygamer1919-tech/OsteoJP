// G1-5: THE CAPTURE TOOL PHOTOGRAPHS ONLY THIS COMPUTER. capture-guide.mjs
// logs in and takes screenshots; pointed at a deployed platform it would
// photograph real patients into a public repository. checkBaseUrl refuses any
// base URL whose host is not localhost or 127.0.0.1, or that carries
// credentials, and the command exits 2 on that refusal before it opens a
// browser or writes a file.
//
// The function arms run checkBaseUrl on the real deployed hosts and on hosts
// that look local and are not (a subdomain, a user part, a fragment, a
// lookalike). They are pure: a broken check returns a string, nothing more.
//
// The command arms run the tool itself, and are built so that even a BROKEN
// refusal cannot reach anything: they name hosts under .invalid, which never
// resolve (RFC 6761), and they run the tool with PLAYWRIGHT_BROWSERS_PATH on
// an empty folder, so no browser can start. An arm proves that folder stops a
// launch. (A first version ran the command on the deployed host itself; with
// the refusal mutated away, that arm would open it in a browser.)

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { LOCAL_HOSTS, checkBaseUrl } from "../../../../docs/guide/build/capture-guide.mjs";
import { REPO_ROOT } from "../../../../docs/guide/build/guide-model.mjs";

const CAPTURE = join(REPO_ROOT, "docs", "guide", "build", "capture-guide.mjs");

// No browser lives here, so a command arm can never open a page.
const NO_BROWSERS = mkdtempSync(join(tmpdir(), "guide-capture-no-browsers-"));
afterAll(() => rmSync(NO_BROWSERS, { recursive: true, force: true }));
const SEALED_ENV = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: NO_BROWSERS };

/** Runs a node program with no browser available, from the repository root. */
function sealed(args: string[]) {
  return spawnSync(process.execPath, args, { cwd: REPO_ROOT, env: SEALED_ENV, encoding: "utf8", timeout: 60_000 });
}

describe("checkBaseUrl: a capture runs only against this computer", () => {
  it("the local hosts are localhost and 127.0.0.1, and nothing else", () => {
    expect([...LOCAL_HOSTS]).toEqual(["localhost", "127.0.0.1"]);
  });

  it("accepts http or https on localhost or 127.0.0.1, and returns the origin alone", () => {
    expect(checkBaseUrl("http://localhost:3040")).toBe("http://localhost:3040");
    expect(checkBaseUrl("http://localhost:3040/agenda?date=2026-10-06")).toBe("http://localhost:3040");
    expect(checkBaseUrl("http://127.0.0.1:3040")).toBe("http://127.0.0.1:3040");
    expect(checkBaseUrl("https://localhost")).toBe("https://localhost");
    expect(checkBaseUrl("HTTP://LOCALHOST:3040")).toBe("http://localhost:3040");
  });

  it.each([
    ["https://portal.osteojp.pt", /refusing portal\.osteojp\.pt/],
    ["https://osteojp-portal.vercel.app", /refusing osteojp-portal\.vercel\.app/],
    ["http://localhost.example.com", /refusing localhost\.example\.com/],
    ["http://127.0.0.1.nip.io:3040", /refusing 127\.0\.0\.1\.nip\.io/],
    ["http://localhost@portal.osteojp.pt", /refusing portal\.osteojp\.pt/],
    ["http://portal.osteojp.pt#@localhost:3040", /refusing portal\.osteojp\.pt/],
    ["http://0.0.0.0:3040", /refusing 0\.0\.0\.0/],
    ["http://[::1]:3040", /refusing \[::1\]/],
    ["http://guia:segredo@localhost:3040", /carries credentials/],
    ["ftp://localhost", /must be http or https/],
    ["file:///etc/hosts", /must be http or https/],
    ["localhost:3040", /must be http or https/],
    ["não é um endereço", /is not a URL/],
  ])("refuses %s", (raw, message) => {
    expect(() => checkBaseUrl(raw)).toThrow(message);
  });
});

describe("the capture command refuses a host that is not local, with exit 2 and nothing written", () => {
  it("the command arms run where no browser can start: a launch there fails", () => {
    const launch = [
      'const { createRequire } = require("node:module");',
      `const req = createRequire(${JSON.stringify(join(REPO_ROOT, "apps", "web", "package.json"))});`,
      'req("@playwright/test").chromium.launch().then((b) => b.close().then(() => process.exit(0)), () => process.exit(3));',
    ].join("\n");
    const run = sealed(["-e", launch]);
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(3);
  });

  // The two shapes the R4 reviewer tried by hand (a deployed host, a local
  // lookalike), under .invalid so that nothing answers even if the refusal breaks.
  it.each(["https://portal.osteojp.pt.invalid", "http://localhost.invalid:3040"])(
    "%s: exit 2, the refusal on stderr, no capture on stdout",
    (url) => {
      const run = sealed([CAPTURE, "--base-url", url]);
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(2);
      expect(run.stderr).toMatch(
        /^capture-guide: refusing .+\.invalid: a guide capture runs only against localhost or 127\.0\.0\.1, never a deployed platform\n$/,
      );
      // A written capture prints its path on stdout; a refusal prints nothing there.
      expect(run.stdout).toBe("");
    },
  );

  it("no --base-url at all: exit 2", () => {
    const run = sealed([CAPTURE]);
    expect(run.status).toBe(2);
    expect(run.stderr).toBe("capture-guide: --base-url is required\n");
    expect(run.stdout).toBe("");
  });
});
