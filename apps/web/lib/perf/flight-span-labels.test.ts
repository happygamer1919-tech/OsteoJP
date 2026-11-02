import { describe, it, expect } from "vitest";

import { scanSpanLabels, splitPayload } from "../../e2e/helpers/flight-span-labels";

/**
 * THE PARSER BEHIND THE TIMING-PANEL PRIVACY GUARD, CHECKED WITHOUT A BROWSER.
 *
 * The helper lives in `e2e/helpers/` beside the spec that uses it, and its test
 * lives HERE, for two reasons that are both about where a test is collected:
 * - a `*.test.ts` under `e2e/` is collected by PLAYWRIGHT (its default
 *   testMatch), which would load this vitest file as a browser test;
 * - `scripts/**\/*.test.mjs` is in the gate freeze (`.github/gate-manifest.json`),
 *   so a new file there is a GATE-CHANGE of its own.
 * `lib/**\/*.test.ts` is what `apps/web/vitest.config.ts` collects, and `lib/perf`
 * is where the timing spans themselves live.
 *
 * The page bytes below are built the way Next.js 16 writes them
 * (`writeFlightDataInstruction` in next/dist/server/app-render/
 * use-flight-response.js): `JSON.stringify([1, chunk])`, then `<`, `>` and `&`
 * replaced by `\u003c`, `\u003e`, `\u0026`, inside `self.__next_f.push(...)`.
 * The fifteen named cases are the probe R4 ran against PR #1710.
 */

const esc = (s: string) =>
  s.replace(/[&><]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const inline = (chunk: string, attrs = "") =>
  `<script${attrs}>self.__next_f.push(${esc(JSON.stringify([1, chunk]))})</script>`;
const inlineBinary = (chunk: string) =>
  `<script>self.__next_f.push(${esc(JSON.stringify([3, Buffer.from(chunk, "utf8").toString("base64")]))})</script>`;
const spanRow = (name: string, detail?: string) =>
  `2a:["$","$L1db",null,{"spans":[{"name":${JSON.stringify(name)},"ms":1.2${
    detail ? `,"detail":${JSON.stringify(detail)}` : ""
  }}]}]\n`;

const PROBE: ReadonlyArray<readonly [name: string, page: string, expected: readonly string[]]> = [
  // Four flight ROW HEADERS. None is a label, and each was, or could be, read as one.
  [
    "FP: row 1db import (the #1701 failure)",
    inline(`0:{}\n1db:I["[project]/apps/web/components/pager.client.tsx",[],"default"]\n`),
    [],
  ],
  ["FP: row db at chunk start", inline(`db:I["x",[],"y"]\n`), []],
  ["FP: row adb text row", inline(`adb:T1f,some text\n`), []],
  ["FP: row 3db hint", inline(`0:{}\n3db:HL["/x","style"]\n`), []],
  // Real labels, in every shape a span name or detail could take.
  ["real label in flight props", inline(spanRow("db:patients-list")), ["db:patients-list"]],
  ["real label in SSR html", `<td class="c">db:patients-list</td>`, ["db:patients-list"]],
  ["db:scoped default", inline(spanRow("db:scoped")), ["db:scoped"]],
  ["future uppercase first", inline(spanRow("db:Agenda")), ["db:Agenda"]],
  ["future digit first", inline(spanRow("db:2fa-check")), ["db:2fa-check"]],
  ["future underscore first", inline(spanRow("db:_raw")), ["db:_raw"]],
  ["future snake_case", inline(spanRow("db:survey_list")), ["db:survey_list"]],
  [
    "label after > in a detail (escaped \\u003e)",
    inline(spanRow("mark:x", "cache->db:patients-list")),
    ["db:patients-list"],
  ],
  [
    "label after & in a detail (escaped \\u0026)",
    inline(spanRow("mark:x", "a&db:reminder-log")),
    ["db:reminder-log"],
  ],
  [
    "label glued to a word",
    inline(spanRow("mark:x", "viadb:patients-list")),
    ["db:patients-list"],
  ],
  [
    "label split across two push chunks",
    inline(`2a:[{"name":"d`) + inline(`b:patients-list"}]\n`),
    ["db:patients-list"],
  ],
];

describe("scanSpanLabels: R4's fifteen probe cases", () => {
  it("has all fifteen, four of them row headers", () => {
    expect(PROBE).toHaveLength(15);
    expect(PROBE.filter(([, , want]) => want.length === 0)).toHaveLength(4);
  });

  for (const [name, page, expected] of PROBE) {
    it(name, () => {
      expect(scanSpanLabels(page).labels).toEqual(expected);
    });
  }
});

describe("scanSpanLabels: the decoding, and what it never drops", () => {
  it("joins chunks in document order and counts them", () => {
    const page = inline("0:{}\n") + inline(`2a:[{"name":"d`) + inline(`b:x"}]\n`);
    const split = splitPayload(page);
    expect(split.flightChunks).toBe(3);
    expect(split.flight).toBe(`0:{}\n2a:[{"name":"db:x"}]\n`);
    expect(split.html).not.toContain("__next_f.push([1");
  });

  it("decodes a chunk on a script carrying a nonce attribute", () => {
    const page = inline(spanRow("db:patients-list"), ' nonce="abc"');
    const scan = scanSpanLabels(page);
    expect(scan.flightChunks).toBe(1);
    expect(scan.flightLabels).toEqual(["db:patients-list"]);
  });

  it("decodes a base64 chunk (Next writes [3, base64] when a chunk is not valid UTF-8 text)", () => {
    const scan = scanSpanLabels(inline("0:{}\n") + inlineBinary(spanRow("db:Agenda")));
    expect(scan.flightChunks).toBe(2);
    expect(scan.labels).toEqual(["db:Agenda"]);
  });

  it("never drops a row-header-shaped match from the HTML, only from the flight text", () => {
    const scan = scanSpanLabels(`<pre>\ndb:Agenda</pre>${inline(`0:{}\n1db:I["x",[],"y"]\n`)}`);
    expect(scan.labels).toEqual(["db:Agenda"]);
    expect(scan.flightLabels).toEqual([]);
  });

  it("keeps a lowercase match at a row start (only an uppercase row tag is dropped)", () => {
    expect(scanSpanLabels(inline(`0:{}\n1db:patients-list\n`)).labels).toEqual([
      "db:patients-list",
    ]);
  });

  it("with no push() chunk, searches the raw bytes and goes RED on a row header, never silent", () => {
    // A writer this parser does not recognise (a space after the comma): the
    // chunk stays in the HTML, escaped, and is searched as it stands.
    const unknownWriter = `<script>self.__next_f.push([1, ${esc(
      JSON.stringify(`0:{}\n1db:I["x",[],"y"]\n2a:{"name":"db:patients-list"}\n`),
    )}])</script>`;
    const scan = scanSpanLabels(unknownWriter);
    expect(scan.flightChunks).toBe(0);
    expect(scan.labels).toEqual(["db:I", "db:patients-list"]);
  });

  it("throws on a push() literal it matched but cannot parse, rather than passing", () => {
    expect(() => scanSpanLabels(`<script>self.__next_f.push([1,"\\x"])</script>`)).toThrow();
  });
});
