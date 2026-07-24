/* ================================================================== */
/* 0041 — locations.slot_granularity_min (W12-29, Q-W9-00-3)            */
/*                                                                    */
/* Per-location booking slot granularity in minutes. DEFAULT 30 for    */
/* every existing row = today's behaviour everywhere, so the portal     */
/* and every location are UNCHANGED until a location is explicitly set  */
/* to another value (e.g. Castelo Branco -> 60 for hourly slots).      */
/*                                                                    */
/* Decoupled column (coupled-flags lesson). The booking slot generator  */
/* (listOpenSlots) reads it and parameterises its generate_series step.  */
/* locations keeps tenant_id + RLS unchanged (column-only add).        */
/*                                                                    */
/* Portal-safety: this migration alone changes NOTHING (all rows = 30). */
/* Setting a location's value, the agenda-VIEW row-step wiring, and the  */
/* admin toggle are owner/CYAN-gated per R13 + Q-W12-29-1 (does 60 apply */
/* to the agenda view only, or also to booking granularity, which would  */
/* change LV portal booking?).                                          */
/* ================================================================== */

ALTER TABLE "locations" ADD COLUMN "slot_granularity_min" smallint DEFAULT 30 NOT NULL;
