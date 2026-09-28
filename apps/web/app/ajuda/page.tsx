import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, MessageCircleQuestion } from "lucide-react";
import type { Role } from "@osteojp/auth";
import { EmptyState, GlassPanel } from "@osteojp/ui";

import { getRequestContext } from "@/lib/auth/context";
import { ajudaTab } from "@/lib/guide/ajuda-tab";
import { PROFILE_OF_ROLE, guideFaqFor, guideSectionsFor, type GuideProfile } from "@/lib/guide/guide";
import { sectionHref } from "@/lib/guide/guide-routes";
import { s } from "@/lib/i18n";

import { AjudaTabs } from "./ajuda-tabs.client";
import { GuideText } from "./guide-blocks";
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
 * NOT LINKED FROM ANYWHERE YET. The sidebar entry is its own PR; until then
 * the page is reachable by its address only.
 */
export default async function AjudaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const tab = ajudaTab((await searchParams).tab);
  const profile = PROFILE_OF_ROLE[ctx.role];
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
        {tab === "guia" ? <GuidePart role={ctx.role} /> : <FaqPart role={ctx.role} profile={profile} />}
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
        <LessonList lessons={lessons} />
      </div>
    </GlassPanel>
  ));
}

/**
 * Perguntas frequentes. The entries are written in their own PR; until then
 * every role sees the empty state. An entry, once written, shows its question
 * and its answer for this role.
 */
function FaqPart({ role, profile }: { role: Role; profile: GuideProfile }) {
  const entries = guideFaqFor(role);
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={MessageCircleQuestion}
        title={s["guide.faqEmptyTitle"]}
        description={s["guide.faqEmptyDescription"]}
      />
    );
  }
  return entries.map((entry) => (
    <GlassPanel key={entry.id}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-v2-text-primary">{entry.question ?? entry.title}</h2>
        <GuideText blocks={entry.blocks} profile={profile} />
      </div>
    </GlassPanel>
  ));
}
