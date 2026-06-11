# Regenerating `brand-svg.ts`

`brand-svg.ts` is generated from the committed source SVGs and **must not be
edited by hand**. Regenerate it whenever the source art changes:

- `packages/ui/src/assets/brand/logo-full.svg`
- `packages/ui/src/assets/brand/logo-lockup.svg`
- `packages/ui/src/assets/brand/logo-mark.svg`

## Why a generated string module (not an `import logo from "*.svg"`)

`.svg` default imports resolve differently per bundler — a URL string under
Vite/Storybook, a `StaticImageData` object under Next.js — so a shared
component consumed by both would need a fragile shim plus an ambient
`declare module "*.svg"`. Inlining sanitized SVG strings is bundler-agnostic,
needs no SVG loader, and has no async image load (hence no layout shift).

## Transform applied during generation

1. **Namespace clipPath ids per variant.** All three source SVGs reuse the
   ids `clip-0`, `clip-1`, `clip-8`, `clip-9`. Inlining several variants on one
   page (the Storybook story does this) would make `url(#clip-0)` resolve to
   whichever variant appears first in the DOM, corrupting the others. Each id
   and its `url(#…)` reference is prefixed with the variant name.
2. **Root `<svg>` made presentational + sized.** `role="img"` is replaced with
   `aria-hidden="true" focusable="false"` (the `<BrandLockup>` wrapper carries
   the accessible name) and `style="display:block;height:100%;width:auto"` is
   added so the art fills its wrapper height while keeping the viewBox aspect
   ratio. No fixed `width`/`height` is introduced.

Path geometry and brand-hex fills are otherwise preserved exactly.

## Command

From the repo root, with the generator script below saved to a temp file:

```js
// gen-brand-svg.mjs
import { readFileSync, writeFileSync } from "node:fs";

const variants = ["full", "lockup", "mark"];
const out = {};

for (const v of variants) {
  let svg = readFileSync(`packages/ui/src/assets/brand/logo-${v}.svg`, "utf8").trim();
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of new Set(ids)) {
    const ns = `${v}-${id}`;
    svg = svg.replaceAll(`id="${id}"`, `id="${ns}"`);
    svg = svg.replaceAll(`url(#${id})`, `url(#${ns})`);
    svg = svg.replaceAll(`href="#${id}"`, `href="#${ns}"`);
  }
  if (!svg.includes('role="img"')) throw new Error(`expected role="img" on root <svg> of ${v}`);
  svg = svg.replace(
    'role="img"',
    'aria-hidden="true" focusable="false" style="display:block;height:100%;width:auto"',
  );
  out[v] = svg;
}

const body = `// AUTO-GENERATED — do not edit by hand. See brand-svg.regen.md to regenerate.
// Source SVGs: packages/ui/src/assets/brand/logo-{full,lockup,mark}.svg (PR #175).
// Transform applied: clipPath ids namespaced per variant to avoid url(#id)
// collisions when several variants render on one page; the root <svg> is made
// presentational (aria-hidden) because <BrandLockup> carries the accessible
// name, and sized to fill its wrapper height (width:auto keeps the aspect ratio).
export const brandSvg = {
  full: ${JSON.stringify(out.full)},
  lockup: ${JSON.stringify(out.lockup)},
  mark: ${JSON.stringify(out.mark)},
} as const;

export type BrandVariant = keyof typeof brandSvg;
`;

writeFileSync("packages/ui/src/brand/brand-svg.ts", body);
```

```bash
node gen-brand-svg.mjs
pnpm --filter @osteojp/ui typecheck
```
