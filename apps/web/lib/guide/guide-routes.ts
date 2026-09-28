// The addresses of Suporte e Guia, and the lookups the /ajuda pages make.
//
// A lesson id is "<section>.<slug>" (agenda.marcar-consulta), and its page is
// /ajuda/<section>/<slug>. Every lookup here goes through the role's own list
// from guide.ts, so a lesson or a section outside the viewer's guide is simply
// not found: the page answers it with notFound(), exactly like an address that
// never existed. A held lesson (M1, GUEST-05) is in no role's list, so it is
// not found either.
//
// This is presentation, not access control: the whole guide is public in the
// repository. Nothing about a viewer is read or stored here.

import type { Role } from "@osteojp/auth";

import { AJUDA_PATH } from "./ajuda-tab";
import {
  GUIDE_DATA,
  guideLessonsFor,
  guideSectionsFor,
  type GuideData,
  type GuideLesson,
  type GuideSection,
} from "./guide";

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

/** The section at /ajuda/<seccao> with the lessons this role reads there, or null when the role reads none there. */
export function sectionFor(
  role: Role,
  seccao: string,
  data: GuideData = GUIDE_DATA,
): { section: GuideSection; lessons: GuideLesson[] } | null {
  return guideSectionsFor(role, data).find((entry) => entry.section.id === seccao) ?? null;
}

export type LessonPage = {
  lesson: GuideLesson;
  section: GuideSection;
  /** The lessons before and after this one in the role's whole course, across sections. */
  previous: GuideLesson | null;
  next: GuideLesson | null;
};

/** The lesson at /ajuda/<seccao>/<licao> if this role reads it, with its neighbours in the role's order; null otherwise. */
export function lessonFor(
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
