-- ===================================================================
-- READ-ONLY. Run by the OWNER, on production. Nothing here writes.
-- ===================================================================
-- CONFIRM-11 item (c). BLUE may not connect to production (standing rule 1),
-- so this is authored here and run by Ivan, who pastes the output back.
--
-- WHAT IT ANSWERS, and it is one question: does `service_role` hold EXECUTE on
-- the SECURITY DEFINER functions that cross a tenant boundary?
--
-- WHY IT IS WORTH ASKING. PURPLE measured on CI that Supabase's ALTER DEFAULT
-- PRIVILEGES grants `service_role` EXECUTE at CREATE FUNCTION time on SOME
-- databases and not others, and that `REVOKE ... FROM PUBLIC` does not remove a
-- privilege a named role holds in its own right. 0072 and 0074 revoked PUBLIC,
-- anon and patient by name and did NOT name service_role - so whether it holds
-- EXECUTE on production is not derivable from the migration files. It has to be
-- read.
--
-- IT WAS NOT HYPOTHETICAL ON THE LANE DATABASE. 0075's first draft revoked the
-- same three names and a catalogue read showed service_role holding EXECUTE
-- anyway. 0075 now revokes it by name. THIS SCRIPT CHANGES NOTHING ABOUT 0074 -
-- one migration in flight (rule 8), and the fix, if one is needed, is a
-- separate migration after 0075 lands.
--
-- HOW TO READ THE OUTPUT. `proacl` is a list of aclitems, `grantee=PRIVS/grantor`.
-- `X` is EXECUTE. An EMPTY grantee before `=` means PUBLIC. A NULL acl - shown
-- here as `(default: PUBLIC has EXECUTE)` - is the dangerous one: it means no
-- GRANT or REVOKE was ever applied, so the built-in default stands and EVERY
-- role can execute.

\pset format aligned
\pset title 'SECURITY DEFINER functions that cross a tenant boundary'

SELECT
  p.proname                                            AS function,
  pg_get_userbyid(p.proowner)                          AS owner,
  p.prosecdef                                          AS security_definer,
  p.provolatile                                        AS volatility,
  coalesce(array_to_string(p.proacl, E'\n'),
           '(default: PUBLIC has EXECUTE)')            AS acl,
  -- The single answer the card turns on, computed rather than eyeballed.
  CASE
    WHEN p.proacl IS NULL THEN 'YES - via the default, nothing was ever revoked'
    WHEN EXISTS (
      SELECT 1 FROM unnest(p.proacl) a
       WHERE a::text LIKE 'service_role=%'
    ) THEN 'YES - service_role holds an explicit grant'
    ELSE 'no'
  END                                                  AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'resolve_confirm_code',   -- 0072, the confirm page's read door
    'issue_confirm_code',     -- 0074 writer 1
    'withdraw_confirm_code',  -- 0074 writer 2
    'consume_confirm_code'    -- 0074 writer 3
  )
ORDER BY p.proname;

-- ALL FOUR ARE LISTED, not three. The dispatch named "resolve_confirm_code,
-- issue_confirm_code and the third 0074 writer", and 0074 has THREE writers
-- (issue, withdraw, consume). Reading all four costs nothing and removes the
-- ambiguity rather than guessing which was meant.

\pset title 'The same question for every public SECURITY DEFINER function'

-- THE WIDER SWEEP, because the four above were chosen from a card and the
-- property is a property of the whole class. If service_role holds EXECUTE on
-- one of them it probably holds it on others, and a finding that names four
-- when twenty are affected is a finding that gets fixed four times.
SELECT
  p.proname AS function,
  CASE
    WHEN p.proacl IS NULL THEN 'DEFAULT - PUBLIC has EXECUTE'
    WHEN EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'service_role=%')
      THEN 'service_role HAS execute'
    ELSE 'ok'
  END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 2 DESC, 1;
