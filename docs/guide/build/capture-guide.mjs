#!/usr/bin/env node
// Captures the annotated screenshots of Suporte e Guia (G1-5, G1-7).
//
//   node docs/guide/build/capture-guide.mjs --base-url http://localhost:3040
//   node docs/guide/build/capture-guide.mjs --base-url http://localhost:3040 --only agenda.marcar-consulta,agenda.ler-a-agenda
//   ... [--frames <dir>]   also write each frame on its own, for a look while writing a spec
//
// For each spec docs/guide/shots/<lesson id>.shots.json it logs in as the
// spec's profile on a LOCAL stack seeded by seed-guide.mjs, walks the spec's
// frames, draws arrows, boxes and numbered markers over the targets it names,
// and writes, per size:
//
//   apps/web/public/ajuda/<section>/<slug>-390.png       (390 x 844, scale 2)
//   apps/web/public/ajuda/<section>/<slug>-desktop.png   (1440 x 900, scale 1)
//   docs/guide/shots/text/<section>/<slug>-<size>.txt    the text record
//
// A size's image is its frames side by side, step 1 on the left. The text
// record's first line is "sha256 <hex of that png>"; then, per frame, a line
// "## frame N" and the page's visible text at capture time
// (document.body.innerText, an open dialog included, taken before the
// annotations are drawn). It is how CI proves what an image shows without
// reading pixels: apps/web/lib/guide/guide-names.test.ts checks every PNG
// against its record and scans the records for production names.
//
// SAFETY. It refuses a base URL whose host is not localhost or 127.0.0.1, so
// it can never photograph a deployed platform, and it logs in only with the
// guide accounts seed-guide.mjs creates on a local stack. Use
// http://localhost, not 127.0.0.1: the Next 16 dev server never hydrates on
// the latter.
//
// A SPEC (docs/guide/shots/<id>.shots.json), keys checked:
//
//   { "id": "agenda.marcar-consulta",          the lesson id; the lesson names it with "shots:"
//     "profile": "rececao",                     rececao, terapeuta, proprietario or admin
//     "sizes": ["390", "desktop"],
//     "stabilize": ["css selector", { "css": "...", "text": "..." }, ...],
//                                               before every capture: a selector alone is hidden
//                                               (a clock), one with "text" shows that text instead
//                                               (the greeting that follows the hour)
//     "frames": [ {
//        "goto": "/agenda?date=2026-10-06",     optional
//        "do": [ { "click": TARGET } | { "fill": TARGET, "value": "..." } | { "press": "Escape" }
//              | { "select": TARGET, "value": "<option value>" }
//              | { "scroll": TARGET } | { "hover": TARGET } ],
//        "ready": TARGET,                        waited for before the capture
//        "annotate": [ { "kind": "arrow" | "box" | "marker", "n": 1, "target": TARGET,   n: the step number (optional for arrow and box)
//                        "from": "below-left" | { "390": "below", "desktop": "below-left" },
//                        "at": "left" | "above" | "corner" } ] } ] }
//
// A TARGET is { "css": "..." }, { "role": "button", "nameKey": "<i18n key>" },
// { "role": "dialog" }, { "labelKey": "<i18n key>" } (the control that label
// names), or { "fieldKey": "<i18n key>" } (the whole <label> of a form field,
// its control inside), optionally with
// "in": TARGET to look inside another element and "args" to fill an i18n
// template. Names come from packages/i18n/src/strings.pt.json by KEY, so a
// renamed button moves its target with it and no spec holds Portuguese copy.
// EXACTLY ONE VISIBLE MATCH or the run stops: an annotation that could point
// at either of two elements is refused rather than drawn on the first. A css
// value is a Playwright selector, so where several cards repeat one control
// the spec says which on purpose ("[data-testid=\"open-blocks\"] >> nth=0").
// A lesson whose two sizes render two different trees (the agenda: a grid on a
// computer, a list on a phone) names both in one css list; only one is visible
// at each size.
//
// The overlay's colours are tokens read from packages/ui/theme.css at run
// time. No dependency: Playwright is resolved from apps/web, as
// build-guide.mjs does. Exit codes: 0 written; 1 a spec or a capture failed;
// 2 a bad argument or a refused host.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUIDE_ACCOUNTS, GUIDE_PASSWORD } from './seed-guide.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
export const SHOTS_DIR = path.join(REPO, 'docs', 'guide', 'shots');
export const TEXT_DIR = path.join(SHOTS_DIR, 'text');
export const AJUDA_DIR = path.join(REPO, 'apps', 'web', 'public', 'ajuda');

class CaptureError extends Error {}
class ArgumentError extends Error {}

/** The only hosts a capture may photograph. */
export const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1']);

/** The base URL, refused unless it is http(s) on a local host. */
export function checkBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ArgumentError(`--base-url is not a URL: ${raw}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ArgumentError(`--base-url must be http or https, not ${url.protocol}`);
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    throw new ArgumentError(`refusing ${url.hostname}: a guide capture runs only against localhost or 127.0.0.1, never a deployed platform`);
  }
  if (url.username || url.password) throw new ArgumentError('--base-url carries credentials; refusing');
  return url.origin;
}

// ==== inputs ====

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k?.startsWith('--') || v === undefined || !['base-url', 'only', 'frames'].includes(k.slice(2))) {
      throw new ArgumentError(`bad argument near ${k ?? '(end)'}; usage: --base-url <url> [--only <id,id>] [--frames <dir>]`);
    }
    out[k.slice(2)] = v;
  }
  if (!out['base-url']) throw new ArgumentError('--base-url is required');
  out['base-url'] = checkBaseUrl(out['base-url']);
  return out;
}

const SPEC_KEYS = new Set(['$comment', 'id', 'profile', 'sizes', 'stabilize', 'frames']);
const FRAME_KEYS = new Set(['$comment', 'goto', 'do', 'ready', 'annotate']);
const NOTE_KEYS = new Set(['kind', 'n', 'target', 'from', 'at']);
const TARGET_KEYS = new Set(['css', 'role', 'nameKey', 'labelKey', 'fieldKey', 'in', 'args']);
const ID = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;

function checkTarget(target, where) {
  if (!target || typeof target !== 'object') throw new CaptureError(`${where}: a target is an object`);
  for (const key of Object.keys(target)) if (!TARGET_KEYS.has(key)) throw new CaptureError(`${where}: unknown target key "${key}"`);
  const kinds = ['css', 'role', 'labelKey', 'fieldKey'].filter((k) => target[k] !== undefined);
  if (kinds.length !== 1) throw new CaptureError(`${where}: a target has exactly one of css, role, labelKey or fieldKey`);
  if (target.nameKey !== undefined && target.role === undefined) throw new CaptureError(`${where}: nameKey goes with role`);
  if (target.in !== undefined) checkTarget(target.in, `${where} (in)`);
}

/** Reads and checks one spec; every problem names the file. */
export function readSpec(file) {
  const rel = path.relative(REPO, file);
  let spec;
  try {
    spec = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CaptureError(`${rel}: not JSON (${error.message})`);
  }
  for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) throw new CaptureError(`${rel}: unknown key "${key}"`);
  const match = ID.exec(spec.id ?? '');
  if (!match) throw new CaptureError(`${rel}: id is <section>.<slug>`);
  if (path.basename(file) !== `${spec.id}.shots.json`) throw new CaptureError(`${rel}: the file is named ${spec.id}.shots.json`);
  if (!Object.hasOwn(GUIDE_ACCOUNTS, spec.profile)) {
    throw new CaptureError(`${rel}: profile is one of ${Object.keys(GUIDE_ACCOUNTS).join(', ')}`);
  }
  for (const entry of spec.stabilize ?? []) {
    const ok = typeof entry === 'string' || (entry && typeof entry.css === 'string' && typeof entry.text === 'string' && Object.keys(entry).length === 2);
    if (!ok) throw new CaptureError(`${rel}: a stabilize entry is a selector, or { "css", "text" }`);
  }
  const sizes = spec.sizes ?? ['390', 'desktop'];
  for (const size of sizes) if (!SIZES[size]) throw new CaptureError(`${rel}: unknown size ${size}`);
  if (!Array.isArray(spec.frames) || spec.frames.length === 0) throw new CaptureError(`${rel}: no frames`);
  spec.frames.forEach((frame, i) => {
    const where = `${rel} frame ${i + 1}`;
    for (const key of Object.keys(frame)) if (!FRAME_KEYS.has(key)) throw new CaptureError(`${where}: unknown key "${key}"`);
    if (frame.ready) checkTarget(frame.ready, `${where} ready`);
    for (const step of frame.do ?? []) {
      const [verb] = Object.keys(step).filter((k) => k !== 'value');
      if (!['click', 'fill', 'select', 'press', 'scroll', 'hover'].includes(verb)) throw new CaptureError(`${where}: unknown step ${JSON.stringify(step)}`);
      if (verb !== 'press') checkTarget(step[verb], `${where} ${verb}`);
    }
    for (const note of frame.annotate ?? []) {
      for (const key of Object.keys(note)) if (!NOTE_KEYS.has(key)) throw new CaptureError(`${where}: unknown annotation key "${key}"`);
      if (!['arrow', 'box', 'marker'].includes(note.kind)) throw new CaptureError(`${where}: annotation kind is arrow, box or marker`);
      // n is the lesson's step number; a lesson with no numbered steps draws its boxes and arrows unnumbered.
      if (note.n !== undefined && (!Number.isInteger(note.n) || note.n < 1)) throw new CaptureError(`${where}: n is a step number, 1 or more`);
      if (note.kind === 'marker' && note.n === undefined) throw new CaptureError(`${where}: a marker is its number, n`);
      checkTarget(note.target, `${where} annotation ${note.n ?? note.kind}`);
    }
  });
  return { ...spec, sizes, section: match[1], slug: match[2], rel };
}

// The overlay's colours, by token name, from the one file that defines them.
const TOKENS = {
  ink: '--color-accent-1-700', // arrows, boxes, marker fill: the purple emphasis role
  onInk: '--color-text-inverse', // the marker number
  halo: '--color-surface', // the outline that keeps a stroke legible on any background
  canvas: '--color-surface-muted', // the composed image's background
  frame: '--color-border-strong', // the line around each frame
};

function readTokens() {
  const css = readFileSync(path.join(REPO, 'packages/ui/theme.css'), 'utf8');
  const out = {};
  for (const [key, name] of Object.entries(TOKENS)) {
    const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(css);
    if (!m) throw new CaptureError(`packages/ui/theme.css defines no hex for ${name}`);
    out[key] = m[1];
  }
  return out;
}

function readStrings() {
  return JSON.parse(readFileSync(path.join(REPO, 'packages/i18n/src/strings.pt.json'), 'utf8'));
}

// The phone size is a touch screen of a phone's width, but not Chromium's
// "mobile" emulation: with that, a scroll near the end of a page can pan the
// visual viewport off the layout viewport, and the overlay, fixed to the
// layout viewport, is then drawn off its targets (settle() refuses that case).
// The platform's layout follows the width, so the page is the same.
export const SIZES = {
  390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true, arm: 96 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, arm: 130 },
};

function loadChromium() {
  const require = createRequire(path.join(REPO, 'apps/web/package.json'));
  for (const name of ['@playwright/test', 'playwright-core', 'playwright']) {
    try {
      const mod = require(require.resolve(name));
      if (mod?.chromium) return mod.chromium;
    } catch {
      /* try the next one */
    }
  }
  throw new CaptureError('Playwright is not installed for apps/web; run pnpm install');
}

// ==== targets ====

function nameOf(key, args, strings) {
  let value = strings[key];
  if (typeof value !== 'string') throw new CaptureError(`no i18n string ${key}`);
  if (args) value = value.replace(/\{(\w+)\}/g, (all, name) => (args[name] === undefined ? all : String(args[name])));
  if (/\{\w+\}/.test(value)) throw new CaptureError(`i18n string ${key} is a template; give its "args"`);
  return value;
}

async function locate(page, target, strings) {
  let scope = page;
  if (target.in) {
    const outer = await locate(page, target.in, strings);
    const n = await outer.count();
    if (n !== 1) throw new CaptureError(`container ${JSON.stringify(target.in)} matches ${n} visible elements, not 1`);
    scope = outer;
  }
  let loc;
  if (target.css) loc = scope.locator(target.css);
  else if (target.role) {
    const name = target.nameKey ? nameOf(target.nameKey, target.args, strings) : undefined;
    loc = scope.getByRole(target.role, name === undefined ? {} : { name, exact: true });
  } else if (target.labelKey) loc = scope.getByLabel(nameOf(target.labelKey, target.args, strings), { exact: true });
  else {
    // A whole form field: the <label> whose text starts with the string (a
    // required field's label ends in "*"), with the control inside it.
    const text = nameOf(target.fieldKey, target.args, strings).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    loc = scope.locator('label').filter({ hasText: new RegExp(`^\\s*${text}`) });
  }
  return loc.filter({ visible: true });
}

async function one(page, target, strings, what, wait = false) {
  const loc = await locate(page, target, strings);
  // A step waits for its target to appear (the page may still be rendering);
  // then, like an annotation, it needs exactly one visible match.
  if (wait) await loc.first().waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {});
  const n = await loc.count();
  if (n !== 1) throw new CaptureError(`${what} ${JSON.stringify(target)} matches ${n} visible elements, not 1`);
  return loc;
}

// The box of the one visible match, which must sit inside the viewport: a
// target out of view needs a "scroll" step first, because scrolling here would
// move every box measured before it.
async function boxOf(page, target, strings, vw, vh) {
  const loc = await one(page, target, strings, 'target');
  const box = await loc.boundingBox();
  if (!box) throw new CaptureError(`target ${JSON.stringify(target)} has no box`);
  if (box.x < 0 || box.y < 0 || box.x + box.width > vw + 0.5 || box.y + box.height > vh + 0.5) {
    throw new CaptureError(`target ${JSON.stringify(target)} is outside the viewport; add a "scroll" step before it`);
  }
  return box;
}

// ==== geometry ====

const R = 15; // marker radius, CSS px
const EDGE = 6; // margin kept from the viewport edge

const DIRECTIONS = {
  'below-left': [-1, 1],
  'below-right': [1, 1],
  'above-left': [-1, -1],
  'above-right': [1, -1],
  left: [-1, 0],
  right: [1, 0],
  above: [0, -1],
  below: [0, 1],
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 10) / 10;

// The point where a ray from the box centre, heading (ux, uy), leaves the box.
function exitPoint(box, ux, uy) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const tx = ux === 0 ? Infinity : box.width / 2 / Math.abs(ux);
  const ty = uy === 0 ? Infinity : box.height / 2 / Math.abs(uy);
  const t = Math.min(tx, ty);
  return [cx + ux * t, cy + uy * t];
}

function arrow(box, from, arm, vw, vh) {
  const d = DIRECTIONS[from];
  if (!d) throw new CaptureError(`unknown arrow direction ${from}`);
  const len = Math.hypot(d[0], d[1]);
  const ux = d[0] / len;
  const uy = d[1] / len;
  const [ex, ey] = exitPoint(box, ux, uy);
  const end = [ex + ux * 7, ey + uy * 7];
  const tail = [clamp(end[0] + ux * arm, R + EDGE, vw - R - EDGE), clamp(end[1] + uy * arm, R + EDGE, vh - R - EDGE)];
  const vx = end[0] - tail[0];
  const vy = end[1] - tail[1];
  const L = Math.hypot(vx, vy);
  const start = [tail[0] + (vx / L) * (R + 4), tail[1] + (vy / L) * (R + 4)];
  // A gentle bend: the control point sits off the straight line, to the side.
  const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const ctrl = [mid[0] + (-vy / L) * L * 0.18, mid[1] + (vx / L) * L * 0.18];
  // The head follows the curve's last tangent.
  const tx = end[0] - ctrl[0];
  const ty = end[1] - ctrl[1];
  const tl = Math.hypot(tx, ty);
  const [hx, hy] = [tx / tl, ty / tl];
  const base = [end[0] - hx * 16, end[1] - hy * 16];
  const head = [end, [base[0] - hy * 8, base[1] + hx * 8], [base[0] + hy * 8, base[1] - hx * 8]].map((p) => p.map(round));
  const lineEnd = [end[0] - hx * 10, end[1] - hy * 10];
  const p = (pt) => pt.map(round).join(',');
  return { path: `M ${p(start)} Q ${p(ctrl)} ${p(lineEnd)}`, head, marker: tail.map(round) };
}

function frameRect(box, pad = 6) {
  return { x: round(box.x - pad), y: round(box.y - pad), width: round(box.width + pad * 2), height: round(box.height + pad * 2) };
}

// Where a number goes beside a rectangle: outside to the left, else above,
// else on the corner, whichever fits the viewport and covers no other box or
// number already drawn; "at" forces one.
function markerBeside(rect, at, vw, vh, placed = []) {
  const clear = ([x, y]) =>
    placed.every((s) => {
      if (s.rect && x + R > s.rect.x && x - R < s.rect.x + s.rect.width && y + R > s.rect.y && y - R < s.rect.y + s.rect.height) return false;
      return s.n === undefined || !s.marker || Math.hypot(s.marker[0] - x, s.marker[1] - y) > 2 * R + 4;
    });
  const fits = (pt) => pt[0] - R >= EDGE && pt[0] + R <= vw - EDGE && pt[1] - R >= EDGE && pt[1] + R <= vh - EDGE && clear(pt);
  const candidates = {
    left: [rect.x - R - 6, rect.y + R],
    above: [rect.x + R + 4, rect.y - R - 6],
    corner: [rect.x + 2, rect.y + 2],
  };
  if (at && !candidates[at]) throw new CaptureError(`"at" is left, above or corner, not ${at}`);
  const order = at ? [at] : ['left', 'above', 'corner'];
  for (const key of order) if (fits(candidates[key])) return candidates[key].map(round);
  return [clamp(rect.x, R + EDGE, vw - R - EDGE), clamp(rect.y, R + EDGE, vh - R - EDGE)].map(round);
}

function svgFor(shapes, t, vw, vh) {
  const halo = `stroke="${t.halo}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const ink = `stroke="${t.ink}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const parts = [];
  for (const s of shapes) {
    if (s.kind === 'arrow') {
      const pts = s.head.map((p) => p.join(',')).join(' ');
      parts.push(`<path d="${s.path}" ${halo} stroke-width="8"/>`);
      parts.push(`<polygon points="${pts}" fill="${t.halo}" stroke="${t.halo}" stroke-width="5" stroke-linejoin="round"/>`);
      parts.push(`<path d="${s.path}" ${ink} stroke-width="3.5"/>`);
      parts.push(`<polygon points="${pts}" fill="${t.ink}" stroke="${t.ink}" stroke-width="1.5" stroke-linejoin="round"/>`);
    } else if (s.kind === 'box') {
      const { x, y, width, height } = s.rect;
      parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" ${halo} stroke-width="7"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" ${ink} stroke-width="3"/>`);
    }
  }
  // Numbers last, so no stroke crosses one.
  for (const s of shapes) {
    if (s.n === undefined) continue;
    const [cx, cy] = s.marker;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${R + 2.5}" fill="${t.halo}"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${t.ink}"/>`);
    parts.push(
      `<text x="${cx}" y="${cy}" dy="0.35em" text-anchor="middle" font-size="16" font-weight="700" fill="${t.onInk}">${s.n}</text>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}" style="display:block;font-family:inherit">${parts.join('')}</svg>`;
}

// ==== overlay ====

// The overlay is a manual popover. A modal <dialog> (the appointment drawer) sits
// in the browser's top layer, above any z-index, so an ordinary positioned div
// would be drawn UNDER the drawer. A popover shown after the dialog joins the
// top layer above it, and a top-layer box is positioned against the viewport
// whatever transform its parent carries.
async function drawOverlay(page, svg) {
  await page.evaluate((markup) => {
    document.getElementById('guia-anotacoes')?.remove();
    const host = document.createElement('div');
    host.id = 'guia-anotacoes';
    host.setAttribute('popover', 'manual');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;' +
      'border:0;background:transparent;overflow:visible;pointer-events:none;color:inherit;';
    host.innerHTML = markup;
    (document.querySelector('dialog[open]') ?? document.body).appendChild(host);
    host.showPopover();
  }, svg);
}

async function removeOverlay(page) {
  await page.evaluate(() => document.getElementById('guia-anotacoes')?.remove());
}

async function settle(page) {
  // A skeleton (packages/ui Skeleton, class animate-pulse) is a panel still
  // loading; the capture waits for every visible one to be replaced.
  try {
    await page.waitForFunction(
      () => ![...document.querySelectorAll('.animate-pulse')].some((el) => el.getBoundingClientRect().width > 0),
      null,
      { timeout: 60_000 },
    );
  } catch {
    throw new CaptureError('a panel is still loading (a skeleton is visible) after 60 s');
  }
  // A scroll may still be gliding (a smooth scroll ignores reduced motion);
  // every box is measured only once no scroll offset has moved for five frames.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const offsets = () => {
      let sum = window.scrollX * 7 + window.scrollY;
      for (const el of document.querySelectorAll('*')) if (el.scrollTop || el.scrollLeft) sum += el.scrollTop * 3 + el.scrollLeft * 5;
      return sum;
    };
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    let last = offsets();
    let still = 0;
    for (let i = 0; i < 300 && still < 5; i += 1) {
      await frame();
      const now = offsets();
      still = now === last ? still + 1 : 0;
      last = now;
    }
  });
  const offset = await page.evaluate(() => {
    const v = window.visualViewport;
    return v ? { top: v.offsetTop, left: v.offsetLeft, scale: v.scale } : { top: 0, left: 0, scale: 1 };
  });
  if (offset.top !== 0 || offset.left !== 0 || offset.scale !== 1) {
    throw new CaptureError(`the visual viewport is off the layout viewport (${JSON.stringify(offset)}); the overlay would miss its targets`);
  }
}

async function stabilize(page, entries) {
  // The dev server's own indicator is not part of the product; a spec's
  // entries hold still what changes from one run to the next.
  const hidden = ['nextjs-portal', ...entries.filter((e) => typeof e === 'string')];
  const replaced = entries.filter((e) => typeof e === 'object');
  await page.evaluate(
    ({ css, texts }) => {
      let style = document.getElementById('guia-estabilizar');
      if (!style) {
        style = document.createElement('style');
        style.id = 'guia-estabilizar';
        document.head.appendChild(style);
      }
      style.textContent = css;
      for (const { css: selector, text } of texts) for (const el of document.querySelectorAll(selector)) el.textContent = text;
    },
    { css: hidden.map((s) => `${s}{visibility:hidden!important}`).join('\n'), texts: replaced },
  );
}

// ==== run ====

// Three tries: under load the local auth service now and then answers a
// sign in slowly enough that the form comes back unchanged.
async function login(page, base, profile, strings) {
  for (let attempt = 1; ; attempt += 1) {
    await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 180_000 });
    await page.locator('input[name="email"]').fill(GUIDE_ACCOUNTS[profile]);
    await page.locator('input[name="password"]').fill(GUIDE_PASSWORD);
    await page.getByRole('button', { name: nameOf('login.submit', null, strings), exact: true }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
      return;
    } catch (error) {
      if (attempt === 3) throw new CaptureError(`the ${profile} guide account could not sign in; is the stack seeded with seed-guide.mjs?`);
    }
  }
}

async function runStep(page, step, strings) {
  if (step.press) {
    await page.keyboard.press(step.press);
    return;
  }
  if (step.click) await (await one(page, step.click, strings, 'click', true)).click();
  else if (step.fill) await (await one(page, step.fill, strings, 'fill', true)).fill(String(step.value ?? ''));
  else if (step.select) await (await one(page, step.select, strings, 'select', true)).selectOption(String(step.value ?? ''));
  // Scrolled by the page itself: on a phone viewport Playwright's own scroll can
  // move the visual viewport off the layout viewport, and the overlay, which is
  // fixed to the layout viewport, would then be drawn off its targets.
  else if (step.scroll) await (await one(page, step.scroll, strings, 'scroll', true)).evaluate((el) => el.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
  else if (step.hover) await (await one(page, step.hover, strings, 'hover', true)).hover();
}

// One sign in per profile per run: the session's cookies are reused by every
// later context of that profile, so a run of many specs signs in a few times,
// not twice per spec.
const sessions = new Map();

async function captureSize(browser, spec, sizeKey, opts, tokens, strings) {
  const size = SIZES[sizeKey];
  const context = await browser.newContext({
    storageState: sessions.get(spec.profile),
    viewport: size.viewport,
    deviceScaleFactor: size.deviceScaleFactor,
    isMobile: size.isMobile,
    hasTouch: size.hasTouch,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const { width: vw, height: vh } = size.viewport;
  const shots = [];
  const texts = [];
  try {
    if (!sessions.has(spec.profile)) {
      await login(page, opts['base-url'], spec.profile, strings);
      sessions.set(spec.profile, await context.storageState());
    }
    for (const [i, frame] of spec.frames.entries()) {
      if (frame.goto) {
        await page.goto(`${opts['base-url']}${frame.goto}`, { waitUntil: 'load', timeout: 180_000 });
        // A click before React hydrates does nothing; a quiet network is the sign it has.
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      }
      for (const step of frame.do ?? []) await runStep(page, step, strings);
      if (frame.ready) await (await locate(page, frame.ready, strings)).first().waitFor({ state: 'visible', timeout: 120_000 });
      // The pointer rests where the last click left it, and a grid cell under it
      // shows its hover state; park it in the corner unless the frame hovers on purpose.
      if (!(frame.do ?? []).some((step) => step.hover)) await page.mouse.move(0, 0);
      await stabilize(page, spec.stabilize ?? []);
      await settle(page);
      texts.push(await page.evaluate(() => document.body.innerText));
      const shapes = [];
      for (const a of frame.annotate ?? []) {
        const box = await boxOf(page, a.target, strings, vw, vh);
        if (a.kind === 'arrow') {
          // `from` is one direction, or one per size ({"390": "below", "desktop": "below-left"}).
          const from = typeof a.from === 'object' && a.from !== null ? a.from[sizeKey] : a.from;
          shapes.push({ kind: 'arrow', n: a.n, ...arrow(box, from ?? 'below-left', size.arm, vw, vh) });
        } else if (a.kind === 'box') {
          const rect = frameRect(box);
          shapes.push({ kind: 'box', n: a.n, rect, marker: markerBeside(rect, a.at, vw, vh, shapes) });
        } else {
          shapes.push({ kind: 'marker', n: a.n, marker: markerBeside(frameRect(box, 2), a.at, vw, vh, shapes) });
        }
      }
      await drawOverlay(page, svgFor(shapes, tokens, vw, vh));
      await settle(page);
      const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      await removeOverlay(page);
      if (opts.frames) {
        mkdirSync(opts.frames, { recursive: true });
        writeFileSync(path.join(opts.frames, `${spec.id}-${sizeKey}-${i + 1}.png`), png);
      }
      shots.push(png);
    }
  } finally {
    await context.close();
  }
  return { png: await compose(browser, shots, size, tokens), texts };
}

// The frames of one size side by side, step 1 on the left.
async function compose(browser, shots, size, t) {
  const context = await browser.newContext({ deviceScaleFactor: size.deviceScaleFactor, viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  const w = size.viewport.width;
  const imgs = shots.map((png) => `<img src="data:image/png;base64,${png.toString('base64')}" style="width:${w}px">`).join('');
  await page.setContent(
    `<!doctype html><html><head><style>
      body{margin:0;background:${t.canvas}}
      .row{display:flex;gap:24px;padding:24px;width:max-content;background:${t.canvas}}
      img{display:block;border:1px solid ${t.frame};border-radius:8px}
    </style></head><body><div class="row">${imgs}</div></body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(async () => Promise.all([...document.images].map((i) => i.decode())));
  const png = await page.locator('.row').screenshot();
  await context.close();
  return png;
}

/** The text record: the PNG's sha256, then each frame's visible text. */
export function textRecord(png, texts) {
  const sha = createHash('sha256').update(png).digest('hex');
  const body = texts.map((text, i) => `## frame ${i + 1}\n${text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trimEnd()}\n`);
  return `sha256 ${sha}\n${body.join('')}`;
}

/** The PNG and text record paths of one lesson and size. */
export function outputsOf(section, slug, sizeKey) {
  return {
    png: path.join(AJUDA_DIR, section, `${slug}-${sizeKey}.png`),
    text: path.join(TEXT_DIR, section, `${slug}-${sizeKey}.txt`),
  };
}

function specFiles(only) {
  if (!existsSync(SHOTS_DIR)) throw new CaptureError('docs/guide/shots does not exist');
  const all = readdirSync(SHOTS_DIR)
    .filter((name) => name.endsWith('.shots.json'))
    .sort();
  if (!only) return all.map((name) => path.join(SHOTS_DIR, name));
  const wanted = only.split(',').filter(Boolean);
  for (const id of wanted) if (!all.includes(`${id}.shots.json`)) throw new CaptureError(`no spec docs/guide/shots/${id}.shots.json`);
  return wanted.map((id) => path.join(SHOTS_DIR, `${id}.shots.json`));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const specs = specFiles(opts.only).map(readSpec);
  const tokens = readTokens();
  const strings = readStrings();
  const chromium = loadChromium();
  const browser = await chromium.launch();
  const failed = [];
  try {
    for (const spec of specs) {
      try {
        const results = [];
        for (const sizeKey of spec.sizes) results.push([sizeKey, await captureSize(browser, spec, sizeKey, opts, tokens, strings)]);
        // Written only once every size succeeded, so a failed spec leaves its old pair intact.
        for (const [sizeKey, { png, texts }] of results) {
          const out = outputsOf(spec.section, spec.slug, sizeKey);
          mkdirSync(path.dirname(out.png), { recursive: true });
          mkdirSync(path.dirname(out.text), { recursive: true });
          writeFileSync(out.png, png);
          writeFileSync(out.text, textRecord(png, texts));
          process.stdout.write(`${path.relative(REPO, out.png)}\n`);
        }
      } catch (error) {
        if (!(error instanceof CaptureError) && !/Timeout|locator|Target/.test(String(error?.message))) throw error;
        failed.push(`${spec.rel}: ${error.message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed.length > 0) {
    process.stderr.write(`capture-guide: ${failed.length} spec(s) failed, their captures left unchanged:\n${failed.map((f) => `  ${f}`).join('\n')}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      if (error instanceof ArgumentError) {
        process.stderr.write(`capture-guide: ${error.message}\n`);
        process.exitCode = 2;
        return;
      }
      process.stderr.write(`capture-guide: ${error instanceof CaptureError ? error.message : error.stack}\n`);
      process.exitCode = 1;
    },
  );
}
