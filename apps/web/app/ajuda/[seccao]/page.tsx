import { notFound, redirect } from "next/navigation";
import { GlassPanel } from "@osteojp/ui";

import { getRequestContext } from "@/lib/auth/context";
import { AJUDA_PATH } from "@/lib/guide/ajuda-tab";
import { sectionFor, sectionHref } from "@/lib/guide/guide-routes";
import { s } from "@/lib/i18n";

import { GuideText } from "../guide-blocks";
import { GuideBreadcrumb, GuideHeader, LessonList, lessonCount } from "../guide-chrome";

export const metadata = { title: s["guide.title"] };

/**
 * G1: one section of Guia da plataforma, with the lessons the viewer's role
 * reads there, in its order.
 *
 * A SECTION OUTSIDE THE VIEWER'S GUIDE IS NOT FOUND, the same answer as an
 * address that never existed: reception opening /ajuda/registos gets a 404,
 * not an empty page. It protects nothing (the guide is public in the
 * repository); it keeps a stale link from showing a role a section it cannot
 * use.
 *
 * The section's own text comes from sectionFor already resolved for the
 * viewer's role, like its lessons.
 */
export default async function AjudaSeccaoPage({ params }: { params: Promise<{ seccao: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const { seccao } = await params;
  const found = sectionFor(ctx.role, seccao);
  if (!found) notFound();
  const { section, lessons } = found;

  return (
    <div className="flex flex-col gap-6 p-6">
      <GuideBreadcrumb
        trail={[
          { href: AJUDA_PATH, label: s["guide.title"] },
          { href: sectionHref(section.id), label: section.title },
        ]}
      />
      <GuideHeader title={section.title} subtitle={section.goal} />
      <GlassPanel>
        <div className="flex flex-col gap-4">
          <GuideText blocks={section.blocks} />
          <p className="text-sm text-v2-text-secondary">{lessonCount(lessons.length)}</p>
          {/* The section title is this page's h1, so each lesson card is an h2. */}
          <LessonList lessons={lessons} headingLevel={2} />
        </div>
      </GlassPanel>
    </div>
  );
}
