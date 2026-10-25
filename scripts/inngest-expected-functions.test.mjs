// R6: the count the auto-sync workflow expects from code must follow the code,
// and must refuse to count anything it cannot read for certain.
//
// Each refusal case below is a shape that, if the reader guessed, would make the
// workflow compare a live deployment against a wrong number: a route serving a
// different list, an entry that is not a function, an entry counted twice, a
// commented-out entry. The last real-repo case pins nothing but the agreement
// between the reader and the code's own createFunction declarations, so adding
// a function moves the number with no edit here.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_ROOT, expectedFunctions, main } from "./inngest-expected-functions.mjs";

const ROUTE_OK = `import { serve } from "inngest/next";
import { inngest } from "@/lib/reminders/inngest/client";
import { servedFunctions } from "@/lib/reminders/inngest/served";
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: servedFunctions,
});
`;

const SERVED_OK = `import { functions } from "./functions";
import { purgeDaily } from "@/lib/other/retention";
export const servedFunctions = [...functions, purgeDaily];
`;

const FUNCTIONS_OK = `import { inngest } from "./client";
import { sweep } from "./sweep";
export const one = inngest.createFunction({ id: "one" }, async () => {});
export const two = inngest.createFunction({ id: "two" }, async () => {});
export const functions = [
  one,
  two,
  sweep,
];
`;

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "r6-expected-"));
  const all = {
    "apps/web/app/api/inngest/route.ts": ROUTE_OK,
    "apps/web/lib/reminders/inngest/served.ts": SERVED_OK,
    "apps/web/lib/reminders/inngest/functions.ts": FUNCTIONS_OK,
    "apps/web/lib/reminders/inngest/sweep.ts": `export const sweep = inngest.createFunction({ id: "s" }, async () => {});\n`,
    "apps/web/lib/other/retention.ts": `export const purgeDaily = inngest.createFunction({ id: "p" }, async () => {});\n`,
    ...files,
  };
  for (const [rel, body] of Object.entries(all)) {
    if (body === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

function run(root, argv = []) {
  const out = [];
  const errs = [];
  const code = main(argv, { root, log: (l) => out.push(l), err: (l) => errs.push(l) });
  return { code, out: out.join("\n"), err: errs.join("\n") };
}

test("counts identifiers and follows spreads through @/ and ./ imports", () => {
  const root = fixture({});
  try {
    const r = run(root);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, "4");
    assert.deepEqual(expectedFunctions(root).map((f) => f.id), ["one", "two", "sweep", "purgeDaily"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adding a function to the list moves the count with no other edit", () => {
  const root = fixture({
    "apps/web/lib/reminders/inngest/functions.ts": FUNCTIONS_OK
      .replace("export const functions", `export const three = inngest.createFunction({ id: "three" }, async () => {});\nexport const functions`)
      .replace("  sweep,\n", "  sweep,\n  three,\n"),
  });
  try {
    assert.equal(run(root).out, "5");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a commented-out entry is not counted", () => {
  const root = fixture({
    "apps/web/lib/reminders/inngest/functions.ts": FUNCTIONS_OK.replace("  two,\n", "  // two,\n"),
  });
  try {
    assert.equal(run(root).out, "3");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REFUSES when the route does not serve servedFunctions", () => {
  const root = fixture({
    "apps/web/app/api/inngest/route.ts": ROUTE_OK.replace("functions: servedFunctions", "functions: [...functions]"),
  });
  try {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.err, /does not pass "functions: servedFunctions"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REFUSES an entry that is not declared with inngest.createFunction", () => {
  const root = fixture({
    "apps/web/lib/other/retention.ts": `export const purgeDaily = makeSomething();\n`,
  });
  try {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.err, /purgeDaily is not declared/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REFUSES a function listed twice", () => {
  const root = fixture({
    "apps/web/lib/reminders/inngest/served.ts": SERVED_OK.replace("purgeDaily]", "purgeDaily, purgeDaily]"),
  });
  try {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.err, /listed twice/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REFUSES an entry it cannot read (a call, not an identifier)", () => {
  const root = fixture({
    "apps/web/lib/reminders/inngest/served.ts": SERVED_OK.replace("purgeDaily]", "build()]"),
  });
  try {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.err, /neither an identifier nor a spread/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REFUSES a missing list file", () => {
  const root = fixture({ "apps/web/lib/reminders/inngest/served.ts": null });
  try {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.err, /served\.ts does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("on this repository the count equals the createFunction declarations it names", () => {
  const list = expectedFunctions(DEFAULT_ROOT);
  assert.ok(list.length > 0);
  for (const { id, module } of list) {
    const src = readFileSync(join(DEFAULT_ROOT, module), "utf8");
    assert.match(src, new RegExp(`export const ${id} = inngest\\.createFunction\\(`), `${id} in ${module}`);
  }
  assert.equal(run(DEFAULT_ROOT).out, String(list.length));
});
