import Link from "next/link";
import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { GlassCard } from "@osteojp/ui";

import type { GuideLesson } from "@/lib/guide/guide";
import { lessonHref } from "@/lib/guide/guide-routes";
import { s } from "@/lib/i18n";

/**
 * G1: the chrome the three /ajuda pages share. Links are accent-2-700, the
 * platform's text colour for interaction (AA 4.83:1 on white); nothing here is
 * purple, which the 55/25/20 ruling keeps for emphasis (the active tab).
 */

export const LINK =
  "rounded text-accent-2-700 underline-offset-2 hover:underline " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/** "1 lição" or "N lições". */
export function lessonCount(n: number): string {
  return n === 1 ? s["guide.lessonCountOne"] : s["guide.lessonCountMany"].replace("{n}", String(n));
}

/** The page heading: an h1 and an optional line under it. */
export function GuideHeader({ title, subtitle }: { title: string; subtitle?: string | null }): ReactNode {
  return (
    <header>
      <h1 className="text-xl font-semibold text-v2-text-primary">{title}</h1>
      {subtitle ? <p className="mt-1 max-w-3xl text-sm text-v2-text-secondary">{subtitle}</p> : null}
    </header>
  );
}

/** Where the page sits in the guide: Suporte e Guia, then each level down to this page, which is not a link. */
export function GuideBreadcrumb({ trail }: { trail: { href: string; label: string }[] }): ReactNode {
  return (
    <nav aria-label={s["guide.breadcrumbLabel"]}>
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {trail.map((step, i) => (
          <li key={step.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden="true" className="text-v2-text-secondary" />}
            {i === trail.length - 1 ? (
              <span aria-current="page" className="text-v2-text-secondary">
                {step.label}
              </span>
            ) : (
              <Link href={step.href} className={LINK}>
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A lesson as a card in a list: its title as the link, and its goal. */
export function LessonCard({ lesson }: { lesson: GuideLesson }): ReactNode {
  return (
    <GlassCard className="h-full">
      <h3 className="text-sm font-semibold">
        <Link href={lessonHref(lesson)} className={LINK} data-guide-lesson={lesson.id}>
          {lesson.title}
        </Link>
      </h3>
      {lesson.goal ? <p className="mt-1 text-sm text-v2-text-secondary">{lesson.goal}</p> : null}
    </GlassCard>
  );
}

/** A role's lessons as a list of cards, in order. */
export function LessonList({ lessons }: { lessons: GuideLesson[] }): ReactNode {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {lessons.map((lesson) => (
        <li key={lesson.id}>
          <LessonCard lesson={lesson} />
        </li>
      ))}
    </ol>
  );
}
