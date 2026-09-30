/*
  The names the guide must never show (G1-5): every patient's and every staff
  member's full name, each once, one per row, for encode-guide-names.mjs.

  OWNER-RUN ONLY, read only, and never to a terminal: README, "The names
  check", pipes this straight from psql into the encoder and on into
  "gh secret set", so no screen and no file holds a name. Soft deleted
  patients are included on purpose: a deleted patient's name is still a
  real person's name.

  Columns: public.patients.full_name and public.users.full_name
  (packages/db/src/schema.ts, both NOT NULL).
*/
select full_name from public.patients
union
select full_name from public.users;
