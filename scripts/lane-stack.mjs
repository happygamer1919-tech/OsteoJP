#!/usr/bin/env node
/**
 * lane-stack.mjs - ONE LOCAL SUPABASE PER LANE, on its own ports.
 *
 * SR-39, and the card is LE-local-supabase-per-lane. Two executor terminals
 * shared ONE local stack, so either lane's `supabase db reset` deleted the
 * other's e2e fixtures MID-RUN. The symptom was four Playwright logins failing
 * with "Nao foi possivel iniciar sessao" - a REJECTED login, which reads as a
 * broken login page or a broken auth config. It is neither, and it cost three
 * wrong diagnoses before a failure snapshot named it.
 *
 * WHY A GENERATED CONFIG AND NOT AN EDIT TO supabase/config.toml. The CLI takes
 * its project id and every host port from that one committed file, so two lanes
 * cannot both use it. `supabase --workdir <dir>` reads `<dir>/supabase/`, so a
 * lane gets its own directory with its own config and SYMLINKS back to the
 * committed migrations, seed and templates. The schema a lane runs is therefore
 * the repository's schema, byte for byte - there is no second copy to drift.
 *
 * WHY THE OFFSETS ARE A TABLE AND NOT ARITHMETIC ON A LANE NAME. An unknown lane
 * must FAIL rather than land on somebody else's ports (PORTAL-REHYDRATE 1.3): a
 * computed offset would give every typo a stack of its own, and the first
 * collision would present as the exact failure this script exists to end.
 *
 * WHAT IT DOES NOT DO: it never touches the shared stack, never resets a stack
 * it did not generate, and prints no key. The local anon/service keys are the
 * Supabase demo JWTs, identical on every local project, already committed in
 * seed-e2e.mjs - so a lane needs no key handling at all, only URLs.
 *
 * Usage (the two commands documented in PORTAL-REHYDRATE.md section 7):
 *   node scripts/lane-stack.mjs up   --lane purple      # start + migrate + seed
 *   node scripts/lane-stack.mjs e2e  --lane purple      # run the suite on it
 * And the two that keep the census honest:
 *   node scripts/lane-stack.mjs status --lane purple
 *   node scripts/lane-stack.mjs down   --lane purple
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");

/**
 * THE LANE TABLE. `db` shifts every host port in supabase/config.toml; `app`
 * shifts the three Next dev ports (web 3000, portal 3001, api 3002).
 *
 * The gaps are deliberate and the reason is a real neighbour: the rc-inventory
 * project on this machine runs its own Supabase at 544xx (+100). A lane offset
 * of 100 would have collided with it, and a collision here does not announce
 * itself - the CLI simply fails to bind, or worse, a client reaches a stack that
 * answers and holds somebody else's rows.
 */
export const LANES = Object.freeze({
  shared: { db: 0, app: 0 },
  purple: { db: 200, app: 20 },
  blue: { db: 300, app: 30 },
  amber: { db: 400, app: 40 },
});

/** Every host port in the committed config, and what it is, so a shift is auditable. */
export const CONFIG_PORT_KEYS = Object.freeze(["port", "shadow_port", "smtp_port", "pop3_port", "inspector_port"]);

/** Ports the generated config must NOT shift: not host ports, or not ours. */
const UNSHIFTED_PORT_LINES = [
  /^\s*#/, // commented-out examples
];

export function laneOffsets(lane) {
  const off = LANES[lane];
  if (!off) {
    throw new Error(
      `unknown lane "${lane}". Known lanes: ${Object.keys(LANES).join(", ")}. ` +
        "Add one to the LANES table rather than passing a new name - an unknown lane " +
        "must fail, not land on another lane's ports.",
    );
  }
  return off;
}

/** The ports a lane owns, derived from the table. Pure, so a test can assert disjointness. */
export function lanePorts(lane) {
  const { db, app } = laneOffsets(lane);
  return {
    api: 54321 + db,
    db: 54322 + db,
    shadow: 54320 + db,
    pooler: 54329 + db,
    studio: 54323 + db,
    inbucket: 54324 + db,
    analytics: 54327 + db,
    web: 3000 + app,
    portal: 3001 + app,
    apiApp: 3002 + app,
  };
}

/**
 * Rewrite the committed config for a lane: a distinct project id (the CLI names
 * every container after it, so this is what keeps `docker ps` readable and keeps
 * one lane's `down` from stopping another's containers) and every host port
 * shifted by the lane's offset.
 *
 * The rewrite is a LINE transform on port assignments only. It deliberately does
 * not parse TOML: the file is 400 lines of upstream comments carrying example
 * ports, and a parse-and-re-emit would drop every one of them, leaving a lane
 * config nobody can diff against the committed one.
 */
export function renderLaneConfig(sourceToml, lane) {
  const { db: dbOffset } = laneOffsets(lane);
  const ports = lanePorts(lane);
  const out = [];
  for (const line of sourceToml.split("\n")) {
    if (/^\s*project_id\s*=/.test(line)) {
      out.push(`project_id = "OsteoJP-${lane}"`);
      continue;
    }
    const isComment = UNSHIFTED_PORT_LINES.some((re) => re.test(line));
    const m = line.match(/^(\s*)([a-z_]*port)(\s*=\s*)(\d+)(.*)$/);
    if (m && !isComment && CONFIG_PORT_KEYS.includes(m[2])) {
      const shifted = Number(m[4]) + dbOffset;
      out.push(`${m[1]}${m[2]}${m[3]}${shifted}${m[5]}`);
      continue;
    }
    // site_url / additional_redirect_urls point at the WEB app, not at Supabase,
    // so they follow the app offset. Auth rejects a redirect it was not told
    // about, and a lane whose web app is on 3020 while auth only knows 3000
    // fails at the redirect rather than at start - late, and far from the cause.
    if (!isComment && /(site_url|additional_redirect_urls)\s*=/.test(line)) {
      out.push(line.replace(/(127\.0\.0\.1|localhost):3000/g, `$1:${ports.web}`));
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Where a lane's generated project lives. Inside the worktree, and gitignored. */
export function laneDir(lane, root = REPO_ROOT) {
  return path.join(root, ".lane", lane);
}

/**
 * Materialise the lane project: config.toml rendered, migrations/seed/templates
 * SYMLINKED to the committed originals so the lane can never run a stale copy.
 */
export function writeLaneProject(lane, root = REPO_ROOT) {
  const dir = path.join(laneDir(lane, root), "supabase");
  fs.mkdirSync(dir, { recursive: true });
  const source = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  fs.writeFileSync(path.join(dir, "config.toml"), renderLaneConfig(source, lane));
  for (const entry of ["migrations", "seed.sql", "templates"]) {
    const link = path.join(dir, entry);
    const target = path.join(root, "supabase", entry);
    if (!fs.existsSync(target)) continue;
    try {
      fs.unlinkSync(link);
    } catch {
      /* first run: nothing to replace */
    }
    fs.symlinkSync(target, link);
  }
  return laneDir(lane, root);
}

/**
 * The environment a lane's runner needs. NAMES here, values are ports and
 * localhost URLs - there is no credential in this map, by construction.
 */
export function laneEnv(lane) {
  const p = lanePorts(lane);
  return {
    SUPABASE_URL: `http://127.0.0.1:${p.api}`,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${p.api}`,
    DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${p.db}/postgres`,
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${p.apiApp}`,
    WEB_PORT: String(p.web),
    PORTAL_PORT: String(p.portal),
    API_PORT: String(p.apiApp),
    BASE_URL: `http://127.0.0.1:${p.web}`,
  };
}

/**
 * The two local KEYS, read from the running stack and never printed.
 *
 * The app refuses to start without NEXT_PUBLIC_SUPABASE_ANON_KEY, so a lane
 * runner has to supply one. It is fetched from `supabase status` and passed
 * straight into the child process environment: it is never logged, never
 * written to a file and never returned to a caller that prints. Standing rule 3
 * is about VALUES reaching a terminal's context, and this keeps them out of one
 * even though the local keys are the Supabase demo JWTs.
 */
function laneKeys(dir) {
  const r = spawnSync("supabase", ["status", "-o", "json", "--workdir", dir], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `supabase status failed for ${dir}. Start the lane first: node scripts/lane-stack.mjs up --lane <name>`,
    );
  }
  const status = JSON.parse(r.stdout);
  const keys = {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  };
  for (const [name, value] of Object.entries(keys)) {
    if (!value) throw new Error(`supabase status returned no ${name} - refusing to run with a blank key`);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    cwd: REPO_ROOT,
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

function usage() {
  console.error(
    [
      "usage: node scripts/lane-stack.mjs <up|down|status|e2e|env> --lane <name> [-- extra args]",
      `lanes: ${Object.keys(LANES).join(", ")}`,
    ].join("\n"),
  );
}

async function main(argv) {
  const cmd = argv[0];
  const laneIdx = argv.indexOf("--lane");
  const lane = laneIdx === -1 ? null : argv[laneIdx + 1];
  const passthrough = argv.includes("--") ? argv.slice(argv.indexOf("--") + 1) : [];
  if (!cmd || !lane) {
    usage();
    return 2;
  }
  const ports = lanePorts(lane); // throws on an unknown lane, before anything starts
  const dir = writeLaneProject(lane);
  const env = laneEnv(lane);

  if (cmd === "env") {
    // NAMES and ports only. Printed as exports so a shell can eval it. The two
    // keys are deliberately NOT printed: `up` and `e2e` inject them directly.
    for (const [k, v] of Object.entries(env)) console.log(`export ${k}=${v}`);
    console.log("# NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY: injected by `up`/`e2e`,");
    console.log("# read from `supabase status` at run time. Never printed here.");
    return 0;
  }

  if (cmd === "status") {
    console.log(`lane ${lane}: project OsteoJP-${lane} at ${dir}`);
    console.log(`  supabase api ${ports.api}  db ${ports.db}  studio ${ports.studio}`);
    console.log(`  next web ${ports.web}  portal ${ports.portal}  api ${ports.apiApp}`);
    return run("supabase", ["status", "--workdir", dir]);
  }

  if (cmd === "down") {
    return run("supabase", ["stop", "--workdir", dir]);
  }

  if (cmd === "up") {
    const start = run("supabase", ["start", "--workdir", dir]);
    if (start !== 0) return start;
    // `db reset` applies supabase/migrations + seed.sql to THIS lane's stack.
    const reset = run("supabase", ["db", "reset", "--workdir", dir]);
    if (reset !== 0) return reset;
    return run("node", ["apps/web/e2e/seed/seed-e2e.mjs"], { ...env, ...laneKeys(dir) });
  }

  if (cmd === "e2e") {
    const keys = laneKeys(dir);
    const seed = run("node", ["apps/web/e2e/seed/seed-e2e.mjs"], { ...env, ...keys });
    if (seed !== 0) return seed;
    // BASE_URL is deliberately NOT forwarded: setting it tells playwright.config
    // an app is already running and it starts none. The lane's ports reach the
    // config through WEB_PORT / PORTAL_PORT / API_PORT instead.
    const { BASE_URL: _ignored, ...serverEnv } = env;
    return run("pnpm", ["--filter", "web", "e2e", ...passthrough], {
      ...serverEnv,
      ...keys,
      E2E_ADMIN_EMAIL: "e2e-admin@osteojp.test",
      E2E_ADMIN_PASSWORD: "E2ePassw0rd!",
      E2E_THERAPIST_EMAIL: "e2e-therapist@osteojp.test",
      E2E_THERAPIST_PASSWORD: "E2ePassw0rd!",
      E2E_RECEPTION_EMAIL: "e2e-reception@osteojp.test",
      E2E_RECEPTION_PASSWORD: "E2ePassw0rd!",
      E2E_PORTAL_PATIENT_EMAIL: "e2e-patient@osteojp.test",
      E2E_PORTAL_PATIENT_PASSWORD: "E2ePassw0rd!",
    });
  }

  usage();
  return 2;
}

if (process.argv[1] && process.argv[1].endsWith("lane-stack.mjs")) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`[lane-stack] ${e.message}`);
      process.exit(1);
    });
}
