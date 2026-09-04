/**
 * lane-stack.mjs - the per-lane local Supabase generator.
 *
 * WHAT THESE TESTS ARE FOR. The failure this script exists to prevent is two
 * lanes reaching the SAME database, and that failure does not look like a
 * failure: the second lane's seed simply overwrites the first lane's rows and
 * the first lane's suite fails somewhere else entirely, with a rejected login.
 * So the property worth asserting is DISJOINTNESS, on every pair of lanes, from
 * the table itself - not that one lane happens to render a config.
 *
 * The negative arms matter as much: an unknown lane must THROW rather than
 * default to the shared stack, and the generated config must not silently keep a
 * port the committed one carried.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LANES, lanePorts, laneEnv, printableStatus, renderLaneConfig, writeLaneProject } from "./lane-stack.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMITTED_CONFIG = fs.readFileSync(path.join(REPO_ROOT, "supabase/config.toml"), "utf8");

test("every pair of lanes is port-disjoint", () => {
  const names = Object.keys(LANES);
  const seen = new Map();
  for (const lane of names) {
    for (const [role, port] of Object.entries(lanePorts(lane))) {
      const owner = seen.get(port);
      assert.equal(
        owner,
        undefined,
        `port ${port} is claimed by both ${owner} and ${lane}.${role} - a shared port is the whole defect`,
      );
      seen.set(port, `${lane}.${role}`);
    }
  }
});

test("the shared lane is the committed configuration, unshifted", () => {
  const p = lanePorts("shared");
  assert.equal(p.api, 54321);
  assert.equal(p.db, 54322);
  assert.equal(p.web, 3000);
  assert.equal(p.portal, 3001);
  assert.equal(p.apiApp, 3002);
});

test("an unknown lane throws rather than landing on another lane's ports", () => {
  assert.throws(() => lanePorts("purpel"), /unknown lane "purpel"/);
  assert.throws(() => laneEnv(""), /unknown lane/);
});

test("no lane offset collides with the rc-inventory stack on this machine (544xx)", () => {
  for (const lane of Object.keys(LANES)) {
    for (const port of Object.values(lanePorts(lane))) {
      assert.ok(port < 54400 || port > 54499, `${lane} claims ${port}, inside rc-inventory's 544xx range`);
    }
  }
});

test("the rendered config carries the lane's project id and NONE of the shared ports", () => {
  const rendered = renderLaneConfig(COMMITTED_CONFIG, "purple");
  assert.match(rendered, /^project_id = "OsteoJP-purple"$/m);
  const p = lanePorts("purple");
  assert.match(rendered, new RegExp(`^port = ${p.api}$`, "m"));
  assert.match(rendered, new RegExp(`^port = ${p.db}$`, "m"));
  assert.match(rendered, new RegExp(`^shadow_port = ${p.shadow}$`, "m"));

  // The negative arm: an UNCOMMENTED shared port left in the file would mean two
  // stacks binding the same socket, which is the collision the table prevents.
  const live = rendered
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  for (const shared of [54320, 54321, 54322, 54323, 54324, 54327, 54329]) {
    assert.doesNotMatch(live, new RegExp(`port\\s*=\\s*${shared}\\b`), `shared port ${shared} survived the rewrite`);
  }
});

test("auth redirect URLs follow the lane's WEB port, not the shared 3000", () => {
  const rendered = renderLaneConfig(COMMITTED_CONFIG, "blue");
  const p = lanePorts("blue");
  const live = rendered
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  assert.match(live, new RegExp(`site_url = "http://127\\.0\\.0\\.1:${p.web}"`));
  assert.doesNotMatch(live, /site_url = "http:\/\/127\.0\.0\.1:3000"/);
});

test("laneEnv names the lane's own ports and carries no credential", () => {
  const env = laneEnv("purple");
  const p = lanePorts("purple");
  assert.equal(env.SUPABASE_URL, `http://127.0.0.1:${p.api}`);
  assert.equal(env.NEXT_PUBLIC_API_URL, `http://127.0.0.1:${p.apiApp}`);
  assert.equal(env.WEB_PORT, String(p.web));
  // postgres:postgres is the local Supabase default and is in the committed
  // README already; nothing else in the map may look like a key.
  for (const [k, v] of Object.entries(env)) {
    assert.doesNotMatch(v, /eyJ[A-Za-z0-9_-]{10,}/, `${k} carries a JWT`);
  }
});

test("writeLaneProject symlinks the committed migrations rather than copying them", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lane-stack-"));
  // A minimal repo shape: the generator reads supabase/config.toml and links the
  // three entries beside it.
  fs.mkdirSync(path.join(tmp, "supabase/migrations"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "supabase/config.toml"), COMMITTED_CONFIG);
  fs.writeFileSync(path.join(tmp, "supabase/seed.sql"), "-- seed\n");
  fs.writeFileSync(path.join(tmp, "supabase/migrations/0000_x.sql"), "select 1;\n");

  const dir = writeLaneProject("purple", tmp);
  const link = path.join(dir, "supabase/migrations");
  assert.ok(fs.lstatSync(link).isSymbolicLink(), "migrations must be a symlink, so a lane cannot run a stale copy");
  assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(tmp, "supabase/migrations")));

  // Idempotent: a second run replaces the links rather than throwing EEXIST.
  writeLaneProject("purple", tmp);
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// LE-lane-stack-status-prints-local-keys - `status` PRINTS NO KEY.
// ---------------------------------------------------------------------------
// WHAT WENT WRONG. `status` ended with `run("supabase", ["status", "--workdir",
// dir])`, and `run` inherits stdio - so the CLI's own table went to the terminal
// with the project's Publishable key, Secret key and storage S3 access key and
// secret in it. Meanwhile this file's own subject documents, and
// PORTAL-REHYDRATE 7.0a, both said the keys are never printed.
//
// Nothing needed rotating: local values for 127.0.0.1, already committed in
// seed-e2e.mjs. The defect is a document that says "never" and means "usually",
// which is the class this repository keeps paying for.
//
// WHY THESE ARMS AND NOT A SNAPSHOT OF THE OUTPUT. The failure is an ADDITION -
// a field appearing in the CLI's JSON that nobody has seen. A snapshot of
// today's output passes forever while the CLI grows a new secret; the arms below
// assert the RULE (name ends in _URL, value carries no userinfo) and prove it
// fails closed on a field invented in the test itself.

// The 18 field names `supabase status -o json` returned on this machine on
// 2026-09-05, with unmistakably fake values. ANON_KEY/SERVICE_ROLE_KEY/JWT_SECRET
// were the secret-bearing set when lane-stack.mjs was written; PUBLISHABLE_KEY,
// SECRET_KEY and the two S3_PROTOCOL_* fields are newer, which is the whole
// argument for an allow-list.
const STATUS_FIXTURE = {
  ANON_KEY: "FAKE-anon-jwt",
  API_URL: "http://127.0.0.1:54521",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54522/postgres",
  FUNCTIONS_URL: "http://127.0.0.1:54521/functions/v1",
  GRAPHQL_URL: "http://127.0.0.1:54521/graphql/v1",
  INBUCKET_URL: "http://127.0.0.1:54524",
  JWT_SECRET: "FAKE-jwt-secret",
  MAILPIT_URL: "http://127.0.0.1:54524",
  MCP_URL: "http://127.0.0.1:54521/mcp",
  PUBLISHABLE_KEY: "FAKE-publishable",
  REST_URL: "http://127.0.0.1:54521/rest/v1",
  S3_PROTOCOL_ACCESS_KEY_ID: "FAKE-s3-id",
  S3_PROTOCOL_ACCESS_KEY_SECRET: "FAKE-s3-secret",
  S3_PROTOCOL_REGION: "local",
  SECRET_KEY: "FAKE-secret",
  SERVICE_ROLE_KEY: "FAKE-service-role-jwt",
  STORAGE_S3_URL: "http://127.0.0.1:54521/storage/v1/s3",
  STUDIO_URL: "http://127.0.0.1:54523",
};

const SECRET_VALUES = [
  "FAKE-anon-jwt",
  "FAKE-jwt-secret",
  "FAKE-publishable",
  "FAKE-s3-id",
  "FAKE-s3-secret",
  "FAKE-secret",
  "FAKE-service-role-jwt",
  "postgres:postgres",
];

test("printableStatus emits no secret value from a real-shaped status", () => {
  const printed = printableStatus(STATUS_FIXTURE).map(([n, v]) => `${n} ${v}`).join("\n");
  // The premise: it printed SOMETHING. An empty projection would pass every
  // assertion below while telling the caller nothing.
  assert.ok(printed.length > 0, "the projection is empty, so the arms below assert nothing");
  for (const secret of SECRET_VALUES) {
    assert.ok(!printed.includes(secret), `printableStatus emitted ${secret}`);
  }
});

test("it prints the URLs a caller actually wants, and DB_URL is not one of them", () => {
  const names = printableStatus(STATUS_FIXTURE).map(([n]) => n);
  assert.deepEqual(names, [
    "API_URL",
    "FUNCTIONS_URL",
    "GRAPHQL_URL",
    "INBUCKET_URL",
    "MAILPIT_URL",
    "MCP_URL",
    "REST_URL",
    "STORAGE_S3_URL",
    "STUDIO_URL",
  ]);
  // DB_URL ends in _URL and is still excluded - by its VALUE, not its name, so
  // the rule survives the CLI renaming it. The db PORT is printed separately by
  // the status command, which is what a caller needed from it anyway.
  assert.ok(!names.includes("DB_URL"));
});

test("it fails CLOSED on a field nobody has seen", () => {
  // The actual failure mode: the CLI grows a field. A deny-list prints it; this
  // drops it. Both directions are asserted so the rule cannot be read as "drop
  // things that look secret".
  const grown = { ...STATUS_FIXTURE, TOTALLY_NEW_CREDENTIAL: "FAKE-future-key", NEW_THING: "plain" };
  const printed = printableStatus(grown).map(([n, v]) => `${n} ${v}`).join("\n");
  assert.ok(!printed.includes("FAKE-future-key"));
  assert.ok(!printed.includes("NEW_THING"));
  // ...and a new URL field IS printed, so the rule is a rule and not a freeze.
  const withUrl = printableStatus({ ...STATUS_FIXTURE, ANALYTICS_URL: "http://127.0.0.1:54527" });
  assert.ok(withUrl.some(([n]) => n === "ANALYTICS_URL"));
});

test("it refuses a status that is not a JSON object rather than printing nothing", () => {
  // Returning [] would make "could not parse" and "this lane exposes no URLs"
  // the same output. PORTAL-REHYDRATE 1.3.
  assert.throws(() => printableStatus(null), /not return a JSON object/);
  assert.throws(() => printableStatus("{}"), /not return a JSON object/);
  assert.throws(() => printableStatus([]), /not return a JSON object/);
});

test("the status command never hands stdio to the supabase CLI", () => {
  // THE REGRESSION GUARD, and it is a source assertion on purpose: the leak was
  // not a wrong value, it was a wrong CALL - `run()` inherits stdio, so one line
  // reinstating it puts the key table back with every unit test still green.
  const src = fs.readFileSync(path.join(REPO_ROOT, "scripts/lane-stack.mjs"), "utf8");
  assert.ok(
    !/run\(\s*"supabase",\s*\[\s*"status"/.test(src),
    'scripts/lane-stack.mjs calls run("supabase", ["status", ...]) again. `run` inherits stdio, so ' +
      "the CLI's table - Publishable key, Secret key, S3 access key and secret - goes straight to " +
      "the terminal. Parse the JSON form in-process and print printableStatus() instead.",
  );
  assert.ok(
    src.includes("printableStatus(parsed)"),
    "the status command no longer prints through printableStatus(), so nothing constrains what it emits",
  );
});
