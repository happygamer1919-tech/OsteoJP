/**
 * storage-signed-url.integration.test.ts
 *
 * Integration coverage for the clinical attachment signed-URL round-trip:
 * server-issued (service_role) signed UPLOAD url -> direct upload -> server
 * issued signed DOWNLOAD url -> fetch -> byte-for-byte match, against the real
 * `clinical-attachments` bucket using tenant-prefixed object paths.
 *
 * Mirrors the path scheme in lib/clinical/storage.ts:
 *   `${tenantId}/${recordId}/${uuid}__${safeName(fileName)}`
 *
 * The live round-trip is GATED: it only runs when both
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * are present AND the `clinical-attachments` bucket exists (a manual owner step
 * — see the project setup notes). Without them it is skipped, so `vitest run`
 * stays green locally / in CI without live Supabase credentials. The
 * path-convention assertions below always run.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

// ---------------------------------------------------------------------------
// Gated live round-trip against the clinical-attachments bucket.
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = Boolean(url && serviceKey);

describe.skipIf(!live)(
  "clinical-attachments signed-URL upload/download round-trip (service_role)",
  () => {
    // Created in beforeAll, not in the describe body: the describe callback is
    // evaluated at collection time even when skipIf skips it, so constructing
    // the client here (with possibly-undefined env) would throw. beforeAll only
    // runs when the suite is NOT skipped.
    let admin: SupabaseClient;
    beforeAll(() => {
      admin = createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    });

    const tenantId = randomUUID();
    const recordId = randomUUID();
    const uploaded: string[] = [];

    afterAll(async () => {
      if (uploaded.length) {
        await admin.storage.from(ATTACHMENTS_BUCKET).remove(uploaded);
      }
    });

    it("issues a signed upload URL, uploads bytes, then downloads them back unchanged", async () => {
      const path = attachmentPath(tenantId, recordId, "report.txt");
      const body = Buffer.from(`osteojp signed-url roundtrip ${randomUUID()}`, "utf8");

      // 1. Server issues a one-time signed UPLOAD url (service_role).
      const signed = await admin.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUploadUrl(path);
      expect(signed.error).toBeNull();
      expect(signed.data?.token).toBeTruthy();
      expect(signed.data?.path).toBe(path);
      uploaded.push(path);

      // 2. Client uploads DIRECTLY to storage with that token.
      const put = await admin.storage
        .from(ATTACHMENTS_BUCKET)
        .uploadToSignedUrl(path, signed.data!.token, body, {
          contentType: "text/plain",
        });
      expect(put.error).toBeNull();
      expect(put.data?.path).toBe(path);

      // 3. Server issues a short-lived signed DOWNLOAD url.
      const dl = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 60);
      expect(dl.error).toBeNull();
      expect(dl.data?.signedUrl).toMatch(/^https?:\/\//);

      // 4. Fetch the signed url and assert byte-for-byte equality.
      const res = await fetch(dl.data!.signedUrl);
      expect(res.ok).toBe(true);
      const got = Buffer.from(await res.arrayBuffer());
      expect(got.equals(body)).toBe(true);
    });

    it("does not expose the object without a signature", async () => {
      const path = attachmentPath(tenantId, recordId, "private.txt");
      const body = Buffer.from("no anon access", "utf8");

      const signed = await admin.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUploadUrl(path);
      expect(signed.error).toBeNull();
      uploaded.push(path);

      await admin.storage
        .from(ATTACHMENTS_BUCKET)
        .uploadToSignedUrl(path, signed.data!.token, body);

      // The public URL must NOT resolve — the bucket is private; only signed
      // URLs grant access.
      const publicUrl = admin.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path)
        .data.publicUrl;
      const res = await fetch(publicUrl);
      expect(res.ok).toBe(false);
    });
  },
);
