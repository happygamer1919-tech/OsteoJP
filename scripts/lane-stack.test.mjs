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

import { LANES, lanePorts, laneEnv, renderLaneConfig, writeLaneProject } from "./lane-stack.mjs";

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
