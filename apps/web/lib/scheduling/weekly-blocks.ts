import "server-only";
import { eq } from "drizzle-orm";
import { therapistWeeklyBlocks, weeklyBlocksSchemaPresent, type DbTx } from "@osteojp/db";
import { s } from "@/lib/i18n";
import type { BlockRow } from "./day-availability-core";
import { expandWeeklyRules, type WeeklyRule } from "./weekly-blocks-core";

/**
 * BLOQUEIOS DE REPETICAO SEMANAL - the ONE staff-side read of a therapist's
 * weekly rules, as blocks over a range.
 *
 * Every staff reader of blocked time composes this beside its time_off read:
 * the availability read (Nova marcacao, Agendar lote, the Horarios inspector),
 * the agenda's hatched band, and the conflict check that answers "Guardar
 * mesmo assim". One function, so no reader can learn the rules and another
 * forget them (W9-04's "do not derive a second, divergent block source").
 *
 * INERT UNTIL THE TABLE EXISTS. The migration is pending; on a database built
 * without it, `weeklyBlocksSchemaPresent` answers false and this returns [] with
 * no query against the table, so every reader behaves exactly as before.
 *
 * Runs on the caller's tenant-scoped tx: RLS scopes it to the caller's tenant,
 * and this module never filters tenant_id by hand.
 */
export async function readWeeklyBlockRows(
  tx: DbTx,
  args: { therapistId: string; rangeStart: Date; rangeEnd: Date },
): Promise<BlockRow[]> {
  const rules = await readWeeklyRules(tx, args.therapistId);
  // The band's label: the rule has no note of its own, and "Bloqueio semanal"
  // tells the reader where to go to remove it (the Bloqueios page), which is
  // the question SCHED-19 made the note answer.
  return expandWeeklyRules(rules, args.rangeStart, args.rangeEnd, s["blocks.weeklyBandNote"]);
}

/** The therapist's rules, or [] when the table does not exist yet. */
export async function readWeeklyRules(tx: DbTx, therapistId: string): Promise<WeeklyRule[]> {
  if (!(await weeklyBlocksSchemaPresent(tx))) return [];
  return tx
    .select({
      id: therapistWeeklyBlocks.id,
      userId: therapistWeeklyBlocks.userId,
      weekday: therapistWeeklyBlocks.weekday,
      startTime: therapistWeeklyBlocks.startTime,
      endTime: therapistWeeklyBlocks.endTime,
    })
    .from(therapistWeeklyBlocks)
    .where(eq(therapistWeeklyBlocks.userId, therapistId));
}
