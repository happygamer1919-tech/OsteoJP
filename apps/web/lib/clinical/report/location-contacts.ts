// Clinical-report print contacts — the clinic location block printed on a
// locked-record PDF.
//
// Why a reference dataset exists alongside the DB: the `locations` table only
// stores name + a single `address` text + a single `phone`. A printed clinical
// report needs the FULL contact block (street, postal code, both phones, and an
// email for the locations that have one). Those richer fields are not in the
// schema yet, so the canonical, owner-confirmed details for the real OsteoJP
// locations live here (grounded in https://osteojp.pt) and are selected by
// location name. When a location has no reference match, we fall back to the DB
// row as-is. Once `locations` carries structured contacts, this dataset becomes
// the seed and resolveLocationContact() can read straight from the row.
//
// Pure module — no DB, no PII. Fully unit-testable.

/** The fields the report's location block needs from the source location row. */
export type SourceLocation = {
  /** locations.name */
  name: string;
  /** locations.address (single free-text column) */
  address: string | null;
  /** locations.phone (single column) */
  phone: string | null;
};

/** A complete, print-ready clinic contact block. */
export type LocationContact = {
  name: string;
  /** Street + number lines, in print order. */
  addressLines: string[];
  postalCode: string | null;
  city: string | null;
  /** One or more phone numbers, in print order. */
  phones: string[];
  /** Contact email, when the location has one. */
  email: string | null;
};

// ---------------------------------------------------------------------------
// Primary clinic email
// ---------------------------------------------------------------------------
//
// OWNER-GATED (BUG-13 / docs/pdf-templates README "clinic email pending
// confirmation"). The owner confirmed the GMAIL address (over geral@osteojp.pt)
// as the primary contact email. The exact gmail string was NOT supplied, so
// this is a clearly-marked PLACEHOLDER to be replaced with the literal address.
// Locations that publish their own address (e.g. Castelo Branco) override this.
export const OSTEOJP_PRIMARY_EMAIL_PLACEHOLDER = "osteojp.geral@gmail.com"; // TODO(owner): confirm exact gmail (BUG-13)

/**
 * Normalize a location name for matching: lowercased, accents stripped,
 * runs of non-alphanumerics collapsed to a single hyphen. So "Linda-a-Velha",
 * "linda a velha", and "LINDA-A-VELHA" all match the same key.
 */
export function normalizeLocationKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonical OsteoJP location contacts (osteojp.pt). Keyed by normalizeLocationKey.
 * Montemor-o-Novo is intentionally absent — opening, no confirmed contacts yet.
 */
export const OSTEOJP_LOCATION_CONTACTS: Readonly<Record<string, LocationContact>> = {
  "linda-a-velha": {
    name: "OsteoJP — Linda-a-Velha",
    addressLines: ["Praça Central Plaza, n.º 1-A"],
    postalCode: "2795-246",
    city: "Linda-a-Velha",
    phones: ["214 191 988", "969 472 111"],
    // No location-specific email published — uses the primary clinic email.
    email: OSTEOJP_PRIMARY_EMAIL_PLACEHOLDER,
  },
  "castelo-branco": {
    name: "OsteoJP — Castelo Branco",
    addressLines: ["R. Fernando Namora, n.º 6"],
    postalCode: "6000-140",
    city: "Castelo Branco",
    phones: ["272 328 221", "969 877 553"],
    email: "geral.castelobranco@osteojp.pt", // explicitly published for this location
  },
};

/**
 * Select the print-ready contact block for the record's printing location.
 *
 * Prefers the canonical reference block (richer + owner-confirmed) matched by
 * normalized name; otherwise falls back to the DB location row, splitting its
 * single address/phone fields into the print shape. Never throws — an unknown
 * location still prints with whatever the row carries.
 */
export function resolveLocationContact(location: SourceLocation): LocationContact {
  const ref = OSTEOJP_LOCATION_CONTACTS[normalizeLocationKey(location.name)];
  if (ref) return ref;

  return {
    name: location.name,
    addressLines: location.address ? [location.address] : [],
    postalCode: null,
    city: null,
    phones: location.phone ? [location.phone] : [],
    email: null,
  };
}
