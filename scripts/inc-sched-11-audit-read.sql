-- INC-SCHED-11 — READ ONLY. Runs no writes, creates nothing, changes nothing.
--
-- WHO RUNS IT: Ivan, in his own shell, against production. No terminal may
-- point anything at production (PORTAL-REHYDRATE standing rule 1), so this is
-- authored here and executed there.
--
-- WHAT IT ANSWERS: was any therapist's working day SAVED with a rewritten first
-- period while #1117 was live?
--
-- WHAT IT CANNOT ANSWER: what the times were BEFORE. `audit_log` records that an
-- availability_template.update happened, not what it changed, and
-- `availability_templates` has no updated_at column. So this is a SHORTLIST TO
-- EYEBALL, not a verdict.
--
-- AN EMPTY RESULT IS A VERDICT, and it is the one to hope for: no schedule was
-- saved in the window at all, so nothing was corrupted.
--
-- THE WINDOW: #1117 merged 2026-09-02T23:05:26+03:00 (= 20:05:26 UTC). The upper
-- bound is when #1120 reaches production - replace it with that time, or leave
-- now() to include everything up to the moment you run this.

select
  a.created_at                as saved_at_utc,
  u_actor.full_name           as saved_by,
  u_target.full_name          as therapist,
  t.weekday,                                   -- 0 = Sunday .. 6 = Saturday
  t.start_time,
  t.end_time,
  l.name                      as location,
  t.is_active,
  -- THE SIGNATURE TO LOOK FOR, and it is a HINT and not proof: the corruption
  -- writes end_time = 19:00 (the suggested afternoon end) whenever the real day
  -- ended before 19:00. A genuine 19:00 finish looks identical, which is why
  -- this column is named "suspect" and not "corrupted".
  (t.end_time = time '19:00' or t.end_time = t.start_time + interval '1 hour')
                              as suspect_shape
from audit_log a
join availability_templates t on t.id = a.entity_id::uuid
left join users u_actor  on u_actor.id  = a.actor_user_id
left join users u_target on u_target.id = t.user_id
left join locations l    on l.id        = t.location_id
where a.action = 'availability_template.update'
  and a.created_at >= timestamptz '2026-09-02 20:05:26+00'
  and a.created_at <  now()
order by a.created_at desc;
