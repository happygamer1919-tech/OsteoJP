/* ================================================================== */
/* 0046 — users.is_bookable (PL-06b, owner ruling 2026-07-28)           */
/*                                                                    */
/* An explicit boolean that governs PRESENCE in the Terapeuta booking   */
/* dropdown, DECOUPLED from role (which governs AUTHORISATION) and from  */
/* service mappings (which govern PRESELECTION, PL-06a). Three concerns, */
/* three signals, no overloading.                                       */
/*                                                                    */
/* SUPERSEDES the PL-05 predicate (therapist-bookable.ts): bookable was  */
/* `roleSlug === 'therapist' OR serviceCount > 0`, which DROPPED the     */
/* practising owner JP on prod (role=admin/owner, zero mappings -> both  */
/* arms false -> out of the dropdown). Role sets rot at every hire (the  */
/* exact failure that produced the JP defect); an explicit flag set in   */
/* Equipa is the durable signal that survives dual-role practitioners.   */
/*                                                                    */
/* Ships DEFAULT false: a NEW staff row is non-bookable until an admin    */
/* enables it in Equipa (users:manage-gated, audited). The backfill      */
/* below flips exactly the ATTESTED practitioners to true.               */
/*                                                                    */
/* BACKFILL — owner-SIGNED-OFF id-map (2026-07-28), keyed BY ID, derived  */
/* from the attested prod read c6540cc6, NEVER fuzzy-matched (Tiago Grilo */
/* vs Tiago Reis). Tenant-scoped per hard rule 3 (migrations set          */
/* tenant_id explicitly). 16 TRUE = 15 therapists + JP; the 5 non-        */
/* practitioners (Lurdes, Ivan M, Carlos, Raquel, Tamara) stay false via  */
/* the DEFAULT. On any non-prod DB (CI branch, local) these ids do not    */
/* exist, so the UPDATE matches 0 rows and is a harmless no-op; the seed  */
/* sets is_bookable for its own users independently.                     */
/*                                                                    */
/* users keeps tenant_id + its existing RLS unchanged (column-only add).  */
/* Isolation re-proven in packages/db/tests/users-is-bookable-rls.test.ts */
/* (same PR): is_bookable is readable/writable ONLY within the tenant.    */
/* ================================================================== */

ALTER TABLE "users" ADD COLUMN "is_bookable" boolean DEFAULT false NOT NULL;--> statement-breakpoint

UPDATE "users" SET "is_bookable" = true
WHERE "tenant_id" = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
  AND "id" IN (
    '54d486e0-a9c3-4c82-acac-8b909ce5a2d0', -- JP (practising owner; admin->owner pending)
    '568ac6e3-f802-4199-ac18-d573f7dec4ba', -- Bernardo Calmeiro (therapist)
    '251d5d69-e0eb-42be-9baa-fd06835ccfeb', -- Catarina Vieira (therapist)
    'f67541b0-050c-464e-8993-0f99e0915eb8', -- David Batista (therapist)
    '93d16e65-08da-4b57-a30d-85a9865f5016', -- Durbis Brito (therapist)
    'd6058656-bafd-4a9e-a6da-ec5d69ca93f6', -- Filipa Rocha (therapist)
    'a821521d-b67d-4a99-ac35-319c9e95fe6a', -- Fran Royano (therapist)
    '7275e9a8-05ff-437e-bfaa-9679be4cf9c3', -- Isaac Fonseca (therapist)
    '4d665915-277b-4d11-be5f-b7cc6d950180', -- Jeison Oliveira (therapist)
    '5bebddbd-0765-4e5b-9e55-887bb17244f6', -- Mafalta Toscano (therapist)
    'fb50483b-6381-4155-b3ae-9bc195ca3158', -- Nuno Martins (therapist)
    'd218bee2-c4c3-4a52-9b68-9ad4be839017', -- Pedro Figueiredo (therapist)
    '4d1755a8-a1f9-4e92-93c8-bfd6e1bf8212', -- Rita Nunes (therapist)
    '832da499-0f93-4826-8011-e1093c503c23', -- Samuel Roux (therapist)
    '92fc1fb3-d1e6-49de-99c0-cd42f5f1144c', -- Tiago Grilo (therapist)
    '67fa6324-6503-449d-8ef5-fd61956da25d'  -- Tiago Reis (therapist)
  );
