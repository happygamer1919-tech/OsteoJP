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
 * AND AN IMPORT ALLOWLIST, BECAUSE A NAME CHECK SEES ONLY THIS FOLDER. A file
 * here that imported an existing helper which writes localStorage (the
 * agenda's view preference) or a module of server actions would name none of
 * the mechanisms above and pass. So every import of every source file here is
 * read too, and it must be either another file under app/ajuda or lib/guide
 * (held to this same test) or one of the few outside modules listed in
 * ALLOWED_OUTSIDE, each with the reason it keeps nothing. A new import fails
 * this test until someone reads that module and adds it here.
 *
 * Both arms are proved on seeded text at the end: each mechanism and each
 * refused import is caught, and clean code is not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

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

/** The two folders whose every source file this test reads, as apps/web paths. */
const GUARDED = DIRS.map((dir) => `${dir}/`);

/**
 * The modules outside app/ajuda and lib/guide that a file here may import, and
 * why each keeps nothing about who read what. Packages by name; app modules as
 * their path under apps/web, without the extension.
 */
const ALLOWED_OUTSIDE: Readonly<Record<string, string>> = {
  react: "React itself: elements and types.",
  "next/link": "A link to another page.",
  "next/navigation": "redirect, notFound and the router: they move the address, nothing more.",
  "lucide-react": "Icons.",
  "@osteojp/ui": "The platform components (GlassPanel, GlassCard, EmptyState, Tabs).",
  "@osteojp/auth": "The role and capability names, and can(), a fixed table.",
  "lib/auth/context":
    "Reads the viewer's session to learn the role (requireRequestContext), as every staff page does; it keeps nothing about the guide, and reports to Sentry only an Auth outage.",
  "lib/i18n": "The interface strings.",
  "components/app-shell": "The staff shell every staff section renders (the layout); it is the same on every page and knows nothing of /ajuda.",
};

/** Every module a source text imports or re-exports, as written, plus a marker for an import of a computed path. */
function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const pattern of [
    /\bfrom\s*["']([^"']+)["']/g, // import ... from "x", export ... from "x"
    /\bimport\s*["']([^"']+)["']/g, // import "x"
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // import("x")
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("x")
  ]) {
    for (const match of source.matchAll(pattern)) out.push(match[1]!);
  }
  if (/\b(?:import|require)\s*\(\s*[^"'\s)]/.test(source)) out.push("(a computed path)");
  return out;
}

/** Where an import from `file` (a path under apps/web) points: a package name, or a path under apps/web without its extension. */
function importTarget(file: string, specifier: string): string {
  const strip = (path: string) => path.replace(/\.(?:tsx?|jsx?|mjs)$/, "");
  if (specifier.startsWith("@/")) return strip(posix.normalize(specifier.slice(2)));
  if (specifier.startsWith(".")) return strip(posix.normalize(posix.join(posix.dirname(file), specifier)));
  return specifier;
}

/** The imports of `file` (a path under apps/web, its text `source`) that are neither under a guarded folder nor allowed. */
function refusedImports(file: string, source: string): string[] {
  return importSpecifiers(source)
    .filter((specifier) => {
      const target = importTarget(file, specifier);
      if (GUARDED.some((dir) => target.startsWith(dir))) return false;
      return !Object.hasOwn(ALLOWED_OUTSIDE, target);
    })
    .map((specifier) => `${file}: ${specifier}`);
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

const FILES = DIRS.flatMap((dir) => sourceFiles(join(WEB, dir))).map((path) => relative(WEB, path).split(sep).join("/"));

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

  it("no source file there imports a module outside app/ajuda and lib/guide that is not on the allowlist", () => {
    const offences = FILES.flatMap((file) => refusedImports(file, readFileSync(join(WEB, file), "utf8")));
    expect(offences).toEqual([]);
  });

  it("every allowlisted outside module is imported by some file there, so the list holds nothing stale", () => {
    const used = new Set(
      FILES.flatMap((file) =>
        importSpecifiers(readFileSync(join(WEB, file), "utf8")).map((specifier) => importTarget(file, specifier)),
      ),
    );
    expect(Object.keys(ALLOWED_OUTSIDE).filter((target) => !used.has(target))).toEqual([]);
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

  it("refuses an import from outside the two folders that is not on the allowlist", () => {
    const page = "app/ajuda/page.tsx";
    const lesson = "app/ajuda/[seccao]/[licao]/page.tsx";
    const refused: [string, string][] = [
      // An existing helper that writes localStorage.
      [page, `import { rememberAgendaView } from "@/lib/scheduling/agenda-view-preference";`],
      // An existing module of server actions, by alias and by a relative path out of the folder.
      [page, `import { saveSettings } from "@/app/admin/settings/actions";`],
      [lesson, `import { saveSettings } from "../../../admin/settings/actions";`],
      // An alias that climbs out of a guarded folder.
      [page, `import { saveSettings } from "@/lib/guide/../../app/admin/settings/actions";`],
      [page, `export { saveSettings } from "@/app/admin/settings/actions";`],
      [page, `import "@/lib/telemetry";`],
      [page, `const m = await import("@/lib/scheduling/agenda-view-preference");`],
      [page, `const m = require("idb-keyval");`],
      [page, `const m = await import(modulePath);`],
      // A subpath of an allowed package is not the package.
      [page, `import { something } from "@osteojp/ui/internal";`],
    ];
    for (const [file, code] of refused) expect(refusedImports(file, code), code).toHaveLength(1);
  });

  it("passes the imports the pages use: the two folders, by alias and relative path, and the allowlist", () => {
    const allowed: [string, string][] = [
      ["app/ajuda/[seccao]/[licao]/page.tsx", `import { GuideBody } from "../../guide-blocks";`],
      ["app/ajuda/page.tsx", `import { AjudaTabs } from "./ajuda-tabs.client";`],
      ["app/ajuda/page.tsx", `import { guideFaqFor } from "@/lib/guide/guide";`],
      ["lib/guide/guide.ts", `import guideJson from "./guide-data.json";`],
      ["lib/guide/guide-routes.ts", `import {\n  GUIDE_DATA,\n  blocksFor,\n} from "./guide";`],
      ["app/ajuda/layout.tsx", `import { AppShell } from "@/components/app-shell";`],
      ["app/ajuda/page.tsx", `import type { Role } from "@osteojp/auth";`],
      ["app/ajuda/guide-chrome.tsx", `import Link from "next/link";`],
    ];
    for (const [file, code] of allowed) expect(refusedImports(file, code), code).toEqual([]);
  });

  it("passes code that stores nothing", () => {
    const clean = [
      `import { redirect } from "next/navigation";`,
      `const ctx = await requireRequestContext();`,
      `router.push(ajudaTabHref(value));`,
      `<Link href={lessonHref(lesson)}>{lesson.title}</Link>`,
      `const lessons = guideLessonsFor(role);`,
    ].join("\n");
    expect(storageUses(clean)).toEqual([]);
  });
});
