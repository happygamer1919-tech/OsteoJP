// Shared v2 class strings for the Administração hub (V2-W6, SPEC-v2-admin §3).
// The admin sub-pages reuse their existing raw form controls (no field/save
// changes); these constants only restyle the surfaces to v2 glass + tokens so
// every tab is consistent. Token-only, on the 4px grid, with the global focus
// ring. No packages/ui changes.

// Full-width form input / select.
export const adminInput =
  "block w-full rounded-v2 border border-v2-border bg-v2-surface px-3 py-2 text-sm text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// Compact inline input (inside table-row edit forms).
export const adminInputInline =
  "rounded-v2 border border-v2-border bg-v2-surface px-2 py-1 text-sm text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// Primary action: Wellness Green fill (SPEC-v2-foundation §3.2); green-700 + white
// clears AA (≈4.7:1).
export const adminBtnPrimary =
  "inline-flex h-10 items-center justify-center rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-v2-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:opacity-50";

// Secondary / neutral action.
export const adminBtnGhost =
  "inline-flex items-center justify-center rounded-v2 border border-v2-border bg-v2-surface px-3 py-2 text-sm font-medium text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:opacity-50";

export const adminLabel = "text-sm font-medium text-v2-text-primary";
export const adminHelp = "text-xs text-v2-text-secondary";
export const adminLegend = "text-sm font-semibold text-v2-text-primary";

// Table chrome.
export const adminTh = "py-2 pr-4 text-left text-xs font-medium text-v2-text-secondary";
export const adminTd = "py-3 pr-4 align-top text-sm text-v2-text-primary";
export const adminTrBorder = "border-b border-v2-border";
