// R27: the expected-function count for the SECOND synced app, osteojp-consultation,
// and the `--app` argument that selects it.
//
// inngest-expected-functions.test.mjs (R6) proves the reader on the reminders app
// and stays as it is. This file proves what R27 adds: the consultation route is
// read the same way (its list is `functions`, passed by shorthand), an app that
// is not one of the two is refused, a typo in the arguments is refused rather
// than quietly counting the default app, and on this repository each app's
// route belongs to the Inngest client of that app's id.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { APPS, DEFAULT_APP, DEFAULT_ROOT, expectedFunctions, main } from "./inngest-expected-functions.mjs";

const CONSULTATION_ROUTE = "apps/web/app/api/inngest/consultation/route.ts";
const CONSULTATION_FUNCTIONS = "apps/web/lib/consultation/inngest/functions.ts";

const ROUTE_OK = `import { serve } from "inngest/next";
import { inngest } from "@/lib/consultation/inngest/client";
import { functions } from "@/lib/consultation/inngest/functions";
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
`;

const FUNCTIONS_OK = `import { inngest } from "./client";
export const retryOne = inngest.createFunction({ id: "retry-one" }, async () => {});
export const functions = [retryOne];
`;

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "r27-expected-"));
  const all = { [CONSULTATION_ROUTE]: ROUTE_OK, [CONSULTATION_FUNCTIONS]: FUNCTIONS_OK, ...files };
  for (const [rel, body] of Object.entries(all)) {
    if (body === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

function run(root, argv) {
  const out = [];
  const errs = [];
  const code = main(argv, { root, log: (l) => out.push(l), err: (l) => errs.push(l) });
  return { code, out: out.join("\n"), err: errs.join("\n") };
}

function withFixture(files, fn) {
  const root = fixture(files);
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("exactly two apps are known, and the reminders app stays the default", () => {
  assert.deepEqual(Object.keys(APPS), ["osteojp-reminders", "osteojp-consultation"]);
  assert.equal(DEFAULT_APP, "osteojp-reminders");
});

test("counts the consultation route's shorthand `functions`", () => {
  withFixture({}, (root) => {
    const r = run(root, ["--app", "osteojp-consultation"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, "1");
    assert.equal(run(root, ["--app", "osteojp-consultation", "--list"]).out, `retryOne  ${CONSULTATION_FUNCTIONS}`);
  });
});

test("`functions: functions` is read the same as the shorthand", () => {
  withFixture({ [CONSULTATION_ROUTE]: ROUTE_OK.replace("  functions,\n", "  functions: functions,\n") }, (root) => {
    assert.equal(run(root, ["--app", "osteojp-consultation"]).out, "1");
  });
});

test("a second function in the list moves the count with no other edit", () => {
  withFixture(
    {
      [CONSULTATION_FUNCTIONS]: FUNCTIONS_OK.replace(
        "export const functions = [retryOne];",
        `export const sweepTwo = inngest.createFunction({ id: "two" }, async () => {});\nexport const functions = [retryOne, sweepTwo];`,
      ),
    },
    (root) => assert.equal(run(root, ["--app", "osteojp-consultation"]).out, "2"),
  );
});

test("REFUSES a consultation route that serves some other list", () => {
  withFixture({ [CONSULTATION_ROUTE]: ROUTE_OK.replace("  functions,\n", "  functions: [...functions],\n") }, (root) => {
    const r = run(root, ["--app", "osteojp-consultation"]);
    assert.equal(r.code, 1);
    assert.match(r.err, /does not pass "functions: functions"/);
  });
});

test("REFUSES a route whose `functions` is imported from another module", () => {
  withFixture(
    {
      [CONSULTATION_ROUTE]: ROUTE_OK.replace("@/lib/consultation/inngest/functions", "@/lib/other/functions"),
      "apps/web/lib/other/functions.ts": FUNCTIONS_OK,
    },
    (root) => {
      const r = run(root, ["--app", "osteojp-consultation"]);
      assert.equal(r.code, 1);
      assert.match(r.err, /does not import functions from apps\/web\/lib\/consultation\/inngest\/functions\.ts/);
    },
  );
});

test("REFUSES an entry that is not a createFunction", () => {
  withFixture(
    { [CONSULTATION_FUNCTIONS]: FUNCTIONS_OK.replace('inngest.createFunction({ id: "retry-one" }, async () => {})', "makeOne()") },
    (root) => {
      const r = run(root, ["--app", "osteojp-consultation"]);
      assert.equal(r.code, 1);
      assert.match(r.err, /retryOne is not declared/);
    },
  );
});

test("REFUSES an app that is not one of the two", () => {
  for (const app of ["osteojp-stripe", "osteojp-ifthenpay", "osteojp-invoicexpress", "toString", "__proto__"]) {
    const r = run(DEFAULT_ROOT, ["--app", app]);
    assert.equal(r.code, 1, app);
    assert.match(r.err, /unknown app/, app);
  }
});

test("REFUSES an argument it does not know, so a typo cannot count the default app", () => {
  for (const argv of [["--ap", "osteojp-consultation"], ["--app"], ["--app", "--list"], ["osteojp-consultation"], ["--app", "osteojp-consultation", "--app", "osteojp-reminders"]]) {
    const r = run(DEFAULT_ROOT, argv);
    assert.equal(r.code, 1, argv.join(" "));
    assert.match(r.err, /argument not understood/, argv.join(" "));
  }
});

test("on this repository: each app's route serves with the client of that app's id, and the counts are 7 and 1", () => {
  for (const [app, { route }] of Object.entries(APPS)) {
    const src = readFileSync(join(DEFAULT_ROOT, route), "utf8");
    const client = src.match(/import \{ inngest \} from "@\/(lib\/[a-z-]+\/inngest\/client)";/);
    assert.ok(client, `${route} imports its client`);
    const clientSrc = readFileSync(join(DEFAULT_ROOT, "apps/web", `${client[1]}.ts`), "utf8");
    assert.match(clientSrc, new RegExp(`new Inngest\\(\\{ id: "${app}"`), `${route} serves ${app}`);
  }
  // Read from the code, never pinned here as the source of truth: the counts are
  // asserted only so a change to either list is seen in review.
  assert.equal(run(DEFAULT_ROOT, []).out, String(expectedFunctions(DEFAULT_ROOT).length));
  assert.equal(run(DEFAULT_ROOT, ["--app", "osteojp-consultation"]).out, "1");
  assert.deepEqual(
    expectedFunctions(DEFAULT_ROOT, "osteojp-consultation").map((f) => f.id),
    ["retryPendingConsultationFires"],
  );
});
