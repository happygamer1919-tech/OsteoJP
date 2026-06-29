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

export const adminLabel = "text-sm font-medium text-v2-text-primary";
export const adminHelp = "text-xs text-v2-text-secondary";
export const adminLegend = "text-sm font-semibold text-v2-text-primary";

// Table chrome.
export const adminTh = "py-2 pr-4 text-left text-xs font-medium text-v2-text-secondary";
export const adminTd = "py-3 pr-4 align-top text-sm text-v2-text-primary";
export const adminTrBorder = "border-b border-v2-border";
