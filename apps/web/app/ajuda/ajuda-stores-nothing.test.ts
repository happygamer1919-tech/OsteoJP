/**
 * G1-6: SUPORTE E GUIA STORES NOTHING ABOUT WHO READ WHAT. No progress
 * tracking, no cookie, no browser storage, no server action and no database
 * write, by the owner's spec. The pages only order and trim a document that is
 * public in the repository, so nothing about a viewer is ever kept.
 *
 * A STATIC GUARD, BECAUSE ANY OF THESE WOULD RENDER FINE. A page that set a
 * cookie or wrote "lesson read" to localStorage would pass every render test.
 * So every source file under app/ajuda and lib/guide is read here and refused
 * if it names one of the mechanisms below. Test files are not shipped and are
 * skipped (this one names every mechanism on purpose).
 *
 * THE LIST IS OF MECHANISMS, NOT OF WORDS A LESSON MIGHT USE: guide-data.json
 * (the lessons) is not scanned, only code.
 *
 * Both arms are proved on seeded text at the end: each mechanism is caught,
 * and clean code is not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const DIRS = ["app/ajuda", "lib/guide"];

/** Each mechanism that could keep something about a viewer, and how it shows in code. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["a cookie", /cookie/i],
  ["next/headers (cookies and headers)", /["']next\/headers["']/],
  ["localStorage", /localStorage/],
  ["sessionStorage", /sessionStorage/],
  ["indexedDB", /indexedDB/i],
  ["the Cache API", /\bcaches\s*\./],
  ["a server action", /["']use server["']/],
  ["a form action", /\b(?:form)?[aA]ction\s*=\s*\{/],
  ["a beacon", /sendBeacon/],
  ["a network request", /\bfetch\s*\(/],
  ["the database package", /["']@osteojp\/db["']/],
  ["drizzle", /["']drizzle-orm/],
  ["a Postgres client", /["']postgres["']/],
  ["Supabase", /["']@supabase\/|["']@\/lib\/supabase/],
  ["a scoped database call", /\brunScoped\b/],
  ["an audit write", /["']@\/lib\/audit/],
];

/** What a source text uses from the list above, by name. */
function storageUses(source: string): string[] {
  return FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.test\.|test-fixture/.test(entry.name)) out.push(path);
  }
  return out;
}

const FILES = DIRS.flatMap((dir) => sourceFiles(join(WEB, dir))).map((path) => relative(WEB, path));

describe("G1-6: nothing under app/ajuda or lib/guide stores anything about the viewer", () => {
  it("finds the files it guards (the three pages, the layout, the renderer, the helpers)", () => {
    for (const file of [
      "app/ajuda/page.tsx",
      "app/ajuda/layout.tsx",
      "app/ajuda/[seccao]/page.tsx",
      "app/ajuda/[seccao]/[licao]/page.tsx",
      "app/ajuda/guide-blocks.tsx",
      "app/ajuda/ajuda-tabs.client.tsx",
      "lib/guide/guide.ts",
      "lib/guide/guide-routes.ts",
    ]) {
      expect(FILES, file).toContain(file);
    }
  });

  it("no source file there uses a cookie, browser storage, a server action, a request or the database", () => {
    const offences = FILES.flatMap((file) =>
      storageUses(readFileSync(join(WEB, file), "utf8")).map((use) => `${file}: ${use}`),
    );
    expect(offences).toEqual([]);
  });

  it("no source file there renders raw HTML (dangerouslySetInnerHTML)", () => {
    const offences = FILES.filter((file) => readFileSync(join(WEB, file), "utf8").includes("dangerouslySetInnerHTML"));
    expect(offences).toEqual([]);
  });
});

describe("the guard itself, on seeded code", () => {
  it("catches each mechanism", () => {
    const seeded: Record<string, string> = {
      "a cookie": `document.cookie = "lido=1";`,
      "next/headers (cookies and headers)": `import { cookies } from "next/headers";`,
      localStorage: `window.localStorage.setItem("lido", "1");`,
      sessionStorage: `sessionStorage.setItem("lido", "1");`,
      indexedDB: `const request = indexedDB.open("guia");`,
      "the Cache API": `await caches.open("guia");`,
      "a server action": `"use server";`,
      "a form action": `<form action={marcarLido}>`,
      "a beacon": `navigator.sendBeacon("/api/lido");`,
      "a network request": `await fetch("/api/lido", { method: "POST" });`,
      "the database package": `import { users } from "@osteojp/db";`,
      drizzle: `import { eq } from "drizzle-orm";`,
      "a Postgres client": `import postgres from "postgres";`,
      Supabase: `import { createSupabaseServerClient } from "@/lib/supabase/server";`,
      "a scoped database call": `await runScoped(ctx, (tx) => tx.insert(leituras));`,
      "an audit write": `import { writeAudit } from "@/lib/audit/write";`,
    };
    expect(Object.keys(seeded).sort()).toEqual(FORBIDDEN.map(([name]) => name).sort());
    for (const [name, code] of Object.entries(seeded)) expect(storageUses(code), name).toContain(name);
  });

  it("passes code that stores nothing", () => {
    const clean = [
      `import { redirect } from "next/navigation";`,
      `const ctx = await getRequestContext();`,
      `router.push(ajudaTabHref(value));`,
      `<Link href={lessonHref(lesson)}>{lesson.title}</Link>`,
      `const lessons = guideLessonsFor(role);`,
    ].join("\n");
    expect(storageUses(clean)).toEqual([]);
  });
});
