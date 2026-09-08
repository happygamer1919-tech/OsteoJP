import "server-only";
import { assertCan } from "@osteojp/auth";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  archiveTemplateIn,
  createTemplateIn,
  updateTemplateIn,
} from "./availability";
import { reconcileWeek, type FieldSource } from "./schedule-reconcile";
import { assertTargetInScheduleScope, resolveScheduleScope } from "./schedule-scope";

/**
 * SAVE THE WHOLE WEEK IN ONE TRANSACTION. Added 2026-09-08 for the P0.
 *
 * ==========================================================================
 * WHAT IT REPLACES, AND WHY THE OLD SHAPE WAS THE HALF THAT LOOKED LIKE MADNESS
 * ==========================================================================
 * Both surfaces called `reconcileWeek` with the three PUBLIC write functions,
 * and each of those opened its own `runScoped` transaction. `reconcileWeek`
 * drives weekday 0..6 with `await` in a loop, so a refusal on one weekday threw
 * out of the loop AFTER the earlier weekdays had already COMMITTED - and the
 * catch in the server action turned that into "Nao foi possivel guardar as
 * alteracoes", a sentence that says nothing was saved.
 *
 * WHAT RECEPTION THEN SEES is a week that has half-changed under a message
 * telling her it did not change, with the days she ticked coming back unticked
 * because the reload reads a database that disagrees with what she was told.
 * Reported from Castelo Branco on 2026-09-08 as the editor "not letting her tick
 * the days", which is exactly what that looks like from the desk.
 *
 * ONE TRANSACTION MAKES THE MESSAGE TRUE. A throw anywhere in the seven days
 * rolls the whole submit back, so "could not save" means nothing changed, and a
 * successful save means all of it landed.
 *
 * ==========================================================================
 * THE SCOPE AND THE CAPABILITY ARE CHECKED ONCE, HERE, AND STILL PER ROW
 * ==========================================================================
 * `assertCan` and `resolveScheduleScope` move out of the seven inner calls
 * because they do not depend on the weekday. `assertTargetInScheduleScope` is
 * still called inside every write, against the row's OWN therapist as well as
 * the target - a located receptionist must not reach another clinic's roster,
 * and that check belongs where the row is.
 *
 * IT IS SHARED BY BOTH SURFACES for the reason `schedule-reconcile.ts` already
 * gives about itself: /horarios and /admin/staff held two copies of this call
 * that differed only in where they redirect, and one learning to be atomic
 * without the other would leave reception saving a week that admin could still
 * half-write.
 */
export async function saveWeekSchedule(
  actor: RequestContext,
  userId: string,
  fd: FieldSource,
): Promise<void> {
  assertCan(actor.role, "schedule:manage");
  const scope = await resolveScheduleScope(actor);
  await runScoped(actor, async (tx) => {
    // Fail before any write when the target is not this actor's to manage, so a
    // refusal for the WRONG THERAPIST never reads as a schedule conflict.
    await assertTargetInScheduleScope(tx, userId, scope);
    await reconcileWeek(fd, userId, {
      create: (input) => createTemplateIn(tx, actor, scope, input),
      update: (id, input) => updateTemplateIn(tx, actor, scope, id, input),
      archive: (id) => archiveTemplateIn(tx, actor, scope, id),
    });
  });
}
