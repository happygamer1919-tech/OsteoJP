import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  actionImports,
  AGENDA_ENTRIES,
  APP,
  codeOnly,
  isUseServerModule,
  reachableFrom,
  stripComments,
} from "@/lib/testing/module-graph";

/**
 * SKEW-01 S1 - THE REGISTER: every server-action call on /agenda goes through
 * the wrapper, and this fails, naming the file and line, on any that does not.
 *
 * WHAT IS CHECKED. In each registered file, every name bound to a server
 * action may appear only as the forms below. "Bound to a server action" is
 * resolved and read, not guessed from the path (lib/testing/module-graph.ts):
 * a named, aliased, default or mixed import from a "use server" module, or from
 * a module that re-exports one (`export { a } from`, `export * from`, or an
 * import that is exported again). A namespace or dynamic import of such a
 * module fails outright. The forms:
 *
 *   - a call written exactly `runAction(() => name(`, the wrapper's thunk;
 *   - a type position (`typeof name`);
 *   - `action={name}` on a <form>, and only where the register says so: the
 *     logout form's no-JavaScript fallback, which JavaScript intercepts in
 *     onSubmit and sends through runAction.
 *
 * Any other appearance fails: a direct call, a `.then` chain, a `.bind`, or the
 * function handed to something else that could call it unwrapped. Comments are
 * stripped first, so prose naming an action cannot trip it.
 *
 * THE COUNT IS PINNED PER FILE, 28 IN ALL: the call sites re-derived by the
 * SKEW-01 map and its critic. A call that silently disappears reddens the count
 * as surely as one that goes around the wrapper.
 *
 * COMPLETENESS. The import graph is walked from /agenda's own route files
 * (page, layout, error, loading), following relative and `@/` imports the way
 * the SKEW-01 map did, and every module it reaches that imports a "use server"
 * module must be registered here. A new file cannot add an unwrapped call on
 * /agenda simply by not being on the list. app-shell.tsx, the server component
 * that used to hold `<form action={logout}>`, must import no action at all.
 *
 * THE SCANNER PROVES ITSELF on inline fixtures below, both ways: seeded
 * violations are found on the right line, and correct code finds nothing.
 */

type Entry = { file: string; calls: number; formActionFallback?: string[] };

const REGISTER: Entry[] = [
  { file: "app/agenda/appointment-drawer.tsx", calls: 18 },
  { file: "app/agenda/appointment-notes-board.tsx", calls: 3 },
  { file: "app/agenda/availability-panel.tsx", calls: 1 },
  { file: "app/agenda/block-time-dialog.tsx", calls: 2 },
  { file: "app/agenda/schedule-again-drawer.tsx", calls: 1 },
  { file: "app/patients/[id]/notes-list.tsx", calls: 2 },
  { file: "components/logout-form.client.tsx", calls: 1, formActionFallback: ["logout"] },
];

export type Finding = { line: number; name: string; problem: string };

/**
 * Every appearance of an action name in `code` (comments already stripped),
 * outside the given import spans, classified. Returns the violations and the
 * number of wrapped calls.
 */
export function scan(
  code: string,
  names: string[],
  spans: Array<[number, number]>,
  formActionFallback: string[] = [],
): { violations: Finding[]; wrapped: number } {
  const violations: Finding[] = [];
  let wrapped = 0;
  const lineOf = (index: number) => code.slice(0, index).split("\n").length;
  for (const name of names) {
    const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`, "g");
    for (const m of code.matchAll(re)) {
      const at = m.index!;
      if (spans.some(([a, b]) => at >= a && at < b)) continue;
      const before = code.slice(Math.max(0, at - 200), at);
      const after = code.slice(at + name.length);
      if (/\btypeof\s+$/.test(before)) continue;
      if (/^\s*\(/.test(after)) {
        if (/\brunAction\(\s*\(\)\s*=>\s*$/.test(before)) wrapped += 1;
        else violations.push({ line: lineOf(at), name, problem: "calls a server action without runAction" });
        continue;
      }
      if (formActionFallback.includes(name) && /\baction=\{\s*$/.test(before) && /^\s*\}/.test(after)) continue;
      violations.push({
        line: lineOf(at),
        name,
        problem: "passes a server action on as a value, where it can be called without runAction",
      });
    }
  }
  violations.sort((a, b) => a.line - b.line);
  return { violations, wrapped };
}

describe("SKEW-01 register: every server-action call on /agenda goes through runAction", () => {
  for (const entry of REGISTER) {
    it(`${entry.file}: ${entry.calls} call(s), every one wrapped`, () => {
      const file = join(APP, entry.file);
      const raw = readFileSync(file, "utf8");
      const imports = actionImports(file, stripComments(raw));
      expect(imports.namespaceImports, `${entry.file} imports a "use server" module as a namespace`).toEqual([]);
      expect(imports.names.length, `${entry.file} imports no server action; the register is stale`).toBeGreaterThan(0);
      const { violations, wrapped } = scan(codeOnly(raw), imports.names, imports.spans, entry.formActionFallback);
      expect(
        violations.map((v) => `${entry.file}:${v.line} ${v.name} ${v.problem}`),
        "a server-action call that does not go through runAction",
      ).toEqual([]);
      expect(wrapped, `${entry.file}: wrapped call count moved; update the register with the PR`).toBe(entry.calls);
    });
  }

  it("the register holds the 28 call sites of the SKEW-01 map", () => {
    expect(REGISTER.reduce((n, e) => n + e.calls, 0)).toBe(28);
  });

  it("every module reachable from /agenda that imports a server action is registered", () => {
    const registered = new Set(REGISTER.map((e) => e.file));
    const reachable = reachableFrom(AGENDA_ENTRIES);
    const importers: string[] = [];
    for (const file of reachable) {
      if (isUseServerModule(file)) continue;
      const { names, namespaceImports } = actionImports(file, stripComments(readFileSync(file, "utf8")));
      if (names.length + namespaceImports.length > 0) importers.push(relative(APP, file));
    }
    // Not vacuous: the walk reaches the whole agenda tree (142 app modules on
    // 2026-09-27; @osteojp packages are not followed, and hold no "use server"
    // module), every registered file among it, and exactly the registered
    // importers.
    expect(reachable.size).toBeGreaterThan(100);
    for (const e of REGISTER) expect(reachable.has(join(APP, e.file)), `${e.file} is not reachable from /agenda`).toBe(true);
    expect(importers.sort()).toEqual([...registered].sort());
  });

  it("app-shell.tsx (a server component) imports no server action: the logout form is the client component", () => {
    const file = join(APP, "components/app-shell.tsx");
    const code = stripComments(readFileSync(file, "utf8"));
    expect(actionImports(file, code).names).toEqual([]);
    expect(code).toContain("<LogoutForm");
  });
});

describe("the scanner proves itself", () => {
  const names = ["createAppointment", "searchPatientsAction", "logout"];

  it("finds a direct call, on its line", () => {
    const code = codeOnly(
      ["const a = 1;", "async function f() {", "  const r = await createAppointment(x);", "}"].join("\n"),
    );
    expect(scan(code, names, []).violations).toEqual([
      { line: 3, name: "createAppointment", problem: "calls a server action without runAction" },
    ]);
  });

  it("finds a promise chain and a bind", () => {
    const code = codeOnly(
      ["searchPatientsAction(q).then(set);", "const g = createAppointment.bind(null, 1);"].join("\n"),
    );
    expect(scan(code, names, []).violations.map((v) => [v.line, v.name])).toEqual([
      [1, "searchPatientsAction"],
      [2, "createAppointment"],
    ]);
  });

  it("finds an action handed on as a value", () => {
    const code = codeOnly("<Child onSave={createAppointment} />");
    expect(scan(code, names, []).violations).toHaveLength(1);
  });

  it("finds a form action that the register does not allow", () => {
    const code = codeOnly("<form action={logout}></form>");
    expect(scan(code, names, []).violations).toHaveLength(1);
    expect(scan(code, names, [], ["logout"]).violations).toEqual([]);
  });

  it("finds a call inside the thunk that is not the thunk's own call", () => {
    const code = codeOnly("runAction(() => ok ? createAppointment(a) : searchPatientsAction(b), o);");
    const { violations, wrapped } = scan(code, names, []);
    expect(wrapped).toBe(0);
    expect(violations).toHaveLength(2);
  });

  it("finds NOTHING in correct code: wrapped calls, a type position and comments", () => {
    const code = codeOnly(
      [
        "// createAppointment(x) in a line comment",
        "/* searchPatientsAction(q) in a block",
        "   comment */",
        "type P = Parameters<typeof createAppointment>[0];",
        "const out = await runAction(() => createAppointment(x), { kind: 'write', retry });",
        "void runAction(() =>",
        "  searchPatientsAction(q), { kind: 'read', retry });",
        "const url = 'https://example.test/createAppointment';",
      ].join("\n"),
    );
    const result = scan(code, names, []);
    expect(result.violations).toEqual([]);
    expect(result.wrapped).toBe(2);
  });

  it("keeps line numbers true across a stripped block comment", () => {
    const code = codeOnly(["/*", " * a", " */", "createAppointment(1);"].join("\n"));
    expect(scan(code, names, []).violations[0]?.line).toBe(4);
  });

  describe("which imported names are server actions (fixtures on disk)", () => {
    const dir = mkdtempSync(join(tmpdir(), "skew01-register-"));
    const write = (name: string, body: string) => {
      const path = join(dir, name);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, body);
      return path;
    };
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    write(
      "actions.ts",
      [
        '"use server";',
        "export async function saveThing() {}",
        "export const listThings = async () => [];",
        "export default async function removeThing() {}",
      ].join("\n"),
    );
    write("helpers.ts", "export function formatThing() { return ''; }");
    write(
      "barrel.ts",
      [
        'export { saveThing as persist } from "./actions";',
        'export * from "./actions";',
        'import { listThings } from "./actions";',
        "export { listThings as fetchAll };",
        'export { formatThing } from "./helpers";',
      ].join("\n"),
    );

    const importsOf = (body: string) => {
      const file = write(`consumer-${Math.random().toString(36).slice(2)}.tsx`, body);
      return actionImports(file, stripComments(body));
    };

    it("a DEFAULT import, and a default mixed with named ones, are actions", () => {
      expect(importsOf('import removeThing from "./actions";').names).toEqual(["removeThing"]);
      expect(importsOf('import drop, { saveThing as keep } from "./actions";').names).toEqual(["drop", "keep"]);
    });

    it("an action RE-EXPORTED through a module that is not 'use server' is still an action", () => {
      const { names } = importsOf('import { persist, listThings, fetchAll, formatThing } from "./barrel";');
      expect(names).toEqual(["persist", "listThings", "fetchAll"]);
    });

    it("a namespace or dynamic import of either is refused outright", () => {
      expect(importsOf('import * as a from "./actions";').namespaceImports).toEqual(["a"]);
      expect(importsOf('import * as b from "./barrel";').namespaceImports).toEqual(["b"]);
      expect(importsOf('const m = await import("./barrel");').namespaceImports).toEqual(['import("./barrel")']);
    });

    it("a module that exports no action binds nothing, and a type import binds nothing", () => {
      expect(importsOf('import { formatThing } from "./helpers";').names).toEqual([]);
      expect(importsOf('import type { saveThing } from "./actions";').names).toEqual([]);
    });

    it("a default-imported action called directly is found by the scan", () => {
      const body = ['import drop from "./actions";', "export function f() {", "  void drop();", "}"].join("\n");
      const imports = importsOf(body);
      expect(scan(codeOnly(body), imports.names, imports.spans).violations).toEqual([
        { line: 3, name: "drop", problem: "calls a server action without runAction" },
      ]);
    });
  });

  it("reads a real module's directive: lib/scheduling/actions.ts is a use-server module", () => {
    expect(isUseServerModule(join(APP, "lib/scheduling/actions.ts"))).toBe(true);
    expect(isUseServerModule(join(APP, "lib/actions/run-action.ts"))).toBe(false);
  });
});
