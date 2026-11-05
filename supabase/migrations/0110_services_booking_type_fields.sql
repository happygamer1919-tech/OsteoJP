-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0110_services_booking_type_fields.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ====================================================================== */
/* PENDING, AND IT FOLLOWS 0109. Five columns on services, for the        */
/* "Tipo de Marcações / Tabelas de Preços" table.                         */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. The clinic asked, on 2026-11-02, for Fisiozero's   */
/* appointment-type table, copied in structure and behaviour: per type a  */
/* follow-up rule, a price, a VAT rate, a VAT exemption reason, an active */
/* switch, a colour, an SMS flag and an online-booking flag. OsteoJP's    */
/* services table already holds the name, the price, the active flag and  */
/* the online-booking flag (patient_bookable, 0057). The other five have  */
/* no column, and this file adds them. It writes NO VALUE into any row.   */
/*                                                                        */
/* NO NUMBER YET, BY CONSTRUCTION. 0108 is the last file on main. 0109 is */
/* taken by HOR-02 (the Saturday hours, ruled by strategy on 2026-10-31,  */
/* held on its own pull request), so this file waits in                   */
/* packages/db/migrations-pending as NEXT-AFTER-0109 and takes the next   */
/* free number when strategy rules it and 0109 is applied and merged.     */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/* The two SET LOCAL lines every migration carries from 0100 on, then ONE */
/* ALTER TABLE on public.services and one COMMENT per new column:         */
/*   - color text, NULLABLE, no default. A '#RRGGBB' hex in capitals.     */
/*     NULL means no colour was chosen, and every screen keeps what it    */
/*     shows today.                                                       */
/*   - vat_rate smallint, NULLABLE, no default. The VAT percentage of     */
/*     the type: 0, 6, 13 or 23, the four values Fisiozero offers. NULL   */
/*     means not set on the type.                                         */
/*   - vat_exemption_code text, NULLABLE, no default. The AT exemption    */
/*     reason code ("Motivo IVA"), one of the 33 codes the browser report */
/*     of 2026-11-02 lists from Fisiozero (M01 to M99, in the CHECK       */
/*     below). The report says "34 options" and lists 33: most likely the */
/*     34th is the placeholder "-- Selecionar motivo --", which is not a  */
/*     code. That is not verified, and the pull request asks it. NULL     */
/*     means none chosen.                                                 */
/*   - follow_up_days smallint, NULLABLE, no default. NULL is Fisiozero's */
/*     "FollowUP: nenhum"; 2 is its "FollowUp 2 dias", the only other     */
/*     option it offers.                                                  */
/*   - sms_reminders boolean NOT NULL DEFAULT true. Whether reminders go  */
/*     out for appointments of this type. TRUE for every existing row is  */
/*     what happens today, because today every type's appointments get    */
/*     reminders; a constant default on a new column is a catalogue       */
/*     change in Postgres 11 and later, so no row is rewritten.           */
/*   - one named CHECK per column, so a refusal names the column it is    */
/*     about.                                                             */
/* It changes NO behaviour. Nothing reads these columns until the         */
/* application's own pull request, and that pull request only shows and   */
/* saves them: the reminder sender, the invoice mapper, the agenda colour */
/* and the follow-up are each a separate, later decision.                 */
/*                                                                        */
/* WHAT IT DELIBERATELY DOES NOT DO. It does not require an exemption     */
/* code when the rate is 0, or forbid one when the rate is above 0. That  */
/* pairing is a fiscal rule and is for the owner and his accountant to    */
/* rule (Tier D); it is asked in the pull request, and it can become a    */
/* CHECK later without touching these columns.                            */
/*                                                                        */
/* ====================================================================== */
/* 2. NO GRANT, NO POLICY, AND WHY NONE IS NEEDED                         */
/* ====================================================================== */
/* services privileges are table-level, and a table-level privilege       */
/* covers every column, one added later included; no column of services  */
/* carries a column-level grant (0021 revoked everything from anon at the */
/* table level). So the new columns are read and written by exactly the   */
/* roles that read and write the price today, and by nobody else. This   */
/* file grants nothing and revokes nothing.                               */
/*                                                                        */
/* Row level security stays as it is: services_tenant_isolation (0001)    */
/* decides which rows a caller sees, and a column added to a row is       */
/* behind the same policy. No policy is created, changed or dropped here. */
/*                                                                        */
/* ====================================================================== */
/* 3. THE LOCK                                                            */
/* ====================================================================== */
/* ALTER TABLE takes ACCESS EXCLUSIVE on public.services until the        */
/* transaction commits. Every booking read joins services, so bookings    */
/* wait for the commit. The four CHECKs are validated by one scan of      */
/* services (about twenty rows), every row NULL in the four checked       */
/* columns; nothing is rewritten. The two bounds below make a lock this   */
/* transaction cannot take in 5 seconds a clean failure with nothing      */
/* applied. A sitting runs while the clinics are closed.                  */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

ALTER TABLE public.services
  ADD COLUMN color text,
  ADD COLUMN vat_rate smallint,
  ADD COLUMN vat_exemption_code text,
  ADD COLUMN follow_up_days smallint,
  ADD COLUMN sms_reminders boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT services_color_hex CHECK (
    color IS NULL OR color ~ '^#[0-9A-F]{6}$'
  ),
  ADD CONSTRAINT services_vat_rate_allowed CHECK (
    vat_rate IS NULL OR vat_rate IN (0, 6, 13, 23)
  ),
  ADD CONSTRAINT services_vat_exemption_code_allowed CHECK (
    vat_exemption_code IS NULL OR vat_exemption_code IN (
      'M01', 'M02', 'M04', 'M05', 'M06', 'M07', 'M09', 'M10', 'M11', 'M12',
      'M13', 'M14', 'M15', 'M16', 'M19', 'M20', 'M21', 'M25', 'M26', 'M30',
      'M31', 'M32', 'M33', 'M34', 'M35', 'M40', 'M41', 'M42', 'M43', 'M44',
      'M45', 'M46', 'M99'
    )
  ),
  ADD CONSTRAINT services_follow_up_days_allowed CHECK (
    follow_up_days IS NULL OR follow_up_days = 2
  );--> statement-breakpoint

COMMENT ON COLUMN public.services.color IS
  'Tipos de Marcacao. The colour of this appointment type, #RRGGBB in capitals '
  '(services_color_hex). NULL means none chosen. Stored only: whether the agenda '
  'paints it instead of the therapist colour is a separate product decision.';--> statement-breakpoint

COMMENT ON COLUMN public.services.vat_rate IS
  'Tipos de Marcacao. The VAT percentage of this appointment type: 0, 6, 13 or 23 '
  '(services_vat_rate_allowed). NULL means not set on the type. Read by no invoice '
  'path yet.';--> statement-breakpoint

COMMENT ON COLUMN public.services.vat_exemption_code IS
  'Tipos de Marcacao. The AT VAT exemption reason code (Motivo IVA), M01 to M99 '
  '(services_vat_exemption_code_allowed). NULL means none chosen. Read by no '
  'invoice path yet.';--> statement-breakpoint

COMMENT ON COLUMN public.services.follow_up_days IS
  'Tipos de Marcacao. The follow-up rule: NULL is none (FollowUP: nenhum), 2 is '
  'a follow-up two days after the appointment (services_follow_up_days_allowed). '
  'Stored only: nothing creates a follow-up from it yet.';--> statement-breakpoint

COMMENT ON COLUMN public.services.sms_reminders IS
  'The SMS tag. Whether it stops only the SMS or every reminder is not ruled yet.';--> statement-breakpoint
