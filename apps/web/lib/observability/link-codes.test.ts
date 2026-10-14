import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { CONFIRM_CODE_LENGTH, generateConfirmCode } from "../reminders/confirm-code";
import { SURVEY_CODE_LENGTH, generateSurveyCode } from "../surveys/survey-code";
import {
  LINK_CODE_LENGTH,
  LINK_CODE_PATTERNS,
  LINK_CODE_PLACEHOLDER,
  MAX_DEPTH,
  ACCESSOR_MARK,
  MAX_NODES,
  MAX_TEXT_LENGTH,
  TEXT_CUT_MARK,
  TOO_DEEP_MARK,
  TOO_MANY_MARK,
  UNREADABLE_MARK,
  linkCodeScrubFailures,
  neverThrows,
  scrubLinkCodes,
  scrubLinkCodesIn,
  scrubLinkCodesUnbounded,
} from "./link-codes";

/**
 * OBS-07. Synthetic codes only: eight base64url characters that name no row
 * anywhere. `-` and `_` are in the second one on purpose, because the real
 * alphabet has them and a pattern written as "letters and digits" would stop
 * at the first.
 */
const CODE = "Ab3xK9Qz";
const CODE_2 = "q-7_Zt0P";
const ORIGIN = "https://app.example.invalid";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The router state Next sends in a header, as JSON text. */
const TREE = `["",{"children":["c",{"children":[["code","${CODE}","d"],{"children":["__PAGE__",{}]}]}]}]`;

describe("scrubLinkCodes - a string that carries a code leaves without it", () => {
  const cases: Array<[name: string, input: string, want: string]> = [
    // Both routes.
    ["confirm, relative", `/c/${CODE}`, "/c/[code]"],
    ["survey, relative", `/s/${CODE}`, "/s/[code]"],
    ["a code with - and _", `/c/${CODE_2}`, "/c/[code]"],
    // Query string, fragment, trailing slash.
    ["with a query string", `/c/${CODE}?r=generic`, "/c/[code]?r=generic"],
    ["survey with two parameters", `/s/${CODE}?r=answered&l=pt`, "/s/[code]?r=answered&l=pt"],
    ["with a trailing slash", `/c/${CODE}/`, "/c/[code]/"],
    ["trailing slash and query", `/s/${CODE}/?r=generic`, "/s/[code]/?r=generic"],
    ["with a fragment", `/c/${CODE}#top`, "/c/[code]#top"],
    // Absolute.
    ["absolute https", `${ORIGIN}/c/${CODE}`, `${ORIGIN}/c/[code]`],
    ["absolute with a port and a query", `http://localhost:3020/s/${CODE}?r=generic`, "http://localhost:3020/s/[code]?r=generic"],
    ["an address and a port", `http://127.0.0.1:3020/c/${CODE}`, "http://127.0.0.1:3020/c/[code]"],
    ["userinfo and an IPv6 host", `https://u:p@[::1]:3020/c/${CODE}`, "https://u:p@[::1]:3020/c/[code]"],
    ["protocol-relative", `//app.example.invalid/c/${CODE}`, "//app.example.invalid/c/[code]"],
    // The SMS line carries a bare host and no scheme.
    ["a bare host, as the SMS writes it", `Confirmar: app.example.invalid/c/${CODE}`, "Confirmar: app.example.invalid/c/[code]"],
    // Inside a longer string.
    ["a transaction name", `GET /c/${CODE}`, "GET /c/[code]"],
    ["a sentence", `request to /s/${CODE}, refused.`, "request to /s/[code], refused."],
    ["in brackets", `(see /c/${CODE})`, "(see /c/[code])"],
    ["in JSON", `{"url":"/c/${CODE}","n":1}`, '{"url":"/c/[code]","n":1}'],
    ["as a query value", `/login?next=/c/${CODE}&x=1`, "/login?next=/c/[code]&x=1"],
    ["two in one string", `from /c/${CODE} to /s/${CODE_2}`, "from /c/[code] to /s/[code]"],
    ["one straight after the other", `/c/${CODE}/s/${CODE_2}`, "/c/[code]/s/[code]"],
    ["an error message with a fetch", `TypeError: fetch failed: POST ${ORIGIN}/c/${CODE}`, `TypeError: fetch failed: POST ${ORIGIN}/c/[code]`],
    // A 404 still carries what was typed.
    ["the wrong case of the route letter", `/C/${CODE}`, "/C/[code]"],
    ["a doubled slash", `/c//${CODE}`, "/c//[code]"],
    // What may stand straight after a code and is not part of it.
    ["then a full stop", `/c/${CODE}.`, "/c/[code]."],
    ["then a colon", `/c/${CODE}:12:3`, "/c/[code]:12:3"],
    ["then an exclamation mark", `/c/${CODE}!`, "/c/[code]!"],
    ["then a closing square bracket", `[/c/${CODE}]`, "[/c/[code]]"],
    ["then a closing brace", `{/s/${CODE}}`, "{/s/[code]}"],
    ["then a double quote", `"/c/${CODE}"`, '"/c/[code]"'],
    ["then a single quote", `'/c/${CODE}'`, "'/c/[code]'"],
    ["then an extension", `/_next/data/build/c/${CODE}.json`, "/_next/data/build/c/[code].json"],
    // Behind a prefix: a locale, a data route, a segment prefetch.
    ["behind a locale prefix", `${ORIGIN}/pt/c/${CODE}`, `${ORIGIN}/pt/c/[code]`],
    ["a segment prefetch", `/_next/segments/c/${CODE}/__PAGE__`, "/_next/segments/c/[code]/__PAGE__"],
    // The slash, every way it travels.
    ["url-encoded, as a next= value", `/login?next=%2Fc%2F${CODE}`, "/login?next=%2Fc%2F%5Bcode%5D"],
    ["url-encoded, lower case hex", `%2fs%2f${CODE}%3Fr%3Dgeneric`, "%2fs%2f%5Bcode%5D%3Fr%3Dgeneric"],
    ["url-encoded absolute", `https%3A%2F%2Fapp.example.invalid%2Fc%2F${CODE}`, "https%3A%2F%2Fapp.example.invalid%2Fc%2F%5Bcode%5D"],
    ["encoded twice", `r=%252Fc%252F${CODE}`, "r=%252Fc%252F%5Bcode%5D"],
    ["encoded three times", `r=%25252Fc%25252F${CODE}`, "r=%25252Fc%25252F%5Bcode%5D"],
    ["mixed: encoded then plain", `%2Fc/${CODE}`, "%2Fc/[code]"],
    ["mixed: plain then encoded", `/c%2F${CODE}`, "/c%2F%5Bcode%5D"],
    ["JSON with escaped slashes", `{"url":"\\/c\\/${CODE}"}`, '{"url":"\\/c\\/[code]"}'],
    // The name.
    ["a form body", `code=${CODE}&action=confirm`, "code=[code]&action=confirm"],
    ["a query parameter", `/x?a=1&code=${CODE}`, "/x?a=1&code=[code]"],
    ["a query parameter, encoded", `next=%2Fx%3Fcode%3D${CODE}`, "next=%2Fx%3Fcode%3D%5Bcode%5D"],
    ["a server action's field name", `1_code=${CODE}`, "1_code=[code]"],
    ["JSON", `{"code":"${CODE}"}`, '{"code":"[code]"}'],
    ["JSON with a space", `{"code": "${CODE}"}`, '{"code": "[code]"}'],
    ["JSON inside JSON", `{\\"code\\":\\"${CODE}\\"}`, '{\\"code\\":\\"[code]\\"}'],
    ["JSON, url-encoded", encodeURIComponent(`{"code":"${CODE}"}`), "%7B%22code%22%3A%22%5Bcode%5D%22%7D"],
    ["an object as the console prints it", `params { code: '${CODE}' }`, "params { code: '[code]' }"],
    ["a label and a value", `code: ${CODE}`, "code: [code]"],
    // The router state Next sends in a header on a server action.
    ["the router state tree", TREE, TREE.replace(CODE, "[code]")],
    [
      "the router state tree, url-encoded as the header carries it",
      encodeURIComponent(`[["code","${CODE}","d"],{}]`),
      "%5B%5B%22code%22%2C%22%5Bcode%5D%22%2C%22d%22%5D%2C%7B%7D%5D",
    ],
    ["the tree, with a space after the comma", `[["code", "${CODE}", "d"],{}]`, '[["code", "[code]", "d"],{}]'],
    ["the tree, JSON inside JSON", `[[\\"code\\",\\"${CODE}\\",\\"d\\"]]`, '[[\\"code\\",\\"[code]\\",\\"d\\"]]'],
    [
      "the tree, url-encoded twice",
      encodeURIComponent(encodeURIComponent(`[["code","${CODE}","d"]]`)),
      "%255B%255B%2522code%2522%252C%2522%5Bcode%5D%2522%252C%2522d%2522%255D%255D",
    ],
  ];

  it.each(cases)("%s", (_name, input, want) => {
    const out = scrubLinkCodes(input);
    expect(out).toBe(want);
    expect(out).not.toContain(CODE);
    expect(out).not.toContain(CODE_2);
  });

  it("is idempotent: a scrubbed string comes back unchanged", () => {
    for (const [, input] of cases) {
      const once = scrubLinkCodes(input);
      expect(scrubLinkCodes(once)).toBe(once);
    }
  });

  it("the placeholder is the name Next gives the segment", () => {
    expect(LINK_CODE_PLACEHOLDER).toBe("[code]");
  });

  it("a `$` in the text around a code is text, not a replacement instruction", () => {
    expect(scrubLinkCodes(`cost $1 at /c/${CODE} $& done`)).toBe("cost $1 at /c/[code] $& done");
  });
});

describe("scrubLinkCodes - what is not exactly a code behind a marker is left exactly as it was", () => {
  const untouched: Array<[name: string, input: string]> = [
    ["a route that starts with c", "/clientes"],
    ["a route that starts with c, deeper", "/clientes/123/editar"],
    ["a route that starts with s", "/settings"],
    ["a route that starts with s, with a query", "/settings?tab=horarios"],
    ["other staff routes", "/comunicacoes"],
    ["consultation", "/consultation/42"],
    ["the route name itself", "/c/[code]"],
    ["the route name in a transaction", "GET /s/[code]"],
    ["the bare route with nothing after it", "/c/"],
    ["the other link page", "/r/some-token"],
    // The length is exact. Seven is not a code, nine is not a code.
    ["one character short", "/c/Ab3xK9Q"],
    ["one character long", "/c/Ab3xK9Qzx"],
    ["a long guess", "/c/not-a-real-code-at-all"],
    ["a short guess", "/s/abc"],
    ["a route parameter's name", "/c/:code"],
    ["a wildcard", "/c/*"],
    // Third party resources and prose that have /c/ or /s/ in them.
    ["a font file", "https://fonts.gstatic.com/s/inter/v12/abc.woff2"],
    ["a CDN asset", "https://cdn.example.invalid/c/assets/a.js"],
    ["an acceleration", "5 m/s/s"],
    ["letters and slashes", "w/c/x"],
    ["a sed expression", "/s/g"],
    ["a Windows path", "C:/c/Users"],
    ["an api path that has a c segment", "/api/v1/c/thing"],
    ["an absolute api path", `${ORIGIN}/api/v1/s/thing`],
    ["a relative file path", "./c/thing"],
    // Our own files for these two routes.
    ["a browser chunk", `${ORIGIN}/_next/static/chunks/app/c/%5Bcode%5D/page-1a2b3c.js`],
    ["a browser chunk, survey", "/_next/static/chunks/app/s/%5Bcode%5D/page-1a2b3c.js"],
    ["a browser chunk under a route group", `${ORIGIN}/_next/static/chunks/app/(public)/c/%5Bcode%5D/page.js`],
    ["a relative chunk name", "app/c/%5Bcode%5D/page.js"],
    ["a server bundle", "/var/task/apps/web/.next/server/app/c/[code]/page.js"],
    ["a source file", "app:///app/s/[code]/actions.ts"],
    ["a source path", "apps/web/app/c/[code]/page.tsx"],
    // `code` is a whole name.
    ["a longer name that ends in code", "barcode=12345678"],
    ["a name with an underscore before it", "postal_code=12345678"],
    ["a sentence with a comma", "the code, password is wrong"],
    ["a short value", "code=23505"],
    ["a long value", "code=ECONNREFUSED"],
    ["an OAuth code, which is longer", "?code=0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9"],
    // Identifiers and words.
    ["a trace id", "0123abcd456789ef0123abcd456789ef"],
    ["an eight letter word", "os clientes"],
    ["a string with neither letter", "GET /42/7"],
    ["the empty string", ""],
  ];

  it.each(untouched)("%s", (_name, input) => {
    expect(scrubLinkCodes(input)).toBe(input);
  });
});

describe("the limits of a rule that goes by shape, pinned so nobody has to rediscover them", () => {
  it("a bare code with no marker in front of it is not recognised", () => {
    expect(scrubLinkCodes(CODE)).toBe(CODE);
    expect(scrubLinkCodes(`could not redeem code ${CODE}`)).toBe(`could not redeem code ${CODE}`);
    expect(scrubLinkCodesIn({ extra: { anything: CODE } })).toEqual({ extra: { anything: CODE } });
  });

  it("eight characters that are not a link code, behind a marker, are removed all the same", () => {
    expect(scrubLinkCodes("https://fonts.gstatic.com/s/opensans/v40/a.woff2")).toBe(
      "https://fonts.gstatic.com/s/[code]/v40/a.woff2",
    );
    expect(scrubLinkCodes('{"code":"PGRST116","message":"no rows"}')).toBe('{"code":"[code]","message":"no rows"}');
    expect(scrubLinkCodes("/c/clientes")).toBe("/c/[code]");
  });

  it("a code that somebody glued a hyphen or a letter onto is nine characters, and stays", () => {
    expect(scrubLinkCodes(`/c/${CODE}-`)).toBe(`/c/${CODE}-`);
  });
});

describe("the rule is tied to what the app issues and to how the app is configured", () => {
  it("apps/web has no base path, no asset prefix and no locale routing", () => {
    // The route marker no longer cares what stands in front of /c/, so a
    // prefix would not blind it. Kept all the same: the day one is configured
    // is the day to re-read link-codes.ts against the new urls.
    const config = readFileSync(path.join(here, "../../next.config.ts"), "utf8");
    // Option KEYS, so the "@osteojp/i18n" package name does not count.
    expect(config).not.toMatch(/\bbasePath\s*:/);
    expect(config).not.toMatch(/\bassetPrefix\s*:/);
    expect(config).not.toMatch(/\bi18n\s*:/);
    expect(config).not.toMatch(/\brewrites\s*[:(]/);
  });

  it("the length it looks for is the length the two issuers use", () => {
    expect(LINK_CODE_LENGTH).toBe(CONFIRM_CODE_LENGTH);
    expect(LINK_CODE_LENGTH).toBe(SURVEY_CODE_LENGTH);
  });

  it("every code either issuer can produce is removed, in each kind of marker", () => {
    for (let i = 0; i < 500; i += 1) {
      const code = i % 2 === 0 ? generateConfirmCode() : generateSurveyCode();
      expect(scrubLinkCodes(`${ORIGIN}/s/${code}?r=generic`)).toBe(`${ORIGIN}/s/[code]?r=generic`);
      expect(scrubLinkCodes(`next=%2Fc%2F${code}`)).toBe("next=%2Fc%2F%5Bcode%5D");
      expect(scrubLinkCodes(`code=${code}&action=confirm`)).toBe("code=[code]&action=confirm");
      expect(scrubLinkCodes(`[["code","${code}","d"],{}]`)).toBe('[["code","[code]","d"],{}]');
    }
  });

  it("both pages post the code in a field named code, which is the name this looks for", () => {
    const confirm = readFileSync(path.join(here, "../../app/c/[code]/page.tsx"), "utf8");
    const survey = readFileSync(path.join(here, "../../app/s/[code]/survey-form.tsx"), "utf8");
    expect(confirm).toContain('name="code"');
    expect(survey).toContain('name="code"');
  });
});

describe("the cost of reading a string is not the sender's to choose", () => {
  it("no pattern has an unbounded quantifier", () => {
    expect(LINK_CODE_PATTERNS).toHaveLength(4);
    for (const pattern of LINK_CODE_PATTERNS) {
      // The sources write a literal plus sign as \x2B and have no literal
      // asterisk, so the bare characters can only be quantifiers.
      expect(pattern.source).not.toMatch(/[*+]/);
      expect(pattern.source).not.toMatch(/\{\d+,\}/);
      // And nothing that changes what a quantifier means.
      expect(pattern.flags).toBe("g");
    }
  });

  /** One megabyte of each shape a stranger can put in a query string or a path. */
  const MEGABYTE = 1024 * 1024;
  const hostile: Array<[name: string, unit: string]> = [
    ["plus-separated letters", "c+"],
    ["plus-separated words", "marcar+consulta+"],
    ["plus signs", "+"],
    ["slashes", "/"],
    ["backslashes", "\\"],
    ["percent signs", "%"],
    ["the route marker", "/c/"],
    ["the route marker and half a code", "/c/Ab3x"],
    ["the route marker with a doubled slash", "/c//"],
    ["the encoded route marker", "%2Fc%2F"],
    ["the route marker in JSON", "\\/c\\/"],
    ["the encoded slash", "%2F"],
    ["the encoded percent", "%25"],
    ["an encoded percent run", "%252525"],
    ["the name", "code="],
    ["the name and a quote", '"code","'],
    ["the name and spaces", "code  "],
    ["the name, a quote, spaces and a colon", 'code"  :  "'],
    ["the name, encoded quotes and spaces", "code%2522%2520%2520%253A%2520%2520%2522"],
    ["the field name of a server action", "1_code"],
    ["a scheme", "http:"],
    ["a real code, over and over", `/c/${CODE}`],
    ["a long word", "c"],
  ];
  // Generous: each of these takes a few milliseconds. A quadratic pattern takes
  // minutes at this size, so the margin is three orders of magnitude wide.
  const CEILING_MS = 2_000;

  it.each(hostile)("1 MB of %s is read in linear time, with no length bound helping", (_name, unit) => {
    const text = unit.repeat(Math.ceil(MEGABYTE / unit.length));
    const started = performance.now();
    const out = scrubLinkCodesUnbounded(text);
    const took = performance.now() - started;
    expect(took).toBeLessThan(CEILING_MS);
    expect(out).not.toContain(CODE);
  });

  it.each(hostile)("1 MB of %s through the bounded function and through the walk", (_name, unit) => {
    const text = unit.repeat(Math.ceil(MEGABYTE / unit.length));
    const started = performance.now();
    const out = scrubLinkCodes(text);
    // As the SDK copies a url: request, query string, referer, trace data, a span.
    scrubLinkCodesIn({
      request: { url: text, query_string: text, headers: { referer: text } },
      contexts: { trace: { data: { "url.full": text } } },
      spans: [{ description: text }],
    });
    const took = performance.now() - started;
    expect(took).toBeLessThan(CEILING_MS);
    expect(out.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    expect(out.endsWith(TEXT_CUT_MARK)).toBe(true);
    expect(out).not.toContain(CODE);
    // What was cut once is within the limit, and is not cut again.
    expect(scrubLinkCodes(out)).toBe(out);
  });

  it("doubling the worst input doubles the time, it does not quadruple it", () => {
    const time = (size: number) => {
      const text = "c+".repeat(size / 2);
      let best = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        scrubLinkCodesUnbounded(text);
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };
    const small = time(MEGABYTE);
    const large = time(4 * MEGABYTE);
    // Linear is 4 times. Quadratic is 16 times. The floor keeps a timer that
    // reads near zero from deciding anything.
    expect(large).toBeLessThan(Math.max(small, 25) * 10);
  });
});

describe("a string longer than the limit is cut, and the cut leaves no half of a code", () => {
  /** Where the cut falls: the limit, less the room the mark takes. */
  const ROOM = MAX_TEXT_LENGTH - TEXT_CUT_MARK.length;

  it("a string at the limit is read whole and comes back as itself", () => {
    const text = "x ".repeat(MAX_TEXT_LENGTH / 2);
    expect(text.length).toBe(MAX_TEXT_LENGTH);
    expect(scrubLinkCodes(text)).toBe(text);
  });

  it("one character more and it is cut and says so", () => {
    const out = scrubLinkCodes(`${".".repeat(MAX_TEXT_LENGTH)}y`);
    expect(out).toBe(".".repeat(ROOM) + TEXT_CUT_MARK);
    expect(out.length).toBe(MAX_TEXT_LENGTH);
  });

  it("at the cut, the run of characters that could be half a match goes too, up to 160 of them", () => {
    const out = scrubLinkCodes("x".repeat(MAX_TEXT_LENGTH + 1));
    expect(out).toBe("x".repeat(ROOM - 160) + TEXT_CUT_MARK);
  });

  it("many encoded placeholders, each longer than its code, still fit within the limit", () => {
    const out = scrubLinkCodes(`.%2Fc%2F${CODE}`.repeat(8_000));
    expect(out.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    expect(out.endsWith(TEXT_CUT_MARK)).toBe(true);
    expect(out).not.toContain(CODE);
    expect(scrubLinkCodes(out)).toBe(out);
  });

  it("a code before the cut is removed as in any string", () => {
    const out = scrubLinkCodes(`GET /c/${CODE} ${"x ".repeat(MAX_TEXT_LENGTH)}`);
    expect(out.startsWith("GET /c/[code] x x")).toBe(true);
    expect(out).not.toContain(CODE);
  });

  const carriers: Array<[name: string, text: string]> = [
    ["a path", `/c/${CODE}`],
    ["an encoded path", `%252Fs%252F${CODE}`],
    ["a form field", `code=${CODE}`],
    ["the encoded tree", encodeURIComponent(encodeURIComponent(`"code", "${CODE}"`))],
  ];

  it.each(carriers)("%s lying across the cut, at every offset, leaves not even four characters of the code", (_name, carrier) => {
    for (let inside = 0; inside <= carrier.length; inside += 1) {
      // `inside` characters of the carrier fall before the cut, the rest after.
      const text = `${". ".repeat(MAX_TEXT_LENGTH).slice(0, ROOM - inside)}${carrier} and ${"more ".repeat(20)}`;
      expect(text.slice(ROOM - inside, ROOM - inside + carrier.length)).toBe(carrier);
      expect(text.length).toBeGreaterThan(MAX_TEXT_LENGTH);
      const out = scrubLinkCodes(text);
      expect(out.endsWith(TEXT_CUT_MARK)).toBe(true);
      expect(out).not.toContain(CODE);
      expect(out).not.toContain(CODE.slice(0, 4));
    }
  });
});

describe("scrubLinkCodesIn - only what stands behind a marker is touched", () => {
  it("a path of eight hex characters does not rewrite the event's identifiers", () => {
    const event = {
      event_id: "0123abcd456789ef0123abcd456789ef",
      release: "0123abcd9f",
      contexts: { trace: { trace_id: "0123abcd456789ef0123abcd456789ef", span_id: "0123abcd01234567", parent_span_id: "890123abcd012345" } },
      request: { url: "/c/0123abcd" },
    };
    const out = scrubLinkCodesIn(event);
    expect(out.request.url).toBe("/c/[code]");
    expect(out.event_id).toBe(event.event_id);
    expect(out.release).toBe(event.release);
    expect(out.contexts.trace).toBe(event.contexts.trace);
  });

  it("a path that is a word does not rewrite the word elsewhere", () => {
    const out = scrubLinkCodesIn({
      request: { url: "/c/clientes" },
      message: "os clientes",
      tags: { route: "/clientes", settings: "password" },
    });
    expect(out).toEqual({
      request: { url: "/c/[code]" },
      message: "os clientes",
      tags: { route: "/clientes", settings: "password" },
    });
  });

  it("a form field named code is removed, as a string and as an object", () => {
    const out = scrubLinkCodesIn({
      extra: {
        body: `code=${CODE}&action=confirm`,
        form: { code: CODE, action: "confirm" },
        action: { "1_code": CODE_2 },
        params: { Code: CODE, nxtPcode: CODE_2 },
      },
    });
    expect(out).toEqual({
      extra: {
        body: "code=[code]&action=confirm",
        form: { code: "[code]", action: "confirm" },
        action: { "1_code": "[code]" },
        params: { Code: "[code]", nxtPcode: "[code]" },
      },
    });
  });

  it("a key named code keeps a value that is not a code", () => {
    const event = { error: { code: "23505" }, other: { code: 404 }, pg: { code: "ECONNREFUSED" } };
    expect(scrubLinkCodesIn(event)).toBe(event);
  });

  it("the router state as a real array loses the code that follows the name", () => {
    expect(scrubLinkCodesIn({ tree: ["", { children: [["code", CODE, "d"], {}] }] })).toEqual({
      tree: ["", { children: [["code", "[code]", "d"], {}] }],
    });
    // The name alone decides: the same string after anything else stays.
    const other = { list: ["node", CODE] };
    expect(scrubLinkCodesIn(other)).toBe(other);
  });

  it("an object KEY that carries a code is rewritten like a value", () => {
    const out = scrubLinkCodesIn({ tags: { [`/c/${CODE}`]: "x" }, seen: { [`code=${CODE_2}`]: 1 } });
    expect(out).toEqual({ tags: { "/c/[code]": "x" }, seen: { "code=[code]": 1 } });
    expect(JSON.stringify(out)).not.toContain(CODE);
    expect(JSON.stringify(out)).not.toContain(CODE_2);
  });

  it("the route parameter as Vercel hands it on is removed: nxtPcode, and the numbered match beside it", () => {
    expect(scrubLinkCodes(`/c/x?nxtPcode=${CODE}`)).toBe("/c/x?nxtPcode=[code]");
    expect(scrubLinkCodes(`nxtIcode=${CODE}`)).toBe("nxtIcode=[code]");
    expect(scrubLinkCodes(`1=${CODE}&nxtPcode=${CODE}`)).toBe("1=[code]&nxtPcode=[code]");
    expect(scrubLinkCodes(`1=${CODE}`)).toBe("1=[code]");
    expect(scrubLinkCodes(`nxtPcode=${CODE}&1=${CODE_2}`)).toBe("nxtPcode=[code]&1=[code]");
    // Url-encoded, once and twice: the placeholder is encoded with it.
    expect(scrubLinkCodes(`1%3D${CODE}%26nxtPcode%3D${CODE}`)).toBe("1%3D%5Bcode%5D%26nxtPcode%3D%5Bcode%5D");
    expect(scrubLinkCodes(`1%253D${CODE}%2526nxtPcode%253D${CODE}`)).toBe(
      "1%253D%5Bcode%5D%2526nxtPcode%253D%5Bcode%5D",
    );
    // The name is one or two digits and nothing else, and the code is eight.
    for (const kept of [`v1=${CODE}`, `1=${CODE}x`, `123=${CODE}`, `1_=${CODE}`, `1 ${CODE}`, `nxtQcode ${CODE}`]) {
      expect(scrubLinkCodes(kept)).toBe(kept);
    }
  });

  it("leaves non-strings alone", () => {
    expect(scrubLinkCodesIn(42)).toBe(42);
    expect(scrubLinkCodesIn(null)).toBe(null);
    expect(scrubLinkCodesIn(undefined)).toBe(undefined);
    expect(scrubLinkCodesIn(`/c/${CODE}`)).toBe("/c/[code]");
  });
});

describe("scrubLinkCodesIn - a stack frame is source code and is not rewritten", () => {
  const CHUNK = `${ORIGIN}/_next/static/chunks/app/(public)/c/%5Bcode%5D/page.js`;
  // No file of ours has this name. If one ever did, it must still survive.
  const HOSTILE_CHUNK = `${ORIGIN}/_next/static/chunks/c/${CODE}/page.js`;
  const HOSTILE_ROOT = `https://cdn.example.invalid/c/${CODE}/chunk.js`;

  function eventWith(frames: object[]) {
    return {
      request: { url: `${ORIGIN}/c/${CODE_2}` },
      exception: { values: [{ type: "Error", value: "x", stacktrace: { frames } }] },
      threads: { values: [{ stacktrace: { frames } }] },
      debug_meta: { images: [{ type: "sourcemap", code_file: HOSTILE_CHUNK, debug_id: "d-1" }] },
    };
  }

  it("filename, abs_path, module, function and the context lines leave as they came", () => {
    const frame = {
      filename: HOSTILE_CHUNK,
      abs_path: HOSTILE_ROOT,
      module: `app/c/${CODE}/page`,
      function: "onSubmit",
      context_line: "const code = generate();",
      pre_context: [`fetch("/c/${CODE}")`, "code: password,"],
      post_context: ["return code;"],
      lineno: 1,
      in_app: true,
    };
    const group = { filename: CHUNK, abs_path: "app/c/%5Bcode%5D/page.js", function: "x" };
    const event = eventWith([frame, group]);

    const out = scrubLinkCodesIn(event);

    // The request url was rewritten, so the event is a copy...
    expect(out.request.url).toBe(`${ORIGIN}/c/[code]`);
    // ...and every frame in it is the very same object.
    expect(out.exception.values[0]?.stacktrace.frames[0]).toBe(frame);
    expect(out.exception.values[0]?.stacktrace.frames[1]).toBe(group);
    expect(out.threads.values[0]?.stacktrace.frames[0]).toBe(frame);
    expect(out.debug_meta).toBe(event.debug_meta);
  });

  it("the variables of a frame are data and are walked", () => {
    const out = scrubLinkCodesIn(eventWith([{ filename: CHUNK, vars: { code: CODE, href: `/s/${CODE}` } }]));
    const frame = out.exception.values[0]?.stacktrace.frames[0] as { filename: string; vars: object };
    expect(frame.filename).toBe(CHUNK);
    expect(frame.vars).toEqual({ code: "[code]", href: "/s/[code]" });
  });

  it("an inline script's frame is named after the page, and the page's address is rewritten", () => {
    const pages = [
      [`${ORIGIN}/c/${CODE}`, `${ORIGIN}/c/[code]`],
      [`${ORIGIN}/s/${CODE}?r=generic`, `${ORIGIN}/s/[code]?r=generic`],
      [`http://localhost:3020/c/${CODE}/`, "http://localhost:3020/c/[code]/"],
      [`/c/${CODE}#top`, "/c/[code]#top"],
    ];
    for (const [page, want] of pages) {
      const out = scrubLinkCodesIn(eventWith([{ filename: page, abs_path: page, function: "?" }]));
      const frame = out.exception.values[0]?.stacktrace.frames[0] as { filename: string; abs_path: string };
      expect(frame.filename).toBe(want);
      expect(frame.abs_path).toBe(want);
    }
  });

  it("a frame is not searched for a body or a cookie either: its keys are source, whatever they are called", () => {
    const event = { exception: { values: [{ stacktrace: { frames: [{ filename: "a.js", cookie: "kept", data: "kept" }] } }] } };
    expect(scrubLinkCodesIn(event)).toBe(event);
  });

  it("an application object that merely has a key called frames is data", () => {
    const out = scrubLinkCodesIn({ extra: { frames: [{ filename: `see /c/${CODE} for more` }] } });
    expect(out).toEqual({ extra: { frames: [{ filename: "see /c/[code] for more" }] } });
  });
});

describe("scrubLinkCodesIn - it copies, and hands back the original when there is nothing to do", () => {
  it("copies and never mutates: the caller's object is exactly what it was", () => {
    const logged = { state: { href: `/s/${CODE}` }, list: [`/c/${CODE}`] };
    const snapshot = JSON.parse(JSON.stringify(logged)) as typeof logged;
    const breadcrumb = { category: "console", data: { arguments: [logged] } };

    const out = scrubLinkCodesIn(breadcrumb);

    expect(logged).toEqual(snapshot);
    expect(out).not.toBe(breadcrumb);
    expect(JSON.stringify(out)).not.toContain(CODE);
  });

  it("accepts a frozen value", () => {
    const frozen = Object.freeze({ url: `/c/${CODE}`, list: Object.freeze([`/s/${CODE}`]) });
    expect(scrubLinkCodesIn(frozen)).toEqual({ url: "/c/[code]", list: ["/s/[code]"] });
  });

  it("returns the very same object when there is nothing to remove", () => {
    const event = { message: "nothing here", tags: { a: "b" }, list: [1, "two", null] };
    expect(scrubLinkCodesIn(event)).toBe(event);
  });

  it("a cycle with no code in it comes back as the very same object too", () => {
    const a: Record<string, unknown> = { name: "a", list: [1, 2] };
    const b: Record<string, unknown> = { name: "b", back: a };
    a.next = b;
    a.self = a;
    expect(scrubLinkCodesIn(a)).toBe(a);
    expect(a.next).toBe(b);
  });

  it("an object reached twice is scrubbed in both places, and a cycle with a code ends", () => {
    const shared = { url: `/c/${CODE}` };
    const a: Record<string, unknown> = { first: shared, second: shared };
    a.self = a;

    const out = scrubLinkCodesIn(a);

    expect((out.first as { url: string }).url).toBe("/c/[code]");
    expect(out.second).toBe(out.first);
    expect(out.self).toBe(out);
    expect(shared.url).toBe(`/c/${CODE}`);
  });
});

describe("scrubLinkCodesIn - values that are not plain data, and what happens to each", () => {
  it("a getter is never called, a throwing one included, and the rest is scrubbed", () => {
    let calls = 0;
    const logged = {
      url: `/c/${CODE}`,
      get boom(): string {
        calls += 1;
        throw new Error("a getter that throws");
      },
      get quiet(): string {
        calls += 1;
        return `/s/${CODE}`;
      },
    };

    const out = scrubLinkCodesIn({ data: { arguments: [logged] } });
    const copy = out.data.arguments[0] as typeof logged;

    expect(calls).toBe(0);
    expect(copy.url).toBe("/c/[code]");
    // Not carried over: the SDK would call them when it serialises the event.
    expect(Object.getOwnPropertyDescriptor(copy, "boom")).toMatchObject({ value: ACCESSOR_MARK, enumerable: true });
    expect(Object.getOwnPropertyDescriptor(copy, "quiet")).toMatchObject({ value: ACCESSOR_MARK, enumerable: true });
    // Serialising is what would have called them. It finds two strings.
    expect(JSON.stringify(out)).not.toContain(CODE);
    expect(calls).toBe(0);
    // The application's own object still has its getters.
    expect(typeof Object.getOwnPropertyDescriptor(logged, "quiet")?.get).toBe("function");
  });

  it("an accessor whose KEY carries a code leaves with neither", () => {
    const logged = {};
    Object.defineProperty(logged, `/c/${CODE}`, { get: () => `/s/${CODE}`, enumerable: true });
    const out = scrubLinkCodesIn({ logged });
    expect(out).toEqual({ logged: { "/c/[code]": ACCESSOR_MARK } });
  });

  it("a revoked Proxy becomes a fixed string, and the event around it is still scrubbed", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const out = scrubLinkCodesIn({ url: `/c/${CODE}`, data: { dead: proxy, n: 1 } });
    expect(out).toEqual({ url: "/c/[code]", data: { dead: UNREADABLE_MARK, n: 1 } });
  });

  it("a Proxy whose traps throw becomes the same fixed string", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("ownKeys");
        },
      },
    );
    const out = scrubLinkCodesIn({ url: `/s/${CODE}`, list: [hostile] });
    expect(out).toEqual({ url: "/s/[code]", list: [UNREADABLE_MARK] });
  });

  it("an event that is itself unreadable leaves as an empty object, not as a throw", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(scrubLinkCodesIn(proxy)).toEqual({});
  });

  it("an own key named __proto__ stays an own key and sets nobody's prototype", () => {
    const parsed = JSON.parse(`{"__proto__":{"url":"/c/${CODE}","polluted":true},"n":1}`) as Record<string, unknown>;
    const out = scrubLinkCodesIn(parsed);

    expect(Object.keys(out)).toEqual(["__proto__", "n"]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(JSON.stringify(out)).toBe('{"__proto__":{"url":"/c/[code]","polluted":true},"n":1}');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("an object with no prototype is copied as one", () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.url = `/c/${CODE}`;
    const out = scrubLinkCodesIn(bare);
    expect(Object.getPrototypeOf(out)).toBeNull();
    expect(out.url).toBe("/c/[code]");
  });

  it(`an object deeper than ${MAX_DEPTH} levels becomes a fixed string, so nothing below it leaves unread`, () => {
    type Nest = { url?: string; next?: Nest };
    const root: Nest = {};
    let cursor = root;
    for (let i = 0; i < MAX_DEPTH + 6; i += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    cursor.url = `/c/${CODE}`;

    const out = scrubLinkCodesIn(root);
    const text = JSON.stringify(out);

    expect(text).not.toContain(CODE);
    expect(text).toContain(TOO_DEEP_MARK);
    expect(text.split('"next"')).toHaveLength(MAX_DEPTH + 2);
  });

  it("a chain a hundred thousand deep does not overflow the stack", () => {
    type Nest = { next?: Nest };
    const root: Nest = {};
    let cursor = root;
    for (let i = 0; i < 100_000; i += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    expect(JSON.stringify(scrubLinkCodesIn(root))).toContain(TOO_DEEP_MARK);
  });

  it(`past ${MAX_NODES} values the walk of an array ends, with one fixed string for the rest`, () => {
    const many = Array.from({ length: MAX_NODES + 10 }, (_v, i) => `v${i}`);
    many.push(`/c/${CODE}`);
    const out = scrubLinkCodesIn({ many, after: `/s/${CODE}` });
    expect(out.many.length).toBeLessThanOrEqual(MAX_NODES + 1);
    expect(out.many[0]).toBe("v0");
    expect(out.many.at(-1)).toBe(TOO_MANY_MARK);
    // What stands after the array in the event is not read either, so it goes.
    expect(out.after).toBe(TOO_MANY_MARK);
    expect(JSON.stringify(out)).not.toContain(CODE);
  });

  it("an array with a huge length and nothing in it does not loop to its length", () => {
    // A billion empty slots. Slot by slot this is tens of seconds; the walk
    // stops at the cap instead.
    const sparse: unknown[] = new Array(1_000_000_000);
    sparse[0] = `/c/${CODE}`;
    const started = performance.now();
    const out = scrubLinkCodesIn({ data: { arguments: [sparse] }, message: `at /s/${CODE}` });
    const took = performance.now() - started;
    const copy = out.data.arguments[0] as unknown[];
    expect(copy[0]).toBe("/c/[code]");
    expect(copy.length).toBeLessThanOrEqual(MAX_NODES + 1);
    expect(copy.at(-1)).toBe(TOO_MANY_MARK);
    expect(JSON.stringify(out)).not.toContain(CODE);
    // Generous: it takes a few milliseconds.
    expect(took).toBeLessThan(2_000);
  });

  it("a URL, its search parameters and a String object are read as the text they are", () => {
    const url = new URL(`${ORIGIN}/c/${CODE}?r=generic`);
    const out = scrubLinkCodesIn({
      url,
      search: new URLSearchParams({ code: CODE, action: "confirm" }),
      boxed: new String(`/s/${CODE}`),
    });
    expect(out).toEqual({
      url: `${ORIGIN}/c/[code]?r=generic`,
      search: "code=[code]&action=confirm",
      boxed: "/s/[code]",
    });
    // The application's own URL object is not what was changed.
    expect(url.href).toBe(`${ORIGIN}/c/${CODE}?r=generic`);
  });

  it("a URL with no code in it is passed through as the same object", () => {
    const url = new URL(`${ORIGIN}/agenda`);
    const event = { url, when: new Date(0) };
    expect(scrubLinkCodesIn(event)).toBe(event);
  });

  it("an Error is read by its name, message and stack", () => {
    const error = new Error(`could not redeem at ${ORIGIN}/c/${CODE}`);
    const out = scrubLinkCodesIn({ data: { arguments: [error] } });
    const copy = out.data.arguments[0] as unknown as { name: string; message: string; stack: string };
    expect(copy.name).toBe("Error");
    expect(copy.message).toBe(`could not redeem at ${ORIGIN}/c/[code]`);
    expect(copy.stack).not.toContain(CODE);
    expect(error.message).toContain(CODE);

    const clean = new Error("nothing");
    const event = { data: { arguments: [clean] } };
    expect(scrubLinkCodesIn(event)).toBe(event);
  });

  it("a plain object's toJSON is never called: its fields are walked as data", () => {
    let calls = 0;
    const logged = {
      href: `/c/${CODE}`,
      toJSON() {
        calls += 1;
        return { href: this.href };
      },
    };
    const out = scrubLinkCodesIn({ logged });
    expect(calls).toBe(0);
    expect(out.logged.href).toBe("/c/[code]");
    // Serialised later, by the SDK, it is the copy that answers.
    expect(JSON.stringify(out)).not.toContain(CODE);
  });

  it("any other class instance is passed through by reference and not entered (a stated limit)", () => {
    // The SDK turns these into plain data before beforeSend and
    // beforeSendTransaction are called, and those hooks then read the result:
    // link-codes.envelope.test.ts sends one through the real SDK.
    class Holder {
      href = `/c/${CODE}`;
      toJSON() {
        return { href: this.href };
      }
    }
    const holder = new Holder();
    const out = scrubLinkCodesIn({ holder, url: `/s/${CODE}` });
    expect(out.url).toBe("/s/[code]");
    expect(out.holder).toBe(holder);
  });
});

describe("neverThrows - if the walk itself fails, the value still leaves, reduced and clean", () => {
  it("returns the top-level scalars, strings scrubbed, and nothing nested; says so once, with no payload", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const before = linkCodeScrubFailures();
    const event = {
      event_id: "e1",
      type: "transaction",
      level: "error",
      timestamp: 12.5,
      handled: false,
      transaction: `GET /c/${CODE}`,
      message: `failed at ${ORIGIN}/s/${CODE}`,
      // A top-level string, and still not kept: its name says what it is.
      cookie: "sb-session=synthetic",
      "http.request.body.data": "anything",
      request: { url: `${ORIGIN}/c/${CODE}`, headers: { referer: `/c/${CODE}` } },
      breadcrumbs: [{ message: `/c/${CODE}` }],
      get boom(): string {
        throw new Error("never called");
      },
    };
    const failing = (): typeof event => {
      throw new Error(`a failure whose text names /c/${CODE}`);
    };

    const first = neverThrows(event, failing);
    const second = neverThrows(event, failing);

    expect(first).toEqual({
      event_id: "e1",
      type: "transaction",
      level: "error",
      timestamp: 12.5,
      handled: false,
      transaction: "GET /c/[code]",
      message: `failed at ${ORIGIN}/s/[code]`,
    });
    expect(second).toEqual(first);
    expect(linkCodeScrubFailures()).toBe(before + 2);
    // One line however many failures, and nothing of the event or the error in it.
    if (before === 0) expect(warn).toHaveBeenCalledTimes(1);
    for (const call of warn.mock.calls) {
      expect(call).toHaveLength(1);
      expect(String(call[0])).not.toContain(CODE);
      expect(String(call[0])).not.toContain("a failure whose text");
    }
    warn.mockRestore();
  });

  it("a string, a number and an unreadable object each still come back as something", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = <T>(value: T): T => {
      throw new Error(`refused a ${typeof value}`);
    };
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(neverThrows(`/c/${CODE}`, failing)).toBe(UNREADABLE_MARK);
    expect(neverThrows(7, failing)).toBe(7);
    expect(neverThrows(null, failing)).toBe(null);
    expect(neverThrows(proxy, failing)).toEqual({});
    warn.mockRestore();
  });

  it("the real walk does not fail on any of the values above, so the counter did not move for them", () => {
    const before = linkCodeScrubFailures();
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    scrubLinkCodesIn({ proxy, deep: { get x(): never { throw new Error("x"); } } });
    scrubLinkCodesIn(proxy);
    expect(linkCodeScrubFailures()).toBe(before);
  });
});
