import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlassPanel } from "@osteojp/ui";

import { getRequestContext } from "@/lib/auth/context";
import { AJUDA_PATH } from "@/lib/guide/ajuda-tab";
import { PROFILE_OF_ROLE } from "@/lib/guide/guide";
import { lessonFor, lessonHref, sectionHref } from "@/lib/guide/guide-routes";
import { s } from "@/lib/i18n";

import { GuideBody } from "../../guide-blocks";
import { GuideBreadcrumb, GuideHeader, LINK } from "../../guide-chrome";

export const metadata = { title: s["guide.title"] };

/**
 * G1: one lesson of Guia da plataforma, for the viewer's role.
 *
 * The body shows only the viewer's role blocks, and its capture pair (or the
 * "Sem imagem" card while it has none). Under it, the lesson before and the
 * lesson after this one in the role's own course, across sections.
 *
 * A LESSON OUTSIDE THE VIEWER'S GUIDE IS NOT FOUND: an unknown address, a
 * lesson written for other roles (a therapist opening Faturas de um período),
 * one whose capability the role lacks (an admin opening a Registos lesson) and
 * a held lesson (Marcação online M1, behind GUEST-05) all answer 404.
 */
export default async function AjudaLicaoPage({
  params,
}: {
  params: Promise<{ seccao: string; licao: string }>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const { seccao, licao } = await params;
  const found = lessonFor(ctx.role, seccao, licao);
  if (!found) notFound();
  const { lesson, section, previous, next } = found;

  return (
    <div className="flex flex-col gap-6 p-6">
      <GuideBreadcrumb
        trail={[
          { href: AJUDA_PATH, label: s["guide.title"] },
          { href: sectionHref(section.id), label: section.title },
          { href: lessonHref(lesson), label: lesson.title },
        ]}
      />
      <GuideHeader title={lesson.title} subtitle={lesson.goal} />
      <GlassPanel>
        <article className="max-w-3xl">
          <GuideBody lesson={lesson} profile={PROFILE_OF_ROLE[ctx.role]} />
        </article>
      </GlassPanel>
      {(previous || next) && (
        <nav aria-label={s["guide.lessonNavLabel"]} className="flex flex-wrap justify-between gap-4 text-sm">
          {previous ? (
            <Link href={lessonHref(previous)} className={`${LINK} inline-flex items-center gap-1`} rel="prev">
              <ChevronLeft size={16} aria-hidden="true" className="shrink-0" />
              <span className="flex flex-col">
                <span className="text-xs text-v2-text-secondary">{s["guide.previousLesson"]}</span>
                <span>{previous.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={lessonHref(next)} className={`${LINK} inline-flex items-center gap-1`} rel="next">
              <span className="flex flex-col text-right">
                <span className="text-xs text-v2-text-secondary">{s["guide.nextLesson"]}</span>
                <span>{next.title}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  );
}
