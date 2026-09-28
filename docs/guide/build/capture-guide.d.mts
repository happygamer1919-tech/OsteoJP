// Types for capture-guide.mjs, so TypeScript tests in apps/web can import it.
// Keep in step with the module: every export there is declared here.

export const SHOTS_DIR: string;
export const TEXT_DIR: string;
export const AJUDA_DIR: string;

export const LOCAL_HOSTS: ReadonlyArray<string>;

/** The base URL's origin; throws unless it is http(s) on a local host, with no credentials. */
export function checkBaseUrl(raw: string): string;

export type CaptureSize = {
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  arm: number;
};
export const SIZES: Record<'390' | 'desktop', CaptureSize>;

export type CaptureSpec = {
  id: string;
  profile: string;
  sizes: string[];
  stabilize?: unknown[];
  frames: unknown[];
  section: string;
  slug: string;
  rel: string;
};
export function readSpec(file: string): CaptureSpec;

/** What one frame shows as text; run in the page by page.evaluate. */
export type FrameText = { text: string; values: string[] };
export function visibleText(): FrameText;

export function textRecord(png: Uint8Array | string, frames: FrameText[]): string;

export function outputsOf(section: string, slug: string, sizeKey: string): { png: string; text: string };
