// Types for the .mjs checker, so its matching rule can be unit-tested under
// TypeScript strict without loosening `checkJs` or adding `any` at the import.
//
// The script itself stays plain .mjs on purpose: it is run by `node` directly
// from the prod-apply worktree, with no build step between the reviewed file and
// the thing pointed at production.

/**
 * Strip SQL block and line comments. Exported so the negative-arm test can prove
 * a commented-out call FAILS the body check - a bare substring match cannot tell
 * a call from a comment, and the two mean opposite things.
 */
export function stripSqlComments(sql: string): string;
