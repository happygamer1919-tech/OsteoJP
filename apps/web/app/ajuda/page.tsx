import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Role } from "@osteojp/auth";
import { EmptyState, GlassPanel } from "@osteojp/ui";

import { requireRequestContext } from "@/lib/auth/context";
import { ajudaTab } from "@/lib/guide/ajuda-tab";
import { guideFaqFor, guideSectionsFor } from "@/lib/guide/guide";
import { faqAnchor, lessonHref, sectionHref } from "@/lib/guide/guide-routes";
import { s } from "@/lib/i18n";

import { AjudaTabs } from "./ajuda-tabs.client";
import { GuideBody } from "./guide-blocks";
import { GuideHeader, LINK, LessonList, lessonCount } from "./guide-chrome";

export const metadata = { title: s["guide.title"] };

const PANEL_ID = "ajuda-painel";

/**
 * G1: Suporte e Guia. Two parts on one address: "Guia da plataforma" (the
 * default) and "Perguntas frequentes" (?tab=perguntas).
 *
 * THE GUIDE IS THE VIEWER'S OWN. Each role reads its own lessons in its own
 * order (reception the Receção guide, a therapist the Terapeuta guide, the
 * owner every published lesson, an admin the Proprietário lessons whose
 * capability it holds), from guide-data.json through lib/guide/guide.ts. This
 * orders and trims a public document; it guards nothing, and nothing here reads
 * the database.
 *
 * NOTHING ABOUT THE VIEWER IS KEPT (G1-6). The request context is read only to
 * know the role; app/ajuda/ajuda-stores-nothing.test.ts lists every mechanism
 * that rules out and holds each file here to it.
 *
 * THE SESSION IS READ WITH requireRequestContext, THE RENDER PATH HELPER
 * (OSTEOJP-WEB-8), on all three /ajuda pages: a visitor with no session is sent
 * to /login, and an Auth outage is reported to Sentry and fails the render
 * instead of passing for a logout.
 *
 * NOT LINKED FROM ANYWHERE YET. The sidebar entry is its own PR; until then
 * the page is reachable by its address only.
 */
export default async function AjudaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireRequestContext();

  const tab = ajudaTab((await searchParams).tab);
  const tabs = [
    { value: "guia" as const, label: s["guide.tabGuide"] },
    { value: "perguntas" as const, label: s["guide.tabFaq"] },
  ];
  const activeLabel = tab === "guia" ? s["guide.tabGuide"] : s["guide.tabFaq"];

  return (
    <div className="flex flex-col gap-6 p-6">
      <GuideHeader title={s["guide.title"]} subtitle={s["guide.subtitle"]} />
      <AjudaTabs current={tab} items={tabs} label={s["guide.tabsLabel"]} panelId={PANEL_ID} />
      <div id={PANEL_ID} role="tabpanel" aria-label={activeLabel} className="flex flex-col gap-6">
        {tab === "guia" ? <GuidePart role={ctx.role} /> : <FaqPart role={ctx.role} />}
      </div>
    </div>
  );
}

/** Guia da plataforma: one panel per section, in the role's order, each with its lessons. */
function GuidePart({ role }: { role: Role }) {
  const sections = guideSectionsFor(role);
  if (sections.length === 0) {
    return (
      <EmptyState icon={BookOpen} title={s["guide.guideEmptyTitle"]} description={s["guide.guideEmptyDescription"]} />
    );
  }
  return sections.map(({ section, lessons }) => (
    <GlassPanel key={section.id}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            <Link href={sectionHref(section.id)} className={LINK} data-guide-section={section.id}>
              {section.title}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-v2-text-secondary">
            {section.goal ? `${section.goal} ` : ""}
            {lessonCount(lessons.length)}
          </p>
        </div>
        <LessonList lessons={lessons} headingLevel={3} />
      </div>
    </GlassPanel>
  ));
}

/**
 * Perguntas frequentes: the seven base tasks first, in this role's order (the
 * "order" key of each file in docs/guide/content/00-perguntas), each for this
 * role only. Reception and an admin read six (Assinar registo needs
 * clinical_records:sign), a therapist and the owner read seven.
 *
 * NO EMPTY STATE. Every role reads at least six entries, and
 * lib/guide/guide-roles.test.ts holds each role to its list by hand, so a
 * role left with none fails there instead of reaching this page.
 *
 * Each entry is its question (an h2), the short answer as this role reads it
 * (guideFaqFor resolves its role blocks), its primary lesson's capture pair or
 * the "Sem imagem" card, and links to the lessons it names that this role
 * reads, the primary lesson first. An entry has no page of its own; its id
 * (pergunta-<slug>) makes it an address a colleague can send.
 */
function FaqPart({ role }: { role: Role }) {
  return guideFaqFor(role).map((entry) => (
    <GlassPanel key={entry.id}>
      <article id={faqAnchor(entry)} data-guide-faq={entry.id} className="flex max-w-3xl scroll-mt-6 flex-col gap-4">
        <h2 className="text-lg font-semibold text-v2-text-primary">{entry.question ?? entry.title}</h2>
        <GuideBody lesson={entry} />
        {entry.lessons.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-v2-text-primary">{s["guide.faqLessonsLabel"]}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {entry.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link href={lessonHref(lesson)} className={LINK} data-guide-faq-lesson={lesson.id}>
                    {lesson.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </GlassPanel>
  ));
}
