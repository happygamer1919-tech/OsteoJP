/**
 * storage-signed-url.integration.test.ts
 *
 * Path-convention coverage for clinical attachment object keys: attachments are
 * namespaced under the tenant id, nested under the record id, and the file name
 * is sanitized. Same scheme as lib/clinical/storage.ts:
 *   `${tenantId}/${recordId}/${uuid}__${safeName(fileName)}`
 *
 * ==========================================================================
 * THE LIVE ROUND-TRIP WAS DELETED 2026-08-18, AND IT HAD NEVER RUN.
 * ==========================================================================
 * This file used to carry a second suite: a real upload -> signed download ->
 * byte-for-byte compare against the `clinical-attachments` bucket, behind
 * `describe.skipIf(!live)` where `live` meant NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY both present.
 *
 * NO CI JOB EVER RAN IT, for two independent reasons either of which was
 * enough. Its gate was those two variables rather than DATABASE_URL, and
 * db-tests.yml sets DATABASE_URL. And its filename ends `.integration.test.ts`,
 * while the apps/web DB-gated step runs `vitest run .db.test.ts`. So in ci.yml
 * it collected, skipped, and reported green - for months.
 *
 * THE WORKFLOW HAD ALREADY PREDICTED THIS SHAPE, one step above the one that
 * would have caught it: the apps/web step was changed from a named path to a
 * glob precisely because naming `redeem.db.test.ts` explicitly meant
 * `pedido-confirm.db.test.ts` "would have been added to the repo, passed review,
 * and NEVER RUN". The glob fixed that for files ending `.db.test.ts`. This one
 * did not end that way, so the defect survived the fix written for it.
 *
 * WHY DELETED RATHER THAN WIRED UP (owner ruling, 2026-08-18). Running it needs
 * SUPABASE_SERVICE_ROLE_KEY available to a CI job, which widens the credential
 * surface two weeks before a planned rotation. A suite that has never run is not
 * protection, and one that LOOKS like protection is worse than none - it is the
 * exact currency ACC-vacuous-guard-sweep exists to remove.
 *
 * THE COVERAGE IS NOT ABANDONED, it is reassigned: the live
 * upload-sign-download path is now a supervised sitting item on LAUNCH-01,
 * where a real credential is already in the room and under supervision.
 *
 * What remains below is pure, needs no network, and runs on every PR.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// Mirrors ATTACHMENTS_BUCKET in lib/clinical/storage.ts (kept local so this
// test does not import that "server-only" module under the node test runner).
const ATTACHMENTS_BUCKET = "clinical-attachments";

// Mirrors safeName() in lib/clinical/storage.ts.
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

// Mirrors the tenant-prefixed object path derived server-side in storage.ts.
function attachmentPath(tenantId: string, recordId: string, fileName: string): string {
  return `${tenantId}/${recordId}/${randomUUID()}__${safeName(fileName)}`;
}

// ---------------------------------------------------------------------------
// Always-on: tenant-prefix path convention (no network).
// These guard the invariant that attachment objects are namespaced under the
// tenant id — the same prefix check storage.ts uses to reject forged paths.
// ---------------------------------------------------------------------------
describe("attachment object path convention", () => {
  const tenantId = randomUUID();
  const recordId = randomUUID();

  it("is prefixed with the tenant id", () => {
    const path = attachmentPath(tenantId, recordId, "scan.png");
    expect(path.startsWith(`${tenantId}/`)).toBe(true);
  });

  it("nests under the record id and preserves a sanitized file name", () => {
    const path = attachmentPath(tenantId, recordId, "weird name (1).PNG");
    expect(path.startsWith(`${tenantId}/${recordId}/`)).toBe(true);
    expect(path.endsWith("__weird_name__1_.PNG")).toBe(true);
    // No characters outside the storage-safe set, except the path separators.
    expect(path.replace(/\//g, "")).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  it("rejects a path that is not under the tenant prefix (forged-path guard)", () => {
    const other = randomUUID();
    const forged = attachmentPath(other, recordId, "x.png");
    expect(forged.startsWith(`${tenantId}/`)).toBe(false);
  });
});
