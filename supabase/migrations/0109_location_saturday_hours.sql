-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0109_location_saturday_hours.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ====================================================================== */
/* Saturday hours per clinic: an opening AND a closing time.              */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. HOR-01 makes a therapist with no Horarios rows     */
/* available during the clinic's opening hours on the staff side. 0085    */
/* gave each clinic ONE opening and closing pair and no weekday, so the   */
/* database cannot say when a clinic opens or closes on Saturday, and the */
/* clinic's Saturday hours have lived only in apply documents. Clinic     */
/* hours are data, never a constant in code, so Saturday gets its own     */
/* pair of columns.                                                       */
/*                                                                        */
/* WHY TWO COLUMNS AND NOT ONE. The owner answered on 2026-10-31:         */
/* "Saturday hours per clinic: 9am to 1pm, sunday closed." Weekday hours  */
/* stay as they are, and every clinic opens at 08:00 on weekdays. So      */
/* Saturday's opening time is not the weekday one: Saturday has its own   */
/* opening time (09:00) as well as its own closing time (13:00). A single */
/* closing column, with Saturday borrowing the weekday opening time,      */
/* would make 08:00 to 09:00 on Saturday bookable while the clinic is     */
/* shut.                                                                  */
/*                                                                        */
/* NUMBER: 0109, RULED BY STRATEGY ON 2026-10-31 (R38). It sits after     */
/* 0108, the pack read function. The file was first authored as           */
/* 0109_location_saturday_closes_at with one column, and was renamed and  */
/* rewritten for the owner's answer before any shared or production      */
/* database applied it.                                                   */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/* The two SET LOCAL lines every migration carries from 0100 on, then one */
/* ALTER TABLE and two COMMENTs:                                          */
/*   - two columns, `saturday_opens_at time` and `saturday_closes_at      */
/*     time`, both NULLABLE, both with NO DEFAULT. A nullable column with */
/*     no default is a catalogue change: no row is rewritten and every    */
/*     existing row reads NULL in both, which means "this clinic has no   */
/*     Saturday hours recorded". The staff app reads that exactly as it   */
/*     reads the columns' absence: no Saturday default.                   */
/*   - one CHECK, locations_saturday_hours_valid: both NULL, or both set  */
/*     with the closing time after the opening time. A half-set pair is a */
/*     Saturday nobody can render and nobody can book: the staff app      */
/*     would read it as "no Saturday" while the row looks deliberate, so  */
/*     the row is refused instead. A Saturday that closes at or before it */
/*     opens has no bookable minute; refusing it is better than an empty  */
/*     day nobody can explain. The CHECK is validated by one scan of      */
/*     `locations`, a table of a handful of rows, every one NULL in both  */
/*     columns here; nothing is rewritten.                                */
/*   - each column's comment.                                             */
/* It sets NO VALUE. The owner's 09:00 to 13:00 is written afterwards,    */
/* per clinic, by a separate named data op; this file only makes the      */
/* place for it. The columns are NOT declared in the Drizzle schema       */
/* (packages/db/src/schema.ts says why): the staff app reads them by name */
/* only once both exist (packages/db/src/location-saturday.ts).           */
/*                                                                        */
/* ====================================================================== */
/* 2. NO GRANT, NO POLICY, AND WHY NONE IS NEEDED                         */
/* ====================================================================== */
/* `locations` privileges are table-level, and a table-level privilege    */
/* covers every column, one added later included; no column of this table */
/* carries a column-level grant. So the new columns are readable and      */
/* writable by exactly the roles that read and write the weekday hours.   */
/* This file grants nothing and revokes nothing.                          */
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
/* transaction commits. Booking reads join `locations`, so they           */
/* wait for the commit, which on a table this small is milliseconds. The  */
/* two bounds below make a lock this transaction cannot take in 5 seconds */
/* a clean failure with nothing applied.                                  */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

ALTER TABLE public.locations
  ADD COLUMN saturday_opens_at time,
  ADD COLUMN saturday_closes_at time,
  ADD CONSTRAINT locations_saturday_hours_valid CHECK (
    (saturday_opens_at IS NULL AND saturday_closes_at IS NULL)
    OR (
      saturday_opens_at IS NOT NULL
      AND saturday_closes_at IS NOT NULL
      AND saturday_closes_at > saturday_opens_at
    )
  );--> statement-breakpoint

COMMENT ON COLUMN public.locations.saturday_opens_at IS
  'HOR-02. When this clinic opens on Saturday, Lisbon wall-clock. Set '
  'together with saturday_closes_at or not at all (locations_saturday_hours_valid). '
  'Independent of the weekday opening time. NULL means no Saturday hours are '
  'recorded, and then no therapist is given Saturday hours by the clinic default '
  '(HOR-01).';--> statement-breakpoint

COMMENT ON COLUMN public.locations.saturday_closes_at IS
  'HOR-02. When this clinic closes on Saturday, Lisbon wall-clock, after '
  'saturday_opens_at. Set together with it or not at all. NULL means no Saturday '
  'hours are recorded, and then no therapist is given Saturday hours by the clinic '
  'default (HOR-01). Sunday has no column: the clinics do not open on Sunday.';--> statement-breakpoint
