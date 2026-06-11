// packages/db/src/migration/source.ts
//
// ADAPTER SEAM — interface only, deliberately UNIMPLEMENTED.
//
// TODO(Phase 5, blocked): implement a FisiozeroSource over the confirmed
// CSV+ZIP export once a sample export arrives. No implementation, scraping,
// or field mapping may be written before that sample exists — the raw format
// is unknown and guessing it would bake wrong assumptions into the mapper.
// The free-text event-type → service mapping table and the known edge cases
// (duplicates, missing NIF/DOB, orphan appointments, local-path attachments)
// are documented in docs/migration-notes.md and belong to that implementation,
// not to this seam.

import type { MigrationEntityType, MigrationRecord } from "./types";

/**
 * One row as the adapter hands it to the pipeline: the source-shaped payload
 * verbatim (staged into migration_staging_rows.raw for audit/replay) plus the
 * normalized intermediate record the importer consumes.
 */
export type SourceRecord = {
  entityType: MigrationEntityType;
  sourceId: string;
  /** The untouched source payload (e.g. the parsed CSV row). */
  raw: unknown;
  /** The same data normalized into the intermediate shape. */
  record: MigrationRecord;
};

/**
 * A source of migration records. The pipeline (staging.ts / upsert.ts) depends
 * only on this interface; swapping Fisiozero for Stylus.pt or a re-export means
 * a new implementation, not a pipeline change.
 */
export interface FisiozeroSource {
  /** Discriminator written to migration_staging_rows.source_system. */
  readonly sourceSystem: "fisiozero";

  /**
   * Stream every record from the export, normalized, in any order — the
   * importer handles dependency ordering (patients before appointments, ...).
   */
  records(): AsyncIterable<SourceRecord>;
}
