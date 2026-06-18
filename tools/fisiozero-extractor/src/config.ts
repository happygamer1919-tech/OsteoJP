// tools/fisiozero-extractor/src/config.ts
//
// Env + CLI configuration. Start id, end id, and rate limit are configurable as
// the dispatch requires. Auth is NEVER configured here beyond a PATH to a
// Playwright storageState JSON (FISIOZERO_STORAGE_STATE) — Claude enters no
// credentials and the extractor never reads or logs cookie values directly.

import { isAbsolute, join, resolve } from "node:path";

export type ExtractorConfig = {
  storageStatePath: string;
  baseUrl: string;
  startId: number;
  endId: number;
  /** Max patients to PROCESS this run (skips don't count). Undefined = no cap. */
  limit?: number;
  outDir: string;
  checkpointPath: string;
  rateMinMs: number;
  rateMaxMs: number;
  retries: number;
  backoffBaseMs: number;
  requestTimeoutMs: number;
};

const DEFAULTS = {
  baseUrl: "https://app.fisiozero.pt",
  startId: 174159,
  endId: 199974,
  outDir: "./fisiozero-archive",
  rateMinMs: 2000,
  rateMaxMs: 3000,
  retries: 4,
  backoffBaseMs: 1000,
  requestTimeoutMs: 30_000,
} as const;

type Flags = Record<string, string | boolean>;

/** Minimal flag parser: --key value, --key=value, and bare --flag booleans. */
export function parseArgs(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }
  return flags;
}

function pickString(flags: Flags, key: string, env: string | undefined): string | undefined {
  const v = flags[key];
  if (typeof v === "string") return v;
  return env;
}

function pickInt(
  flags: Flags,
  key: string,
  env: string | undefined,
  fallback: number,
  label: string,
): number {
  const raw = pickString(flags, key, env);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${label} must be an integer, got "${raw}"`);
  return n;
}

function abs(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/**
 * Build a validated config from CLI flags + process env. Throws a clear,
 * PII-free error on any invalid or missing required value.
 */
export function buildConfig(argv: readonly string[], env: NodeJS.ProcessEnv): ExtractorConfig {
  const flags = parseArgs(argv);

  const storageStatePath = pickString(flags, "storage-state", env.FISIOZERO_STORAGE_STATE);
  if (!storageStatePath) {
    throw new Error(
      "FISIOZERO_STORAGE_STATE is required: path to a Playwright storageState JSON " +
        "captured from a logged-in browser. Set the env var or pass --storage-state <path>.",
    );
  }

  const baseUrl = (pickString(flags, "base-url", env.FISIOZERO_BASE_URL) ?? DEFAULTS.baseUrl).replace(/\/+$/, "");
  const startId = pickInt(flags, "start", env.FISIOZERO_START_ID, DEFAULTS.startId, "--start");
  const endId = pickInt(flags, "end", env.FISIOZERO_END_ID, DEFAULTS.endId, "--end");
  if (startId > endId) throw new Error(`--start (${startId}) must be <= --end (${endId})`);

  let limit: number | undefined;
  const limitRaw = pickString(flags, "limit", env.FISIOZERO_LIMIT);
  if (limitRaw !== undefined) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit <= 0) throw new Error(`--limit must be a positive integer, got "${limitRaw}"`);
  }

  const rateMinMs = pickInt(flags, "rate-min", env.FISIOZERO_RATE_MIN_MS, DEFAULTS.rateMinMs, "--rate-min");
  const rateMaxMs = pickInt(flags, "rate-max", env.FISIOZERO_RATE_MAX_MS, DEFAULTS.rateMaxMs, "--rate-max");
  if (rateMinMs < 0 || rateMaxMs < rateMinMs) {
    throw new Error(`invalid rate window: --rate-min ${rateMinMs}, --rate-max ${rateMaxMs}`);
  }

  const outDir = abs(pickString(flags, "out", env.FISIOZERO_OUT_DIR) ?? DEFAULTS.outDir);
  const checkpointPath = abs(pickString(flags, "checkpoint", env.FISIOZERO_CHECKPOINT) ?? join(outDir, "checkpoint.jsonl"));

  return {
    storageStatePath: abs(storageStatePath),
    baseUrl,
    startId,
    endId,
    limit,
    outDir,
    checkpointPath,
    rateMinMs,
    rateMaxMs,
    retries: pickInt(flags, "retries", env.FISIOZERO_RETRIES, DEFAULTS.retries, "--retries"),
    backoffBaseMs: pickInt(flags, "backoff-base", env.FISIOZERO_BACKOFF_BASE_MS, DEFAULTS.backoffBaseMs, "--backoff-base"),
    requestTimeoutMs: pickInt(flags, "timeout", env.FISIOZERO_TIMEOUT_MS, DEFAULTS.requestTimeoutMs, "--timeout"),
  };
}
