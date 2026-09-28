import type { ScheduleScope } from "@/lib/admin/schedule-scope";
import type { StringKey } from "@osteojp/i18n";

/**
 * T5 F5 (guide finding, #1462): the page heading follows the SCHEDULE SCOPE.
 *
 * "Horários da equipa" and "the therapists of your location" are true for a
 * scope that lists a team. Under the `self` scope (a therapist) page.tsx
 * narrows the roster to the viewer's own card, so the page is their own
 * schedule and says so.
 *
 * KEYED ON THE SCOPE, NOT ON THE ROLE, because the scope is what decides which
 * cards render (page.tsx, `therapists`). A heading keyed on the role would be
 * a second copy of that rule, free to drift from it.
 *
 * Its own module because a Next.js page file may export only the route's own
 * names, and a pure function here is testable without rendering the page.
 */
export function scheduleHeadingKeys(scope: ScheduleScope): { title: StringKey; subtitle: StringKey } {
  return scope.kind === "self"
    ? { title: "schedule.titleSelf", subtitle: "schedule.subtitleSelf" }
    : { title: "schedule.title", subtitle: "schedule.subtitle" };
}
