/**
 * Top-level field key → its rail anchor id. Plain module (no "use client") so the
 * server page can call it to build the rail while the client form uses it for the
 * field element ids.
 */
export function fieldAnchorId(key: string): string {
  return `section-${key}`;
}
