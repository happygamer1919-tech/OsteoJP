// Types for the .mjs guard, so the TypeScript seeds and rehearsal entrypoints
// under packages/db can call it under strict TS. The guard itself stays plain
// .mjs: the bare-node scripts in this folder import it with no build step.

export declare const PROD_APPLY_SEGMENT: string;
export declare const REFUSE_EXIT_CODE: number;
export declare const PATH_FLAGS: readonly string[];

export declare function physicalPath(p: string): string;
export declare function isUnderProdApply(p: string): boolean;
export declare function pathArguments(argv: readonly string[]): string[];

export interface ProdApplyWhere {
  cwd?: string;
  argv?: readonly string[];
  paths?: readonly string[];
}

export declare function prodApplyHit(where?: ProdApplyWhere & { script?: string | URL }): string | null;

/** Call first, with `import.meta.url`. Prints the REFUSE line and exits 86 on a match. */
export declare function refuseProdApplyCwd(
  script: string | URL,
  opts?: ProdApplyWhere & { code?: number; exit?: (code: number) => void; write?: (line: string) => void },
): void;
