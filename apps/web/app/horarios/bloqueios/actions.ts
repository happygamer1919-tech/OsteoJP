"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { isAdminError } from "@/lib/admin/errors";
import { createTimeOffBlock, deleteTimeOffBlock } from "@/lib/admin/time-off";
import { createWeeklyBlock, deleteWeeklyBlock } from "@/lib/admin/weekly-blocks";

/**
 * BLOQUEIOS NA AGENDA / FERIAS - the page's four writes. Thin wrappers: every
 * library function asserts `schedule:manage` and the schedule scope itself, so
 * nothing here adds authority. Each redirects back with a result code the page
 * turns into one sentence.
 */
const PAGE = "/horarios/bloqueios";

async function run(fn: () => Promise<{ overlaps?: unknown[] } | unknown>): Promise<never> {
  let code = "ok";
  try {
    const res = await fn();
    const overlaps =
      res && typeof res === "object" && "overlaps" in res && Array.isArray((res as { overlaps: unknown[] }).overlaps)
        ? (res as { overlaps: unknown[] }).overlaps.length
        : 0;
    if (overlaps > 0) code = `warn:${overlaps}`;
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath(PAGE);
  revalidatePath("/agenda");
  redirect(`${PAGE}?m=${code}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Modo REPETICAO SEMANAL: Terapeuta, Todas as, Das, Ate. */
export async function createWeeklyBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const weekdayRaw = str(fd, "weekday");
  await run(() =>
    createWeeklyBlock(actor, {
      userId: str(fd, "userId"),
      // "" must not become 0 (Sunday): an unchosen weekday is refused.
      weekday: weekdayRaw === "" ? Number.NaN : Number(weekdayRaw),
      startTime: str(fd, "startTime"),
      endTime: str(fd, "endTime"),
    }),
  );
}

export async function deleteWeeklyBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await run(() => deleteWeeklyBlock(actor, str(fd, "id")));
}

/**
 * Modo PONTUAL: one time_off row from a start (Dia inicial + time) to an end
 * (Dia final + time), with the Motivo in `note`. Through createTimeOffBlock, so
 * the note rule, the scope check and the audit are the ones every block door
 * uses (mode "intervalo", reason "other": see reasonForMode).
 */
export async function createPontualBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await run(() =>
    createTimeOffBlock(actor, {
      userId: str(fd, "userId"),
      mode: "intervalo",
      startDate: str(fd, "startDate"),
      startTime: str(fd, "startTime"),
      endDate: str(fd, "endDate"),
      endTime: str(fd, "endTime"),
      note: str(fd, "note"),
    }),
  );
}

export async function deletePontualBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await run(() => deleteTimeOffBlock(actor, str(fd, "id")));
}
