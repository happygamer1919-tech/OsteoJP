// tools/fisiozero-extractor/src/manifest.ts
//
// Tier-1 per-patient manifest. Every file written to a patient's raw-archive
// folder gets a manifest entry: its archive-relative path, the source URL it came
// from, its SHA-256, and its byte count. The manifest is written LAST, after all
// bytes are on disk, so its presence is the per-patient "fully archived" marker
// that the checkpoint trusts (see checkpoint.ts / extractor.ts crash-safety).

import { createHash } from "node:crypto";

/** What kind of artifact a manifest entry is — for later reconciliation. */
export type ArchiveFileKind =
  | "ficha_html"
  | "episode_list_html"
  | "evaluation_list_html"
  | "episode_detail_html"
  | "history_html"
  | "xls"
  | "attachment";

export type ManifestFile = {
  /** Path relative to the patient folder, POSIX separators. */
  path: string;
  kind: ArchiveFileKind;
  /** Absolute source URL this file was fetched from. */
  sourceUrl: string;
  sha256: string;
  bytes: number;
};

export type PatientManifest = {
  schemaVersion: 1;
  patientId: number;
  /** ISO UTC instant the archive was completed. */
  archivedAt: string;
  source: {
    system: "fisiozero";
    baseUrl: string;
    /** Base64 `i=` param used to set this patient active. */
    iParam: string;
  };
  counts: {
    episodes: number;
    attachmentsDiscovered: number;
    attachmentsDownloaded: number;
    xlsCaptured: boolean;
    historyCaptured: boolean;
  };
  files: ManifestFile[];
};

/** SHA-256 hex digest of a byte buffer. */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Build a manifest file entry for a buffer about to be (or already) written. */
export function manifestEntry(
  path: string,
  kind: ArchiveFileKind,
  sourceUrl: string,
  bytes: Uint8Array,
): ManifestFile {
  return { path, kind, sourceUrl, sha256: sha256(bytes), bytes: bytes.byteLength };
}
