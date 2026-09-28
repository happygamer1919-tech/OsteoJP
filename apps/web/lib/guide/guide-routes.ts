// The addresses of Suporte e Guia, and the lookups the /ajuda pages make.
//
// A lesson id is "<section>.<slug>" (agenda.marcar-consulta), and its page is
// /ajuda/<section>/<slug>. Every lookup here goes through the role's own list
// from guide.ts, so a lesson or a section outside the viewer's guide is simply
// not found: the page answers it with notFound(), exactly like an address that
// never existed. A held lesson (M1, GUEST-05) is in no role's list, so it is
// not found either.
//
// ROLE BLOCKS ARE RESOLVED IN lib/guide, NEVER ON THE PAGE. guide.ts hands
// back every lesson with its role blocks already resolved for the viewer;
// sectionFor below does the same for a section's own text, with the same
// blocksFor. So a page only
// ever receives text for its viewer, and the renderer (app/ajuda/guide-blocks)
// takes resolved blocks only: raw section or lesson blocks do not type-check
// there.
//
// This is presentation, not access control: the whole guide is public in the
// repository. Nothing about a viewer is read or stored here.

import type { Role } from "@osteojp/auth";

import { AJUDA_PATH } from "./ajuda-tab";
import {
  GUIDE_DATA,
  blocksFor,
  guideLessonsFor,
  guideSectionsFor,
  type GuideData,
  type GuideLesson,
  type GuideSection,
  type GuideViewBlock,
  type GuideViewLesson,
} from "./guide";

/** A section as one viewer reads it: its role blocks resolved, like its lessons. */
export type GuideViewSection = Omit<GuideSection, "blocks"> & { blocks: GuideViewBlock[] };

/** The part of a lesson id after its section: "marcar-consulta" for agenda.marcar-consulta. */
export function lessonSlug(lesson: Pick<GuideLesson, "id" | "section">): string {
  return lesson.id.slice(lesson.section.length + 1);
}

export function sectionHref(sectionId: string): string {
  return `${AJUDA_PATH}/${sectionId}`;
}

export function lessonHref(lesson: Pick<GuideLesson, "id" | "section">): string {
  return `${AJUDA_PATH}/${lesson.section}/${lessonSlug(lesson)}`;
}

/**
 * The section at /ajuda/<seccao> as this role reads it (its text resolved for
 * the role) with the lessons the role reads there, or null when it reads none
 * there.
 */
export function sectionFor(
  role: Role,
  seccao: string,
  data: GuideData = GUIDE_DATA,
): { section: GuideViewSection; lessons: GuideViewLesson[] } | null {
  const found = guideSectionsFor(role, data).find((entry) => entry.section.id === seccao);
  if (!found) return null;
  return { section: { ...found.section, blocks: blocksFor(role, found.section.blocks) }, lessons: found.lessons };
}

export type LessonPage = {
  /** Its role blocks already resolved for the viewer (guide.ts). */
  lesson: GuideViewLesson;
  section: GuideSection;
  /** The lessons before and after this one in the role's whole course, across sections. */
  previous: GuideViewLesson | null;
  next: GuideViewLesson | null;
};

/**
 * The lesson at /ajuda/<seccao>/<licao> if this role reads it, with its
 * neighbours in the role's order; null otherwise.
 *
 * NAMED lessonPageFor, NOT lessonFor: guide.ts already exports lessonFor(role,
 * item), which resolves one lesson's role blocks. This one looks a lesson page
 * up by its address, so it gets its own name.
 */
export function lessonPageFor(
  role: Role,
  seccao: string,
  licao: string,
  data: GuideData = GUIDE_DATA,
): LessonPage | null {
  const lessons = guideLessonsFor(role, data);
  const index = lessons.findIndex((lesson) => lesson.section === seccao && lessonSlug(lesson) === licao);
  const lesson = lessons[index];
  if (!lesson) return null;
  const section = data.sections.find((entry) => entry.id === lesson.section);
  if (!section) return null;
  return {
    lesson,
    section,
    previous: lessons[index - 1] ?? null,
    next: lessons[index + 1] ?? null,
  };
}
