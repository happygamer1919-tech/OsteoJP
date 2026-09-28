// Types for guide-names.mjs, so TypeScript tests in apps/web can import it.
// Keep in step with the module: every export there is declared here.

export const FORMAT_PREFIX: string;
export const MIN_RUN: number;
export const MAX_RUN: number;
export const SECRET_LIMIT: number;

export class GuideNamesError extends Error {}

export function normalizedWords(text: string): string[];
export function normalize(text: string): string;
export function nameKey(name: string): string | null;
export function hash32(normalized: string): number;
export function encodeNames(names: Iterable<string>): string;
export function encodeHashes(hashes: Iterable<number>): string;
export function partOf(hashes: number[], part: number, parts: number): number[];
export function decodeNames(encoded: string): number[];
export function candidates(text: string): { text: string; line: number }[];
export function hitLines(text: string, list: Iterable<number> | Set<number>): number[];
export function lineContext(text: string, line: number): string;
export function contextHash(text: string, line: number): string;
export function contextHashes(text: string): string[];
export function parseWaivers(text: string): Set<string>;
