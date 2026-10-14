import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { generateConfirmCode } from "../reminders/confirm-code";
import { signRescheduleToken } from "../reminders/link-token";
import { scrubLinkCodesIn } from "./link-codes";

/**
 * OBS-07 - one sweep over generated events, instead of one more hand-picked
 * case per review round.
 *
 * Half the events carry a code the real issuer produced, or a reschedule token
 * the real signer produced (OBS-08), written in one of the shapes link-codes.ts
 * knows, with the route letters and the field name of that kind of secret, at a place picked at random: any string in the
 * event, an object key, a field named `code`, the router's state as an array,
 * a frame's variables, the name of an inline script's frame. The assertion is
 * on the serialised output: the code is not in it.
 *
 * The other half carry none, and are built from strings chosen to look like
 * they might: routes that start with c or s, ids, font and chunk urls, error
 * codes. Each must come back as the very same object, deep-equal to a copy
 * taken before.
 *
 * The generator is seeded, so a failure names an event that can be rebuilt.
 *
 * What it does NOT cover, by construction: a code that stands bare with no
 * marker in front of it. That limit is pinned in link-codes.test.ts.
 */

const ORIGIN = "https://app.example.invalid";
const EVENTS = 12_000;

/** mulberry32: small, seeded, good enough to pick shapes with. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Strings with no code in them, picked because a careless rule would touch them. */
const CLEAN: readonly string[] = [
  "/clientes",
  "/clientes/123/editar",
  "/settings?tab=horarios",
  "os clientes",
  "password",
  "GET /agenda",
  "GET /c/[code]",
  "/s/[code]?r=generic",
  "/c/",
  "/c/abc",
  "/s/not-a-real-code-at-all",
  "0123abcd456789ef0123abcd456789ef",
  "0123abcd01234567",
  "https://fonts.gstatic.com/s/inter/v12/abc.woff2",
  "https://cdn.example.invalid/c/assets/a.js",
  `${ORIGIN}/_next/static/chunks/app/(public)/c/%5Bcode%5D/page-1a2b3c.js`,
  "/var/task/apps/web/.next/server/app/s/[code]/page.js",
  "code=23505",
  "code=ECONNREFUSED",
  "barcode=12345678",
  "postal_code=12345678",
  "the code, password is wrong",
  "5 m/s/s",
  "C:/c/Users",
  "marcar+consulta+amanha",
  "%2Fagenda%3Fdia%3D2026-10-13",
  "pt-PT",
  "/r/some-token",
  "/r/[token]?a=confirm",
  "/reminders",
  "token=expired",
  "the token, which was refused",
  "",
];

/** One kind of secret: the two route letters that carry it, and its field name. */
type Kind = { a: string; b: string; name: string };
const CODE_KIND: Kind = { a: "c", b: "s", name: "code" };
const TOKEN_KIND: Kind = { a: "r", b: "r", name: "token" };

type Shape = [name: string, write: (code: string, k: Kind) => string];

const tree = (code: string, k: Kind) =>
  `["",{"children":["${k.a}",{"children":[["${k.name}","${code}","d"],{"children":["__PAGE__",{}]}]}]}]`;

const SHAPES: readonly Shape[] = [
  ["path", (c, k) => `/${k.a}/${c}`],
  ["path with a query", (c, k) => `/${k.b}/${c}?r=generic`],
  ["absolute", (c, k) => `${ORIGIN}/${k.a}/${c}`],
  ["absolute with a port", (c, k) => `http://localhost:3020/${k.b}/${c}/`],
  ["bare host", (c, k) => `app.example.invalid/${k.a}/${c}`],
  ["then a full stop", (c, k) => `/${k.a}/${c}.`],
  ["then a colon", (c, k) => `/${k.a}/${c}:12:3`],
  ["then an exclamation mark", (c, k) => `/${k.b}/${c}!`],
  ["in square brackets", (c, k) => `[/${k.a}/${c}]`],
  ["in quotes", (c, k) => `"/${k.b}/${c}"`],
  ["in round brackets", (c, k) => `(/${k.a}/${c})`],
  ["behind a locale", (c, k) => `${ORIGIN}/pt/${k.a}/${c}`],
  ["a data route", (c, k) => `/_next/data/build/${k.a}/${c}.json`],
  ["a segment prefetch", (c, k) => `/_next/segments/${k.b}/${c}/__PAGE__`],
  ["upper case letter", (c, k) => `/${k.a.toUpperCase()}/${c}`],
  ["doubled slash", (c, k) => `/${k.a}//${c}`],
  ["encoded", (c, k) => `next=%2F${k.a}%2F${c}`],
  ["encoded, lower case", (c, k) => `%2f${k.b}%2f${c}%3Fr%3Dgeneric`],
  ["encoded twice", (c, k) => `r=%252F${k.a}%252F${c}`],
  ["encoded three times", (c, k) => `r=%25252F${k.b}%25252F${c}`],
  ["mixed, encoded first", (c, k) => `%2F${k.a}/${c}`],
  ["mixed, plain first", (c, k) => `/${k.b}%2F${c}`],
  ["JSON escaped slashes", (c, k) => `{"url":"\\/${k.a}\\/${c}"}`],
  ["form body", (c, k) => `${k.name}=${c}&action=confirm`],
  ["query parameter", (c, k) => `/x?a=1&${k.name}=${c}`],
  ["query parameter, encoded", (c, k) => `next=%2Fx%3F${k.name}%3D${c}`],
  ["server action field", (c, k) => `1_${k.name}=${c}`],
  ["JSON field", (c, k) => `{"${k.name}":"${c}"}`],
  ["JSON field, spaced", (c, k) => `{"${k.name}": "${c}"}`],
  ["JSON field inside JSON", (c, k) => `{\\"${k.name}\\":\\"${c}\\"}`],
  ["JSON field, encoded", (c, k) => encodeURIComponent(`{"${k.name}":"${c}"}`)],
  ["console object", (c, k) => `{ ${k.name}: '${c}' }`],
  ["label and value", (c, k) => `${k.name}: ${c}`],
  ["router state", (c, k) => tree(c, k)],
  ["router state, encoded", (c, k) => encodeURIComponent(tree(c, k))],
  ["router state, encoded twice", (c, k) => encodeURIComponent(encodeURIComponent(tree(c, k)))],
  ["router state inside JSON", (c, k) => tree(c, k).replace(/"/g, '\\"')],
  ["router state, spaced", (c, k) => `[["${k.name}", "${c}", "d"],{}]`],
  ["route parameter from Vercel", (c, k) => `/${k.a}/x?nxtP${k.name}=${c}`],
  ["route matches", (c, k) => `1=${c}&nxtP${k.name}=${c}`],
  ["route matches, encoded", (c, k) => encodeURIComponent(`1=${c}&nxtP${k.name}=${c}`)],
  ["route match alone", (c) => `1=${c}`],
];

const SITES = ["a string anywhere", "an object key", "a field named code", "the state as an array", "frame variables", "an inline frame's name"] as const;
type Site = (typeof SITES)[number];

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function build(random: () => number) {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const text = () => pick(CLEAN);

  const filler = (depth: number): Json => {
    const roll = random();
    if (depth > 4 || roll < 0.45) return text();
    if (roll < 0.55) return Math.floor(random() * 1000);
    if (roll < 0.6) return random() < 0.5;
    if (roll < 0.65) return null;
    if (roll < 0.8) return Array.from({ length: Math.floor(random() * 4) }, () => filler(depth + 1));
    const out: { [key: string]: Json } = {};
    const keys = Math.floor(random() * 4);
    for (let i = 0; i < keys; i += 1) out[`k${i}_${pick(["url", "href", "note", "code", "frames", "data"])}`] = filler(depth + 1);
    return out;
  };

  const frames = (): Json[] =>
    Array.from({ length: 1 + Math.floor(random() * 3) }, () => ({
      filename: pick(CLEAN.filter((s) => s.includes("/"))),
      abs_path: text(),
      function: "onSubmit",
      context_line: "const code = generate();",
      lineno: 1,
      vars: { n: 1, note: text() },
    }));

  const event: { [key: string]: Json } = {
    event_id: "0123abcd456789ef0123abcd456789ef",
    level: "error",
    message: text(),
    transaction: text(),
    // No `data` and no cookie here. A request body is removed whole whatever
    // it holds (link-codes.hooks.test.ts and link-codes.body.test.ts), so a
    // clean event that had one would not come back as the same object.
    request: { url: text(), method: "POST", query_string: text(), headers: { referer: text(), "next-url": text() } },
    tags: { route: text(), a: text() },
    extra: { one: filler(0), two: filler(0) },
    contexts: { trace: { trace_id: "0123abcd456789ef0123abcd456789ef", span_id: "0123abcd01234567", data: { "url.full": text() } } },
    breadcrumbs: [
      { category: "navigation", data: { from: text(), to: text() } },
      { category: "console", message: text(), data: { arguments: [filler(0), filler(0)] } },
    ],
    spans: [{ span_id: "a1", description: text(), data: { "http.url": text(), "http.target": text() } }],
    exception: { values: [{ type: "Error", value: text(), stacktrace: { frames: frames() } }] },
    debug_meta: { images: [{ type: "sourcemap", code_file: text(), debug_id: "d-1" }] },
  };
  return { event, pick, text };
}

/** Every [container, key] that holds a string and is not part of a stack frame or a debug image. */
function stringSlots(root: Json): Array<[container: Json[] | { [key: string]: Json }, key: string | number]> {
  const slots: Array<[Json[] | { [key: string]: Json }, string | number]> = [];
  const visit = (value: Json, underKey: string) => {
    if (value === null || typeof value !== "object") return;
    if (underKey === "stacktrace" || underKey === "debug_meta") return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === "string") slots.push([value, i]);
        else visit(item, "");
      });
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") slots.push([value, key]);
      else visit(item, key);
    }
  };
  visit(root, "");
  return slots;
}

function objects(root: Json): Array<{ [key: string]: Json }> {
  const found: Array<{ [key: string]: Json }> = [];
  const visit = (value: Json, underKey: string) => {
    if (value === null || typeof value !== "object") return;
    if (underKey === "stacktrace" || underKey === "debug_meta") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, ""));
      return;
    }
    found.push(value);
    for (const [key, item] of Object.entries(value)) visit(item, key);
  };
  visit(root, "");
  return found;
}

/** A reschedule token as the app signs it, under a synthetic secret. */
function rescheduleToken(): string {
  vi.stubEnv("REMINDERS_LINK_SECRET", "synthetic-test-secret-for-the-link-code-sweep");
  try {
    return signRescheduleToken({
      tenantId: randomUUID(),
      appointmentId: randomUUID(),
      exp: 1_900_000_000,
      scope: "confirm_cancel",
    });
  } finally {
    vi.unstubAllEnvs();
  }
}

describe("a sweep of generated events", () => {
  it(`${EVENTS} events: a planted code never survives, and an event with none comes back untouched`, () => {
    const random = seeded(20261013);
    const stats = {
      events: 0,
      planted: 0,
      clean: 0,
      leaks: [] as string[],
      cleanChanged: [] as number[],
      inputMutated: [] as number[],
      bySite: {} as Record<Site, number>,
      byKind: {} as Record<string, number>,
      byShape: {} as Record<string, number>,
    };

    for (let n = 0; n < EVENTS; n += 1) {
      const { event, pick, text } = build(random);
      stats.events += 1;

      if (n % 2 === 1) {
        stats.clean += 1;
        const snapshot = structuredClone(event);
        const out = scrubLinkCodesIn(event);
        if (out !== event) stats.cleanChanged.push(n);
        expect(out).toEqual(snapshot);
        continue;
      }

      stats.planted += 1;
      const kind = n % 4 === 0 ? TOKEN_KIND : CODE_KIND;
      const code = kind === TOKEN_KIND ? rescheduleToken() : generateConfirmCode();
      stats.byKind[kind.name] = (stats.byKind[kind.name] ?? 0) + 1;
      const site = pick(SITES);
      const [shapeName, write] = pick(SHAPES);
      // A space on either side, or nothing: glued to a letter, `code=` would be
      // another name and the code nine characters, and neither is a carrier.
      const carried = `${pick(["", "", `${text()} `])}${write(code, kind)}${pick(["", "", ` ${text()}`])}`;
      let label: string = site;

      if (site === "a string anywhere") {
        const [container, key] = pick(stringSlots(event));
        (container as Record<string | number, Json>)[key] = carried;
        label = `${site} / ${shapeName}`;
        stats.byShape[shapeName] = (stats.byShape[shapeName] ?? 0) + 1;
      } else if (site === "an object key") {
        pick(objects(event))[carried] = text();
        label = `${site} / ${shapeName}`;
        stats.byShape[shapeName] = (stats.byShape[shapeName] ?? 0) + 1;
      } else if (site === "a field named code") {
        pick(objects(event))[pick([kind.name, kind.name.toUpperCase(), `1_${kind.name}`])] = code;
      } else if (site === "the state as an array") {
        pick(objects(event)).tree = ["", { children: [[kind.name, code, "d"], {}] }];
      } else {
        const values = (event.exception as { values: Array<{ stacktrace: { frames: Array<{ [key: string]: Json }> } }> }).values;
        const frame = pick(values[0]?.stacktrace.frames ?? []);
        if (site === "frame variables") {
          frame.vars = { [kind.name]: code, href: carried };
          stats.byShape[shapeName] = (stats.byShape[shapeName] ?? 0) + 1;
        } else {
          const page = pick([`${ORIGIN}/${kind.a}/${code}`, `${ORIGIN}/${kind.b}/${code}?r=generic`, `/${kind.a}/${code}`]);
          frame.filename = page;
          frame.abs_path = page;
        }
      }
      stats.bySite[site] = (stats.bySite[site] ?? 0) + 1;

      const before = JSON.stringify(event);
      expect(before).toContain(code);

      const out = scrubLinkCodesIn(event);

      if (JSON.stringify(out).includes(code)) stats.leaks.push(`event ${n}: ${label}`);
      if (JSON.stringify(event) !== before) stats.inputMutated.push(n);
    }

    if (process.env.LINK_CODE_SWEEP_REPORT === "1") {
      process.stdout.write(
        `${JSON.stringify({ ...stats, shapes: SHAPES.length, shapesUsed: Object.keys(stats.byShape).length })}\n`,
      );
    }

    expect(stats.leaks).toEqual([]);
    expect(stats.cleanChanged).toEqual([]);
    expect(stats.inputMutated).toEqual([]);
    expect(stats.planted).toBe(EVENTS / 2);
    expect(stats.clean).toBe(EVENTS / 2);
    // Every site and every shape was actually exercised.
    expect(Object.keys(stats.bySite).sort()).toEqual([...SITES].sort());
    expect(Object.keys(stats.byShape)).toHaveLength(SHAPES.length);
    expect(stats.byKind).toEqual({ code: (EVENTS / 2) * 0.5, token: (EVENTS / 2) * 0.5 });
  });
});
