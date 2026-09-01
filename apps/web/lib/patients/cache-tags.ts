/**
 * Cache invalidation tags for the patient surface.
 *
 * ==========================================================================
 * WHY THIS IS ITS OWN MODULE AND NOT A CONST IN `list-queries.ts`
 * ==========================================================================
 * It was, for about an hour, and it broke three unrelated test files.
 *
 * `list-queries.ts` calls `unstable_cache(...)` AT MODULE LOAD. So the moment
 * `actions.ts` imported the tag from there, every test that imports `actions.ts`
 * also loaded the query layer and evaluated that call - and three suites that
 * legitimately mock `next/cache` with just the two functions they use started
 * failing with `No "unstable_cache" export is defined on the "next/cache" mock`.
 *
 * THE FIX IS NOT TO WIDEN THOSE THREE MOCKS. That would make three unrelated
 * files carry knowledge of what the patient query layer happens to call at
 * import time, and the next module-level call would break them again. A
 * constant has no reason to drag a side effect behind it, so it lives somewhere
 * with no side effects to drag.
 *
 * This file must stay free of imports and of top-level calls. That is the whole
 * job.
 */

/**
 * The four numbers above the /patients filter bar. SR-25.
 *
 * Named in exactly two places - the `unstable_cache` that carries it and the
 * `updateTag` that drops it - and imported from here by both, because a tag
 * written twice is a tag that stops matching the day one of them is edited.
 */
export const PATIENT_STATS_TAG = "patients-stat-strip" as const;
