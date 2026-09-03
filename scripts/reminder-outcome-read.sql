-- REMINDER OUTCOMES SINCE 2026-08-31 — READ ONLY. No writes, creates nothing.
--
-- WHO RUNS IT: Ivan, in his own shell, against production. No terminal may point
-- anything at production (PORTAL-REHYDRATE standing rule 1), so this is authored
-- here and executed there.
--
-- ==========================================================================
-- READ THIS BEFORE READING THE NUMBERS. IT CANNOT ANSWER "DELIVERED".
-- ==========================================================================
-- THERE IS NO TABLE IN THIS DATABASE THAT RECORDS A REMINDER DISPATCH OR A
-- PROVIDER RESULT. Forty-three tables, and none of them is an outbound message
-- log. That was checked table by table, not assumed:
--
--   sms_inbound_events        INBOUND only - replies that arrived
--   audit_log                 carries `messaging.check.send`, which is the
--                             OWNER'S DELIVERY TEST page and nothing else. The
--                             reminder pipeline writes no audit row.
--   appointment_confirm_codes one row per 24h reminder that got as far as
--                             minting a link. The closest thing to "attempted"
--                             that exists, and it is a PROXY, not a record.
--
-- Everything the reminder pipeline knows about a send - the provider's message
-- id, a suppression reason, a transport error - goes to `console` and into the
-- Inngest run output. Neither is queryable, and Inngest run history expires.
--
-- THAT GAP IS WHY THE 2026-09-02 FAILURE RAN FOR TWO DAYS. Every outbound
-- message failed at Twilio and the system reported nothing anywhere a person
-- would look. It is carded as OBS-04-no-reminder-delivery-record; this query is
-- what can be answered until that card ships, and it is deliberately explicit
-- about which of its numbers are real and which are proxies.
--
-- HOW TO READ THE RESULT:
--   Section 1 is REAL. It is the owner's own test sends, with their outcome.
--   Section 2 is a PROXY for "a 24h reminder rendered and minted a link". It
--             says nothing about whether Twilio accepted or delivered it.
--   Section 3 is REAL, and it is the only evidence a patient RECEIVED anything:
--             a reply can only exist if a message arrived.
--
-- THE AUTHORITY ON DELIVERY IS STILL THE TWILIO CONSOLE. This narrows what to
-- look for there; it does not replace it.

\echo ''
\echo '=== 1. DELIVERY TESTS (audit_log) — REAL outcomes, owner-initiated only ==='
select
  (a.created_at at time zone 'UTC')::date          as day_utc,
  case
    when a.metadata->>'failure' is null            then 'sent'
    when a.metadata->>'failure' like 'skipped:%'   then 'suppressed: ' || (a.metadata->>'failure')
    when a.metadata->>'result' = 'threw'           then 'provider threw'
    else 'failed'
  end                                              as outcome,
  count(*)                                         as attempts,
  min(a.metadata->>'segmentLength')                as min_body_len,
  max(a.metadata->>'segmentLength')                as max_body_len,
  count(*) filter (where (a.metadata->>'codeWasLive')::boolean) as with_live_code,
  -- The provider's own words, truncated. Never a phone number: the page stores
  -- only a sha256 of the recipient (`toHash`), by design.
  left(max(a.metadata->>'failure'), 120)           as sample_failure
from public.audit_log a
where a.action = 'messaging.check.send'
  and a.created_at >= timestamptz '2026-08-31 00:00:00+00'
group by 1, 2
order by 1 desc, 2;

\echo ''
\echo '=== 2. 24h REMINDERS THAT MINTED A CONFIRM LINK — a PROXY for "attempted" ==='
\echo '    A row means the body rendered and a code was written. It does NOT mean'
\echo '    Twilio accepted it, and it does NOT mean the patient received it.'
select
  (c.created_at at time zone 'UTC')::date          as day_utc,
  count(*)                                         as codes_minted,
  count(*) filter (where c.consumed_at is not null) as consumed_by_patient,
  count(*) filter (where c.consumed_at is null)     as still_live
from public.appointment_confirm_codes c
where c.created_at >= timestamptz '2026-08-31 00:00:00+00'
group by 1
order by 1 desc;

\echo ''
\echo '=== 3. INBOUND REPLIES — the ONLY proof a patient received a message ==='
select
  (e.received_at at time zone 'UTC')::date         as day_utc,
  e.classification,
  count(*)                                         as replies
from public.sms_inbound_events e
where e.received_at >= timestamptz '2026-08-31 00:00:00+00'
group by 1, 2
order by 1 desc, 2;

\echo ''
\echo '=== 4. STRANDED CONFIRM CODES — minted, never consumed, blocking a re-mint ==='
\echo '    0072 allows ONE live code per appointment. A code minted for a message'
\echo '    that never went is unconsumed forever - expiry does not release it -'
\echo '    so that appointment keeps sending reminders with no link.'
select
  c.appointment_id,
  (c.created_at at time zone 'UTC')                as minted_at_utc,
  a.starts_at,
  a.status
from public.appointment_confirm_codes c
join public.appointments a on a.id = c.appointment_id
where c.consumed_at is null
  and c.created_at >= timestamptz '2026-08-31 00:00:00+00'
order by c.created_at desc
limit 50;
