// Fixed UUIDs for the dev environment seed data.
// No side effects — safe to import from any seed script.
//
// Tenant: 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560

export const ROLE_OWNER     = "de000001-0000-0000-0000-000000000001";
export const ROLE_ADMIN     = "de000001-0000-0000-0000-000000000002";
export const ROLE_THERAPIST = "de000001-0000-0000-0000-000000000003";
export const ROLE_RECEPTION = "de000001-0000-0000-0000-000000000004";

export const LOC_LAV = "de000002-0000-0000-0000-000000000001"; // Linda-a-Velha
export const LOC_CB  = "de000002-0000-0000-0000-000000000002"; // Castelo Branco
/**
 * Montemor-o-Novo. NOT A REAL OR PLANNED LOCATION - owner ruling 2026-08-06,
 * board card LE-montemor-ground-truth. The clinic has exactly two: Linda-a-Velha
 * and Castelo Branco.
 *
 * THE CONSTANT IS KEPT ON PURPOSE AND HAS EXACTLY ONE REMAINING CALLER.
 * location-cleanup.ts ARCHIVES this row, and any dev database seeded before
 * 2026-08-07 still has it. Deleting the id would remove the only thing that can
 * clean up the mistake. Nothing may CREATE it: dev-reference.ts no longer seeds
 * the row, and no schedule targets it.
 */
export const LOC_MTN = "de000002-0000-0000-0000-000000000003";

export const SVC_OST = "de000003-0000-0000-0000-000000000001"; // Osteopatia
export const SVC_FIS = "de000003-0000-0000-0000-000000000002"; // Fisioterapia
export const SVC_MAS = "de000003-0000-0000-0000-000000000003"; // Massagem Terapêutica
export const SVC_PIL = "de000003-0000-0000-0000-000000000004"; // Pilates Terapêutico
export const SVC_NES = "de000003-0000-0000-0000-000000000005"; // NESA

export const USR_1 = "de000004-0000-0000-0000-000000000001"; // Dr. André Costa      — LAV
export const USR_2 = "de000004-0000-0000-0000-000000000002"; // Dra. Sofia Mendes    — LAV + CB
export const USR_3 = "de000004-0000-0000-0000-000000000003"; // Dr. Bernardo Figueira — CB
export const USR_4 = "de000004-0000-0000-0000-000000000004"; // Dra. Inês Carmo      — MTN
export const USR_5 = "de000004-0000-0000-0000-000000000005"; // Dr. Rui Correia      — all locations (admin)
