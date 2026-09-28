import { Fragment, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { GlassCard } from "@osteojp/ui";

import type { GuideSpan, GuideViewBlock, GuideViewLesson } from "@/lib/guide/guide";
import { s } from "@/lib/i18n";

/**
 * G1: a lesson of Suporte e Guia, drawn from its block AST.
 *
 * REACT ELEMENTS ONLY, NEVER HTML. guide-data.json carries each lesson as
 * blocks and spans of plain text, and every one of them becomes a React
 * element here, so React escapes it. A lesson file that held markup would show
 * that markup as text on the page; it could never run in the staff app.
 * Nothing on /ajuda injects raw HTML, and ajuda-stores-nothing.test.ts holds
 * that (it refuses the React prop for raw HTML by name, even in a comment).
 *
 * RESOLVED BLOCKS ONLY. A block written for some roles (a "::: terapeuta"
 * block in the lesson source) never reaches this file: lib/guide resolves every
 * lesson, FAQ entry and section for the viewer before the page gets it
 * (guide.ts for lessons and FAQ entries, guide-routes.ts for a section's text),
 * so what arrives here is already that viewer's text. The types hold it: this
 * renderer takes GuideViewBlock, which has no role block, so passing raw
 * blocks from guide-data.json does not compile. An unresolved role block that
 * got here anyway would draw nothing.
 *
 * THE CAPTURE PAIR: a <picture> with the desktop capture from 768 px up and the
 * phone capture (390) below it. A lesson with no capture yet (images is null)
 * shows a visible "Sem imagem" card instead, never an image that cannot load.
 */

const HEADING = "text-base font-semibold text-v2-text-primary";
const TEXT = "text-sm leading-relaxed text-v2-text-primary";

function Spans({ spans }: { spans: GuideSpan[] }): ReactNode {
  return spans.map((span, i) =>
    "strong" in span ? (
      <strong key={i} className="font-semibold">
        {span.strong}
      </strong>
    ) : (
      <Fragment key={i}>{span.text}</Fragment>
    ),
  );
}

function renderBlock(block: GuideViewBlock, key: number, figure: ReactNode): ReactNode {
  switch (block.type) {
    case "heading":
      // The lesson title is the page's h1, so the body's "###" is an h2.
      return block.level <= 3 ? (
        <h2 key={key} className={HEADING}>
          <Spans spans={block.spans} />
        </h2>
      ) : (
        <h3 key={key} className={HEADING}>
          <Spans spans={block.spans} />
        </h3>
      );
    case "para":
      return (
        <p key={key} className={TEXT}>
          <Spans spans={block.spans} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <Spans spans={item} />
        </li>
      ));
      return block.kind === "ol" ? (
        <ol key={key} start={block.start} className={`list-decimal space-y-2 pl-5 ${TEXT}`}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={`list-disc space-y-2 pl-5 ${TEXT}`}>
          {items}
        </ul>
      );
    }
    case "figure":
      return <Fragment key={key}>{figure}</Fragment>;
    default:
      // No other block type type-checks here; at run time, a block this file
      // does not know (an unresolved role block among them) draws nothing.
      return null;
  }
}

/** The "Sem imagem" card a lesson shows until its capture exists. */
export function NoImageCard(): ReactNode {
  return (
    <GlassCard>
      <div data-guide-no-image="" className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted">
          <ImageOff size={20} strokeWidth={1.75} aria-hidden="true" className="text-v2-text-secondary" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-v2-text-primary">{s["guide.noImage"]}</p>
          <p className="text-sm text-v2-text-secondary">{s["guide.noImageHint"]}</p>
        </div>
      </div>
    </GlassCard>
  );
}

/** The lesson's capture pair, or the "Sem imagem" card when it has none. */
export function GuideFigure({ lesson }: { lesson: Pick<GuideViewLesson, "title" | "images"> }): ReactNode {
  const images = lesson.images;
  if (images === null) return <NoImageCard />;
  // The alt is the lesson title: one <img> serves both captures, so the
  // phone capture's own alt would describe the wrong screen on a computer.
  return (
    <figure data-guide-figure="" className="flex flex-col">
      <picture>
        <source media="(min-width: 768px)" srcSet={images.desktop.src} />
        {/* A static file in apps/web/public; next/image cannot art direct two captures, a <picture> can. */}
        <img
          src={images.phone.src}
          alt={lesson.title}
          loading="lazy"
          decoding="async"
          className="h-auto w-full rounded-md border border-v2-border"
        />
      </picture>
    </figure>
  );
}

/**
 * A lesson body, already resolved for its viewer. The capture pair sits where
 * the lesson source put it (its "figure" block); a lesson without one gets it
 * at the end.
 */
export function GuideBody({ lesson }: { lesson: Pick<GuideViewLesson, "title" | "images" | "blocks"> }): ReactNode {
  const figure = <GuideFigure lesson={lesson} />;
  const placed = lesson.blocks.some((block) => block.type === "figure");
  return (
    <div className="flex flex-col gap-4">
      {lesson.blocks.map((block, i) => renderBlock(block, i, figure))}
      {!placed && figure}
    </div>
  );
}

/** Section or FAQ text (no capture), already resolved for its viewer. */
export function GuideText({ blocks }: { blocks: GuideViewBlock[] }): ReactNode {
  return <div className="flex flex-col gap-3">{blocks.map((block, i) => renderBlock(block, i, null))}</div>;
}
