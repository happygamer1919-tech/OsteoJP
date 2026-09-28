// Types for guide-pdf.mjs, so TypeScript tests in apps/web can import it.
// Keep in step with the module: every export there is declared here.

import type { GuideProfile } from './guide-model.mjs';

export const PDF_DIR: string;
export const MANIFEST_NAME: string;
export const MANIFEST_FILE: string;
export const GUIDE_TITLE: string;
export const TITLE_PREFIX_LENGTH: number;

export type PdfJob = { profile: GuideProfile | null; label: string | null; file: string };
export const PDF_JOBS: readonly PdfJob[];

export function sha256Hex(bytes: Uint8Array | string): string;
export function sourcePrefix(sourceHash: string): string;
export function titleMark(sourceHash: string): string;
export function pdfTitle(label: string | null, sourceHash: string): string;
export function countPdfPages(pdf: Uint8Array): number;
export function readPdfTitle(pdf: Uint8Array): string | null;

export type PdfManifestEntry = {
  file: string;
  profile: GuideProfile | null;
  pages: number;
  bytes: number;
  sha256: string;
  lessons: number;
  faq: number;
};

export type PdfManifest = {
  $comment: string;
  format: number;
  source: { sha256: string; sections: number; lessons: number; faq: number };
  pdfs: PdfManifestEntry[];
};

export function readManifest(file?: string): PdfManifest;

export type PdfProblems = {
  manifest: string[];
  source: string[];
  files: string[];
  sha256: string[];
  title: string[];
};

export function checkGuidePdfs(options: { pdfDir?: string; manifest: unknown; sourceHash: string }): PdfProblems;
