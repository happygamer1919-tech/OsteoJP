-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0085_clinic_hours_and_cb_closure.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0085 — the clinic's own opening hours, and the CB midday closure.   */
/*                                                                    */
/* AUTHORED, NOT APPLIED. Queued behind 0083 and 0084: this file must  */
/* not be applied before both of those are, and its PR does not merge  */
/* until the owner has applied it (standing rule 7).                   */
/*                                                                    */
/* ORIGIN: clinic, through the owner, 2026-09-10. "agenda grid renders */
/* until 19:00 at both clinics; clinic works until 20:00" and "CB      */
/* ONLY: 13:00 to 14:00 is closed permanently for every therapist at   */
/* CB, no time_off rows involved, not blockable-around".               */
/* ================================================================== */
/* WHAT THIS REPLACES, AND WHY THE SYMPTOM WAS THE SMALLER HALF.       */
/* ================================================================== */
/* The reported symptom is a LABEL: agenda-grid.tsx builds hour rows   */
/* with `h < DAY_END_HOUR`, so the last hour label is 19:00 while the  */
/* painted grid really does run to 20:00, and the last bookable slot   */
/* starts at 19:30. The grid was already right for a 20:00 close.      */
/*                                                                    */
/* The DEFECT is that the number is compiled in. `DAY_START_HOUR = 8`  */
/* and `DAY_END_HOUR = 20` are module constants in                     */
/* apps/web/lib/scheduling/time.ts, identical for both clinics,        */
/* unable to differ per clinic, and read by the agenda grid and by     */
/* NOTHING ELSE. Nova marcação bounds itself by the therapist's        */
/* availability_templates; the portal bounds itself by the same        */
/* templates expanded in SQL. Three definitions of the working day and */
/* not one of them is a clinic — so there is no single fact for the    */
/* three to agree on, which is also how they can disagree.             */
/* ================================================================== */
/* OPTION A, RULED BY THE OWNER 2026-09-10.                            */
/* ================================================================== */
/* The proposal offered a second shape, a `location_closures` table    */
/* with a nullable `weekday`. It existed ONLY to express a closure     */
/* that VARIES BY WEEKDAY. The owner ruled that CB's closure applies   */
/* every day CB is open, INCLUDING SATURDAY — which is precisely the   */
/* degenerate case this column pair carries. The table, its RLS        */
/* policy, its isolation test and a join on three read paths would     */
/* buy nothing that is wanted. It stays the right build the first time */
/* somebody asks for "closed Saturday afternoons too", and the columns */
/* become its degenerate case rather than something to unpick.         */
/* ================================================================== */
/* THE DEFAULTS ARE TODAY'S CONSTANTS, so THIS FILE ALONE CHANGES NO   */
/* BEHAVIOUR. Every existing location reads 08:00-20:00, which is what */
/* every surface already assumed. The only row that ends up different  */
/* is CB, and it is different because of the UPDATE at the bottom.     */
/* ================================================================== */

alter table locations
  add column opens_at           time not null default '08:00',
  add column closes_at          time not null default '20:00',
  add column midday_closed_from time,
  add column midday_closed_to   time;

comment on column locations.opens_at is
  '0085. When this clinic opens, Lisbon wall-clock. Bounds the agenda grid, slot generation and the portal booking guard. Replaces DAY_START_HOUR.';
comment on column locations.closes_at is
  '0085. When this clinic closes, Lisbon wall-clock. Replaces DAY_END_HOUR.';
comment on column locations.midday_closed_from is
  '0085. Start of a daily closure that applies every day the clinic is open, including Saturday (owner ruling 2026-09-10). NULL on a clinic with no closure. NOT time_off: a closure belongs to the CLINIC, is not per therapist, and is not overridable with "Guardar mesmo assim".';
comment on column locations.midday_closed_to is
  '0085. End of the daily closure. NULL together with midday_closed_from; the pair is enforced by locations_midday_pair.';

/* ------------------------------------------------------------------ */
/* THE FOUR CONSTRAINTS, AND EACH ONE REFUSES A ROW THAT WOULD RENDER  */
/* AS SOMETHING OTHER THAN WHAT IT IS.                                 */
/* ------------------------------------------------------------------ */
alter table locations
  /* A clinic that closes before it opens has no bookable minute, and    */
  /* every consumer would show an empty day rather than a bad row.       */
  add constraint locations_open_before_close
    check (opens_at < closes_at),

  /* BOTH OR NEITHER. A half-set pair reads as "no closure" on every     */
  /* surface — closureFor() returns nothing without both ends — while    */
  /* sitting in the row looking deliberate. That is the shape where a    */
  /* clinic believes it is closed and the portal is taking bookings.     */
  add constraint locations_midday_pair
    check ((midday_closed_from is null) = (midday_closed_to is null)),

  add constraint locations_midday_order
    check (midday_closed_from is null or midday_closed_from < midday_closed_to),

  /* A closure outside opening hours takes nothing away and would draw a */
  /* band over part of a day the grid does not render.                   */
  add constraint locations_midday_inside_hours
    check (
      midday_closed_from is null
      or (midday_closed_from >= opens_at and midday_closed_to <= closes_at)
    );

/* ------------------------------------------------------------------ */
/* CB's CLOSURE, SEEDED BY NAME.                                       */
/* ------------------------------------------------------------------ */
/* MATCHED ON THE NAME because there is no stable id for a clinic       */
/* across environments, and a hardcoded uuid would seed nothing on any  */
/* database but one. "(CB)" is the form the rows really use — the       */
/* portal's own locationLabel.ts parses "OsteoJP (LV)" / "OsteoJP (CB)" */
/* out of locations.name — so this is the shape, not a guess.           */
/*                                                                     */
/* THERE IS NO TENANT FILTER, AND THAT IS DELIBERATE RATHER THAN        */
/* FORGOTTEN. A migration has no tenant to filter by: it runs once, as  */
/* the owner, before any request context exists. The consequence is     */
/* stated rather than hidden — if a SECOND tenant ever names a clinic   */
/* "(CB)", this seeds their closure too. Today there is one tenant in   */
/* production, and the alternative (an id) would seed nothing anywhere. */
/*                                                                     */
/* `and midday_closed_from is null` makes it idempotent: a re-run       */
/* cannot overwrite a value somebody chose later.                       */
/*                                                                     */
/* IT TOUCHES NO OTHER CLINIC. LV keeps NULL, which is what "no midday  */
/* closure" is, and is the default every other row already has.         */
update locations
   set midday_closed_from = '13:00',
       midday_closed_to   = '14:00'
 where name like '%(CB)%'
   and midday_closed_from is null;
