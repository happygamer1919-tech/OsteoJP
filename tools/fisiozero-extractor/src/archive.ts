// tools/fisiozero-extractor/src/archive.ts
//
// Tier-1 raw-archive writer. One PatientArchive per patient id. Every artifact is
// written to disk verbatim (untransformed) and recorded as a manifest entry with
// its SHA-256 and byte count. manifest.json is written LAST by finalize(), so its
// presence on disk means "this patient is fully archived" — the invariant the
// checkpoint relies on for crash-safe resume.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  manifestEntry,
  type ArchiveFileKind,
  type ManifestFile,
  type PatientManifest,
} from "./manifest";

export type PatientCounts = PatientManifest["counts"];

export class PatientArchive {
  readonly dir: string;
  private readonly files: ManifestFile[] = [];
  private readonly usedAttachmentPaths = new Set<string>();

  constructor(
    private readonly rootDir: string,
    private readonly patientId: number,
    private readonly baseUrl: string,
    private readonly iParam: string,
  ) {
    this.dir = join(rootDir, "patients", String(patientId));
    mkdirSync(this.dir, { recursive: true });
  }

  private writeFile(relPath: string, bytes: Uint8Array): void {
    const full = join(this.dir, relPath);
    const parent = dirname(full);
    mkdirSync(parent, { recursive: true });
    writeFileSync(full, bytes);
  }

  /** Write an HTML/text artifact and record its manifest entry. */
  addText(relPath: string, kind: ArchiveFileKind, sourceUrl: string, text: string): void {
    const bytes = Buffer.from(text, "utf8");
    this.writeFile(relPath, bytes);
    this.files.push(manifestEntry(relPath, kind, sourceUrl, bytes));
  }

  /** Write a binary artifact (XLS, attachment) and record its manifest entry. */
  addBinary(relPath: string, kind: ArchiveFileKind, sourceUrl: string, bytes: Uint8Array): void {
    this.writeFile(relPath, bytes);
    this.files.push(manifestEntry(relPath, kind, sourceUrl, bytes));
  }

  /**
   * Reserve a collision-free relative path under attachments/ for a scraped
   * filename. Hashed Fisiozero names rarely collide, but two distinct source
   * URLs can share a basename — disambiguate with a numeric suffix so no
   * attachment is silently overwritten (the silent-miss risk).
   */
  reserveAttachmentPath(fileName: string): string {
    const safe = fileName.replace(/[/\\]/g, "_").replace(/^\.+/, "") || "attachment";
    let candidate = `attachments/${safe}`;
    let n = 1;
    while (this.usedAttachmentPaths.has(candidate)) {
      candidate = `attachments/${n}_${safe}`;
      n++;
    }
    this.usedAttachmentPaths.add(candidate);
    return candidate;
  }

  /** Write manifest.json (last) and return it. */
  finalize(counts: PatientCounts): PatientManifest {
    const manifest: PatientManifest = {
      schemaVersion: 1,
      patientId: this.patientId,
      archivedAt: new Date().toISOString(),
      source: { system: "fisiozero", baseUrl: this.baseUrl, iParam: this.iParam },
      counts,
      files: [...this.files].sort((a, b) => a.path.localeCompare(b.path)),
    };
    this.writeFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
    return manifest;
  }
}
