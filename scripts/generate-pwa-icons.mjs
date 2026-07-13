// Regenerates the patient-portal PWA icons from the canonical brand mark.
//
// Source of truth: packages/ui/src/assets/brand/logo-mark.svg (teal #45B9A7 /
// magenta #8B1863 — do NOT redraw the mark). Outputs the PNGs referenced by
// apps/portal/app/manifest.ts plus the iOS apple-touch-icon.
//
// sharp is NOT a project dependency and must not become one. To regenerate:
//   pnpm add -D -w sharp
//   node scripts/generate-pwa-icons.mjs
//   pnpm remove -D -w sharp
// The committed PNGs are what ships; this script only exists for reproducibility.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

// sharp is intentionally NOT a project dependency (see header). After
// `pnpm add -D -w sharp` the bare require below resolves; SHARP_PATH is an
// escape hatch to point at an existing install without touching the lockfile.
const require = createRequire(import.meta.url)
let sharp
try {
  sharp = require('sharp')
} catch {
  if (!process.env.SHARP_PATH) {
    throw new Error('sharp not found — run `pnpm add -D -w sharp` first (or set SHARP_PATH)')
  }
  sharp = require(process.env.SHARP_PATH)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = path.join(repoRoot, 'packages/ui/src/assets/brand/logo-mark.svg')
const portalPublic = path.join(repoRoot, 'apps/portal/public')
const portalApp = path.join(repoRoot, 'apps/portal/app')

const svg = readFileSync(svgPath)
// Light neutral tile so the multi-colour mark reads cleanly on any launcher /
// home screen; matches the manifest background_color family (#F7F9FB / white).
const TILE = '#FFFFFF'

// Rasterise the mark centred on a solid tile. innerRatio controls the safe
// padding: ~0.86 for standard "any" icons, tighter for the maskable variant so
// nothing is clipped inside a circular mask (content stays within the centre
// 80% safe zone).
async function renderIcon(size, innerRatio, outPath) {
  const inner = Math.round(size * innerRatio)
  const logo = await sharp(svg, { density: 600 })
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer()
  const pad = Math.round((size - inner) / 2)
  await sharp({
    create: { width: size, height: size, channels: 4, background: TILE },
  })
    .composite([{ input: logo, top: pad, left: pad }])
    .png()
    .toFile(outPath)
  console.log('wrote', path.relative(repoRoot, outPath))
}

await renderIcon(192, 0.86, path.join(portalPublic, 'icon-192.png'))
await renderIcon(512, 0.86, path.join(portalPublic, 'icon-512.png'))
// Maskable: ~22% padding each side keeps the mark inside the circular safe zone.
await renderIcon(512, 0.56, path.join(portalPublic, 'icon-512-maskable.png'))
// iOS add-to-home-screen touch icon (Next emits <link rel="apple-touch-icon">).
await renderIcon(180, 0.86, path.join(portalApp, 'apple-icon.png'))
