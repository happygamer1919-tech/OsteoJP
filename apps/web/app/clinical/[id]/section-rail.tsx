"use client";

import { useEffect, useState } from "react";

const cx = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(" ");

/**
 * Clinical-editor section rail (SPEC-staff-screens §7). Anchor nav generated
 * from the form's top-level fields; the section in view gets a 2px accent-2-700
 * left bar (desktop). Under 1024px it becomes a horizontal scrolling row above
 * the form. No decoration, no heritage.
 */
export function SectionRail({
  anchors,
  label,
}: {
  anchors: { id: string; label: string }[];
  label: string;
}) {
  const [active, setActive] = useState(anchors[0]?.id ?? "");

  useEffect(() => {
    if (anchors.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const a of anchors) {
      const el = document.getElementById(a.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [anchors]);

  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
      {anchors.map((a) => {
        const isActive = active === a.id;
        return (
          <a
            key={a.id}
            href={`#${a.id}`}
            aria-current={isActive ? "location" : undefined}
            className={cx(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
              "lg:rounded-none lg:border-l-2 lg:px-3 lg:whitespace-normal lg:break-words",
              isActive
                ? "text-text-primary lg:border-accent-2-700"
                : "text-text-secondary hover:text-text-primary lg:border-transparent",
            )}
          >
            {a.label}
          </a>
        );
      })}
    </nav>
  );
}
