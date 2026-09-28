// Types for guide-model.mjs, so TypeScript tests in apps/web can import it.
// Keep in step with the module: every export there is declared here.

export type GuideProfile = 'rececao' | 'terapeuta' | 'proprietario';

export const REPO_ROOT: string;
export const CONTENT_DIR: string;
export const PUBLIC_DIR: string;
export const OUTLINE_FILE: string;
export const GUIDE_DATA_FILE: string;
export const WORD_LIMIT: number;

export const DASH_CHARS: ReadonlyArray<readonly [string, string]>;
export const HYPHEN_PUNCTUATION: RegExp;
export const IMG_LINE: RegExp;
export const IMG_ANY: RegExp;

export function imageProblem(src: string, baseDir: string): string | null;
export function lintLine(line: string, baseDir: string): string[];

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'list'; kind: 'ul' | 'ol'; start: number; items: string[] }
  | { type: 'image'; alt: string; src: string };

export function parseBlocks(lines: readonly string[]): MarkdownBlock[];

export const PROFILES: readonly GuideProfile[];
export const FRONT_MATTER_KEYS: readonly string[];
export const FAQ_FOLDER: string;
export const SECTION_FILE: string;

export class GuideError extends Error {
  constructor(errors: string[]);
  errors: string[];
}

export type ModelBlock = MarkdownBlock | { type: 'role'; roles: GuideProfile[]; blocks: ModelBlock[] };

export type ModelImage = { src: string; alt: string };

export type ModelItem = {
  kind: 'section' | 'lesson' | 'faq';
  id: string;
  section: string;
  slug: string;
  file: string;
  title: string;
  goal: string | null;
  question: string | null;
  roles: GuideProfile[];
  order: Partial<Record<GuideProfile, number>>;
  capability: string | null;
  screens: string[];
  shots: string | null;
  faq: string[];
  answers: string[];
  see: string[];
  review: string | null;
  hold: string | null;
  blocks: ModelBlock[];
  words: number;
  images: { phone: ModelImage; desktop: ModelImage } | null;
};

export type ModelSection = ModelItem & { folder: string };

export type Guide = {
  contentDir: string;
  publicDir: string;
  sections: ModelSection[];
  lessons: ModelItem[];
  faq: ModelItem[];
  errors: string[];
};

export type LoadOptions = {
  contentDir?: string;
  publicDir?: string;
  /** null skips the check of "screens" against the outline's capture names. */
  outlineFile?: string | null;
};

export function loadGuide(options?: LoadOptions): Guide;
export function countWords(blocks: readonly ModelBlock[]): number;
export function sectionsFor(
  guide: Guide,
  profile: GuideProfile,
  keep?: (lesson: ModelItem) => boolean,
): { section: ModelSection; lessons: ModelItem[] }[];
export function lessonsFor(guide: Guide, profile: GuideProfile, keep?: (lesson: ModelItem) => boolean): ModelItem[];
export function faqFor(guide: Guide, profile: GuideProfile, keep?: (entry: ModelItem) => boolean): ModelItem[];

export type Span = { text: string } | { strong: string };
export function inlineSpans(text: string): Span[];

export function guideData(guide: Guide): Record<string, unknown>;
export function serializeGuideData(data: unknown): string;
export function renderGuideData(options?: LoadOptions): string;
