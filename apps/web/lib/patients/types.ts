import type { patients } from "@osteojp/db";

/** A patients row as selected from the DB. */
export type Patient = typeof patients.$inferSelect;
