/* ====================================================================== */
/* A Saturday closing time per clinic.                                    */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. HOR-01 makes a therapist with no Horarios rows     */
/* available during the clinic's opening hours on the staff side. 0085    */
/* gave each clinic ONE opening and closing pair and no weekday, so the   */
/* database cannot say when a clinic closes on Saturday, and the clinic's */
/* Saturday hours have lived only in apply documents. Clinic hours are    */
/* data, never a constant in code, so Saturday gets a column.             */
/*                                                                        */
/* NUMBER: 0109 IS PROVISIONAL. This file was authored on a branch from   */
/* main at 0107, while 0108 (the pack read function, #1671) was held on   */
/* its own branch. It is a NEW Tier C item and strategy rules its number  */
/* and its sitting; a renumber is a rename and a journal edit, never an   */
/* edit to this body.                                                     */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/* The two SET LOCAL lines every migration carries from 0100 on, then one */
/* ALTER TABLE and one COMMENT:                                           */
/*   - one column, `saturday_closes_at time`, NULLABLE, with NO DEFAULT.  */
/*     A nullable column with no default is a catalogue change: no row is */
/*     rewritten and every existing row reads NULL, which means "this     */
/*     clinic has no Saturday hours recorded". The staff app reads NULL   */
/*     exactly as it reads the column's absence: no Saturday default.     */
/*   - one CHECK, locations_saturday_after_open: a Saturday closing time, */
/*     when set, is after the clinic's opening time (`opens_at`), which   */
/*     is also when it opens on Saturday. A Saturday that closes before   */
/*     it opens has no bookable minute; refusing the row is better than   */
/*     an empty day nobody can explain. It is validated by one scan of    */
/*     `locations`, a table of a handful of rows, every one NULL here.    */
/*   - the column's comment.                                              */
/* It sets NO VALUE. Which clinics open on Saturday, and until when, is   */
/* the owner's to rule and is written afterwards by a named data op.      */
/*                                                                        */
/* ====================================================================== */
/* 2. NO GRANT, NO POLICY, AND WHY NONE IS NEEDED                         */
/* ====================================================================== */
/* `locations` privileges are table-level, and a table-level privilege    */
/* covers every column, one added later included; no column of this      */
/* table carries a column-level grant. So the new column is readable and  */
/* writable by exactly the roles that read and write `opens_at`. This     */
/* file grants nothing and revokes nothing.                               */
/*                                                                        */
/* Row level security stays as it is: the existing policies on locations  */
/* decide which rows a caller sees, and a column added to a row is behind */
/* the same policies. No policy is created, changed or dropped here, so   */
/* the standing rule for policy migrations (closed hours only) does not   */
/* bind this file by that clause.                                         */
/*                                                                        */
/* ====================================================================== */
/* 3. THE LOCK                                                            */
/* ====================================================================== */
/* ALTER TABLE takes ACCESS EXCLUSIVE on public.locations until the       */
/* transaction commits. Every booking read joins `locations`, so they     */
/* wait for the commit, which on a table this small is milliseconds. The  */
/* two bounds below make a lock this transaction cannot take in 5 seconds */
/* a clean failure with nothing applied.                                  */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

ALTER TABLE public.locations
  ADD COLUMN saturday_closes_at time
  CONSTRAINT locations_saturday_after_open
  CHECK (saturday_closes_at IS NULL OR saturday_closes_at > opens_at);--> statement-breakpoint

COMMENT ON COLUMN public.locations.saturday_closes_at IS
  'HOR-02. When this clinic closes on Saturday, Lisbon wall-clock; it opens '
  'at opens_at. NULL means no Saturday hours are recorded, and then no '
  'therapist is given Saturday hours by the clinic default (HOR-01). Sunday '
  'has no column: the clinics do not open on Sunday.';--> statement-breakpoint
