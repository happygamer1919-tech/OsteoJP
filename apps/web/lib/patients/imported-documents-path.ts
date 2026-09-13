// G-D (2026-09-13) - WHICH ATTACHMENTS THE FISIOZERO IMPORT BROUGHT IN.
//
// The import copies every original document to
// `${tenantId}/migration/fisiozero/<delivery file name>`
// (attachmentStoragePath in packages/db/src/migration/sources/fisiozero.ts) and
// nothing else in the product writes under that prefix: staff uploads go to
// `${tenantId}/<recordId>/...` and `${tenantId}/patient-documents/...`. So the
// prefix is what marks an attachment as imported, with no extra column.
//
// RESTATED HERE RATHER THAN IMPORTED because @osteojp/db's index does not export
// the adapter. imported-documents-path.test.ts pins this against the adapter's
// own helper, so the two cannot drift.

/** The storage-path prefix under which the import placed a tenant's originals. */
export function importedDocumentPrefix(tenantId: string): string {
  return `${tenantId}/migration/fisiozero/`;
}
