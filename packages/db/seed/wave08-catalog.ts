/**
 * Wave 08 (W8-01a) — the owner's real services catalog for Linda-a-Velha (LV)
 * and Castelo Branco (CB): services with per-location prices, plus packs.
 *
 * SOURCE OF TRUTH: the canonical catalog embedded verbatim in
 * docs/loops/wave-08/W8-01a-services-catalog-packs-schema-seed.md. Prices are
 * EUR transcribed to INTEGER CENTS here (75.00 -> 7500). Never float.
 *
 * Model (offered-only-where-priced): each service is a canonical `services` row;
 * it is OFFERED at a location where an active `service_location_prices` row
 * exists for (service, location). A pack is a `service_packs` row scoped to its
 * location, linked to a base service by name.
 *
 * CONSERVATIVE canonicalization: each DISTINCT listed name is its own service
 * row. Only "Fisioterapia" is listed identically at both LV and CB, so it is one
 * row offered at both (per-location prices 5500 / 4500). Plausible cross-location
 * merges (LV "Osteopatia" vs CB "Osteopatia/Posturologia"; LV "Tratamento NESA"
 * vs CB "NESA"; LV "Pressoterapia/Drenagem Linfatica Mecanica" vs CB
 * "Pressoterapia") are NOT presumed — they are owner questions (QUESTIONS.md),
 * confirmed at the CATALOG OWNER CONFIRMATION halt before any cloud write.
 *
 * This module is DATA + a pure builder. The dry-run runner
 * (wave08-catalog-dryrun.ts) applies it to a local test tenant and prints row
 * counts; the authorized cloud write reuses the same data after owner confirm.
 */

export type CatalogLocation = "LAV" | "CB";

/** A canonical service and the locations (with cents prices) where it is offered. */
export type CatalogService = {
  name: string;
  durationMin?: number; // defaults to 60 (services.duration_min default)
  /** Offered locations with the price em vigor, in integer cents. */
  prices: { location: CatalogLocation; priceCents: number }[];
};

/** A pack definition: base service (by canonical name) + session count + cents price + location. */
export type CatalogPack = {
  name: string;
  baseServiceName: string;
  location: CatalogLocation;
  sessionCount: number;
  priceCents: number;
};

/**
 * SERVICES — the union of the LV + CB catalogs. "Fisioterapia" is the single
 * name shared identically across both locations (offered at both, per-location
 * price). Every other name is location-specific.
 */
export const CATALOG_SERVICES: CatalogService[] = [
  // ── Linda-a-Velha (prices em vigor 2026-01-01) ──
  { name: "1.ª consulta / Avaliação (Osteopatia ou Fisioenergética/Kinesiologia/Posturologia)", prices: [{ location: "LAV", priceCents: 7500 }] },
  { name: "Osteopatia", prices: [{ location: "LAV", priceCents: 7000 }] },
  { name: "Fisioenergética/Kinesiologia/Posturologia", prices: [{ location: "LAV", priceCents: 7000 }] },
  { name: "R.P.G. — Reeducação Postural Global", prices: [{ location: "LAV", priceCents: 6000 }] },
  { name: "Fisioterapia", prices: [{ location: "LAV", priceCents: 5500 }, { location: "CB", priceCents: 4500 }] },
  { name: "Tratamento Terapêutico", prices: [{ location: "LAV", priceCents: 5500 }] },
  { name: "Tratamento NESA", prices: [{ location: "LAV", priceCents: 5000 }] },
  { name: "Drenagem Linfática Manual (Método Wodere)", prices: [{ location: "LAV", priceCents: 6000 }] },
  { name: "Pressoterapia / Drenagem Linfática Mecânica", prices: [{ location: "LAV", priceCents: 3500 }] },
  { name: "Pilates Terapêutico — aula individual", prices: [{ location: "LAV", priceCents: 5000 }] },
  { name: "Pilates mensal 1x/semana — grupo (4 a 5 pessoas)", prices: [{ location: "LAV", priceCents: 12500 }] },
  { name: "Pilates mensal 2x/semana — grupo (4 a 5 pessoas)", prices: [{ location: "LAV", priceCents: 19500 }] },
  // ── Castelo Branco (prices em vigor 2026-03-02) ──
  { name: "Osteopatia/Posturologia", prices: [{ location: "CB", priceCents: 6000 }] },
  { name: "Pressoterapia", prices: [{ location: "CB", priceCents: 3000 }] },
  { name: "Sessão Família/Amigos (2 pessoas ao mesmo tempo)", prices: [{ location: "CB", priceCents: 6000 }] },
  { name: "Medicina Chinesa/Acupuntura", prices: [{ location: "CB", priceCents: 4500 }] },
  { name: "Massagem 4 Mãos (2 terapeutas)", prices: [{ location: "CB", priceCents: 7000 }] },
  { name: "Pilates com Máquinas 1x/semana/mês", prices: [{ location: "CB", priceCents: 12500 }] },
  { name: "Pilates com Máquinas 2x/semana/mês", prices: [{ location: "CB", priceCents: 19500 }] },
  { name: "Pilates — Aula Experimental (1.ª vez)", prices: [{ location: "CB", priceCents: 2000 }] },
  { name: "Pilates — Aula Pontual", prices: [{ location: "CB", priceCents: 3500 }] },
  { name: "NESA", prices: [{ location: "CB", priceCents: 5000 }] },
];

/** PACKS — LV then CB, base service by canonical name. */
export const CATALOG_PACKS: CatalogPack[] = [
  // ── Linda-a-Velha ──
  { name: "Pacote 10 — NESA", baseServiceName: "Tratamento NESA", location: "LAV", sessionCount: 10, priceCents: 39000 },
  { name: "Pacote 5 — Osteopatia", baseServiceName: "Osteopatia", location: "LAV", sessionCount: 5, priceCents: 32500 },
  { name: "Pacote 10 — Osteopatia", baseServiceName: "Osteopatia", location: "LAV", sessionCount: 10, priceCents: 59500 },
  { name: "Pacote 5 — Fisioterapia (2x semana)", baseServiceName: "Fisioterapia", location: "LAV", sessionCount: 5, priceCents: 23750 },
  { name: "Pacote 10 — Fisioterapia (2x semana)", baseServiceName: "Fisioterapia", location: "LAV", sessionCount: 10, priceCents: 45000 },
  { name: "Pacote 5 — Pressoterapia / Drenagem Linfática Mecânica", baseServiceName: "Pressoterapia / Drenagem Linfática Mecânica", location: "LAV", sessionCount: 5, priceCents: 15000 },
  { name: "Pacote 10 — Drenagem Linfática Manual (Método Wodere)", baseServiceName: "Drenagem Linfática Manual (Método Wodere)", location: "LAV", sessionCount: 10, priceCents: 50000 },
  { name: "Pacote 10 — Tratamento Terapêutico", baseServiceName: "Tratamento Terapêutico", location: "LAV", sessionCount: 10, priceCents: 45000 },
  // ── Castelo Branco ──
  { name: "Fisioterapia — 5 sessões", baseServiceName: "Fisioterapia", location: "CB", sessionCount: 5, priceCents: 20000 },
  { name: "Fisioterapia — 10 sessões", baseServiceName: "Fisioterapia", location: "CB", sessionCount: 10, priceCents: 35000 },
  { name: "Pressoterapia — 5 sessões", baseServiceName: "Pressoterapia", location: "CB", sessionCount: 5, priceCents: 12500 },
  { name: "Medicina Chinesa/Acupuntura — 5 sessões", baseServiceName: "Medicina Chinesa/Acupuntura", location: "CB", sessionCount: 5, priceCents: 20000 },
  { name: "Medicina Chinesa/Acupuntura — 10 sessões", baseServiceName: "Medicina Chinesa/Acupuntura", location: "CB", sessionCount: 10, priceCents: 35000 },
  { name: "NESA — 10 sessões", baseServiceName: "NESA", location: "CB", sessionCount: 10, priceCents: 35000 },
];

/**
 * Known catalog GAPS — recorded for one owner/JP batch (QUESTIONS.md), NOT
 * seeded with guessed values. CB missing: 1.ª consulta, Drenagem Linfática
 * Manual, Tratamento Terapêutico, Osteopatia packs. LV missing: Medicina
 * Chinesa, Massagem 4 Mãos, Sessão Família. Plus the plausible cross-location
 * merges above (owner confirms whether e.g. CB "NESA" == LV "Tratamento NESA").
 */
export const CATALOG_GAPS = {
  cbMissing: ["1.ª consulta / Avaliação", "Drenagem Linfática Manual (Método Wodere)", "Tratamento Terapêutico", "Osteopatia packs"],
  lavMissing: ["Medicina Chinesa/Acupuntura", "Massagem 4 Mãos", "Sessão Família/Amigos"],
  possibleMerges: [
    'CB "Osteopatia/Posturologia" vs LV "Osteopatia"',
    'CB "NESA" vs LV "Tratamento NESA"',
    'CB "Pressoterapia" vs LV "Pressoterapia / Drenagem Linfática Mecânica"',
  ],
} as const;

/** DROPPED (Fisiozero placeholder): "campo 9 - Externos" is NOT migrated. R.P.G.
 *  is a REAL service (migrated above, LV 60.00), not a placeholder. */
export const CATALOG_DROPPED = ["campo 9 - Externos"] as const;
