// Types for the .mjs checker, so its verdict can be unit-tested under strict TS
// without loosening checkJs. The script itself stays plain .mjs: it is run by
// node directly from the prod-apply worktree, and there must be no build step
// between the reviewed file and the thing pointed at production.

export declare const EXPECTED_OWNER: string;
export declare const EXPECTED_COUNT: number;

/** The verdict as a pure function of catalog rows. Empty array = pass. */
export declare function evaluate(
  rows: { name: string; owner: string }[],
  opts?: { owner?: string; count?: number },
): string[];
