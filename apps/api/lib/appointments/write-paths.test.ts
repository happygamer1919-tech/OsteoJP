import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// PRIMARY GUARD for finding 2.9. Read this before changing the allowlist.
//
// The advisory lock in slot-lock.ts is the ONLY protection against an
// unintended double-booking. There is no database backstop behind it: the
// partial EXCLUDE constraint was cancelled after a DB-gated test proved
// `created_by` cannot identify portal rows (packages/db/tests/
// appointments-created-by-provenance.test.ts, 7/7 against live Postgres).
//
// An application-level guarantee is only worth the completeness of the set of
// writers that honour it. This test IS that completeness check. It enumerates
// every INSERT into `appointments`, and every UPDATE that moves an appointment
// in time or changes its therapist, across the whole repo, and asserts the set
// matches an explicit allowlist. A new write path added anywhere fails here.
//
// If this test is weak, the protection is weak. Do not "fix" a failure by
// pasting the new path into the allowlist without deciding whether it needs the
// lock. The allowlist records a DECISION per path, not an inventory.

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SCAN_ROOTS = ["apps", "packages", "tools"];

// Excluded, each for a stated reason - not for convenience.
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  // DB-gated harnesses insert directly ON PURPOSE, to construct fixtures for
  // RLS proofs. They are not application writers.
  "tests",
  // Migrations are schema, not application writers.
  "migrations",
  // Dev seeds never run against prod.
  "seed",
  // Playwright specs drive the UI; they do not write directly.
  "e2e",
]);

const SOURCE_EXT = /\.tsx?$/;

/** Matches a write to the appointments table, in Drizzle or raw SQL form. */
const WRITE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "drizzle-insert", re: /\.insert\(\s*(?:schema\.)?appointments\s*\)/ },
  { label: "raw-insert", re: /insert\s+into\s+appointments\b/i },
  { label: "drizzle-update", re: /\.update\(\s*(?:schema\.)?appointments\s*\)/ },
  { label: "raw-update", re: /update\s+appointments\s+set\b/i },
];

type Hit = { file: string; line: number; label: string };

/**
 * Skip comment lines. Documentation legitimately cites these call shapes as
 * examples - packages/db/src/client.ts:86 does exactly that - and counting a
 * doc comment as a write path would train people to dismiss this test's
 * failures, which is the only way a guard like this really dies.
 *
 * Line-level heuristic, deliberately. It cannot miss a real write: no writer is
 * authored on a line whose first non-space character is `//`, `*` or `/*`. It
 * CAN miss a write hidden inside a block comment, which is not a write.
 */
function isCommentLine(text: string): boolean {
  const t = text.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function findWrites(): Hit[] {
  const hits: Hit[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      const rel = relative(REPO_ROOT, file).split(sep).join("/");
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((text, i) => {
        if (isCommentLine(text)) return;
        for (const { label, re } of WRITE_PATTERNS) {
          if (re.test(text)) hits.push({ file: rel, line: i + 1, label });
        }
      });
    }
  }
  return hits;
}

/**
 * Every known write path, with the decision attached.
 *
 * `needsLock` — is this a CONCURRENT writer that could race another booking?
 * `locked`    — does it actually take the slot lock?
 *
 * The load-bearing count is `needsLock && !locked`, which must be ZERO. The two
 * flags are separate on purpose: declaring a non-concurrent path as `locked`
 * would inflate the protected count with something that takes no lock, which is
 * the sort of comfortable inaccuracy this file exists to prevent.
 *
 * Do not read a path's presence here as approval that it is safe; read the
 * reason.
 */
const ALLOWED: Record<
  string,
  { needsLock: boolean; locked: boolean; reason: string }
> = {
  "apps/api/lib/appointments/store.ts": {
    needsLock: true,
    locked: true,
    reason:
      "The choke point. createBooking + rescheduleOwn take the slot lock; " +
      "cancelOwn only releases a slot and needs none.",
  },
  "apps/web/lib/scheduling/actions.ts": {
    needsLock: true,
    locked: true,
    reason:
      "STAFF create, recurrence children, clone (T4) AND reschedule (W1) all " +
      "take the slot lock. Reschedule locks the DESTINATION slots only: " +
      "vacating a slot cannot double-book, occupying one can. The two other " +
      "UPDATE sites in this file are outside the lock by design and were " +
      "VERIFIED, not assumed: the generic patch builds `set` from serviceId/" +
      "room/status only (actions.ts:661-663, UpdateAppointmentPatch in " +
      "types.ts:145-150 has no time or therapist field), and the cancel path " +
      "only frees a slot. This entry is file-granular, so a NEW insert or move " +
      "added to this file would not be flagged; that is the guard's known limit.",
  },
  "apps/web/lib/scheduling/batch.ts": {
    needsLock: true,
    locked: true,
    reason:
      "STAFF batch create ('Agendar lote') takes one sorted, deduplicated " +
      "acquisition covering every slot in the batch (T4).",
  },
  "packages/db/src/migration/upsert.ts": {
    // NOT a concurrent writer, so the lock does not apply. Declared with
    // needsLock:false rather than locked:false so it cannot be mistaken for an
    // unprotected concurrent path in the count below.
    needsLock: false,
    locked: false,
    reason:
      "Bulk patient-book import. Runs offline as a one-shot, never alongside " +
      "live booking, so the race it would need does not arise. Editing it is " +
      "also outside the lane that routed the other paths. IF IT IS EVER MADE " +
      "CONCURRENT it must take the lock and flip to needsLock:true.",
  },
};

describe("appointments write paths (PRIMARY guard for 2.9)", () => {
  const hits = findWrites();

  it("finds the scanner is actually working (guards against a vacuous pass)", () => {
    // If the walk or the patterns break, `hits` goes empty and every assertion
    // below passes trivially. This makes that impossible.
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.file === "apps/api/lib/appointments/store.ts")).toBe(true);
  });

  it("every write path is declared in the allowlist", () => {
    const undeclared = hits
      .filter((h) => !(h.file in ALLOWED))
      .map((h) => `${h.file}:${h.line} (${h.label})`);

    expect(
      undeclared,
      undeclared.length
        ? `A new appointments write path was added:\n  ${undeclared.join("\n  ")}\n` +
            "Route it through the choke point (apps/api/lib/appointments/store.ts " +
            "-> acquireSlotLocks) or add it to ALLOWED with an explicit reason. " +
            "The advisory lock is the ONLY double-booking protection; a writer " +
            "that bypasses it is unprotected silently."
        : undefined,
    ).toEqual([]);
  });

  it("every allowlisted path still exists (a stale allowlist is a lie)", () => {
    const seen = new Set(hits.map((h) => h.file));
    const missing = Object.keys(ALLOWED).filter((f) => !seen.has(f));

    expect(
      missing,
      missing.length
        ? `Allowlisted write paths no longer found:\n  ${missing.join("\n  ")}\n` +
            "If a path was removed, delete its ALLOWED entry. If the scanner " +
            "stopped matching it, the guard is broken and must be fixed."
        : undefined,
    ).toEqual([]);
  });

  it("no concurrent write path is left unprotected", () => {
    // The load-bearing count: paths that NEED the lock and do not take it.
    // W1 drove this to zero. It must stay zero.
    const unprotected = Object.entries(ALLOWED)
      .filter(([, v]) => v.needsLock && !v.locked)
      .map(([f]) => f)
      .sort();

    expect(
      unprotected,
      unprotected.length
        ? `Concurrent write paths without the slot lock:\n  ${unprotected.join("\n  ")}`
        : undefined,
    ).toEqual([]);
  });

  it("records which paths are exempt, so an exemption is never implicit", () => {
    // Exempt means "not a concurrent writer", NOT "safe to ignore". Changing
    // this list must be a deliberate edit, never a silent side effect.
    const exempt = Object.entries(ALLOWED)
      .filter(([, v]) => !v.needsLock)
      .map(([f]) => f)
      .sort();

    expect(exempt).toEqual(["packages/db/src/migration/upsert.ts"]);
  });
});
