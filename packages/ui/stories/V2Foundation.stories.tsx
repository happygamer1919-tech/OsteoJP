import type { Meta, StoryObj } from "@storybook/react-vite";

import { heritageV2Motif } from "../src/assets/heritage/v2/heritage-v2-svg";

/**
 * V2 Foundation tokens (SPEC-v2-foundation.md, task V2-W0-01).
 *
 * The foundation has no component of its own — it ships the v2 theme tokens, the
 * glass system, and the two heritage-v2 edge assets. These stories render the
 * tokens directly (palette swatches, glass surfaces, radius, shadow, greeting,
 * hover lift, heritage motifs) so the design and a11y reviewers can verify
 * token-only values without a screen.
 */
const meta = {
  title: "Foundation/V2 Foundation Tokens",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ACCENTS = [
  { name: "Portuguese Blue", token: "v2-blue", role: "Azulejo, graphs, Marcações hoje" },
  { name: "Moldavian Burgundy", token: "v2-burgundy", role: "Embroidery, Osteopatia" },
  { name: "Wellness Green", token: "v2-green", role: "Success, active menu, primary fills" },
  { name: "Soft Lavender", token: "v2-lavender", role: "Clinical records, forms, fichas KPI" },
  { name: "Warm Gold", token: "v2-gold", role: "Revenue, premium indicators" },
] as const;

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-dvh bg-v2-bg p-12 font-sans text-v2-text-primary">
    <div className="mx-auto flex max-w-4xl flex-col gap-12">{children}</div>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-2xl text-v2-text-primary">{children}</h2>
);

/** §3 palette: five accent families, base = 500, AA label step = 700. */
export const Palette: Story = {
  render: () => (
    <Page>
      <SectionTitle>Palette — OsteoJP theme (§3)</SectionTitle>
      <div className="flex flex-col gap-8">
        {ACCENTS.map((a) => (
          <div key={a.token} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-lg">{a.name}</span>
              <span className="text-sm text-v2-text-secondary">{a.role}</span>
            </div>
            <div className="flex gap-1">
              {STEPS.map((s) => (
                <div key={s} className="flex flex-1 flex-col gap-1">
                  <div
                    className="h-16 rounded-md shadow-v2-float"
                    // Swatch fills are inherently dynamic across 5 families x 10
                    // steps; reference the generated token variables directly
                    // (token-only, no hardcoded hex) rather than emit 50 literal
                    // utility classes the static scanner would need.
                    style={{ backgroundColor: `var(--color-${a.token}-${s})` }}
                  />
                  {/* Step index sits below the fill in AA secondary text, so the
                      label legibility never depends on the swatch colour. */}
                  <span className="text-center text-xs text-v2-text-secondary">{s}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Page>
  ),
};

/** §3.1 base surfaces + text, with the §3.4 AA rule (label text at 700). */
export const SurfacesAndText: Story = {
  render: () => (
    <Page>
      <SectionTitle>Surfaces and text (§3.1, §3.4)</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-v2 border border-v2-border bg-v2-surface p-6">
          <p className="text-v2-text-primary">Primary text on surface — #223042</p>
          <p className="text-v2-text-secondary">Secondary text — captions, metadata</p>
        </div>
        <div className="rounded-v2 border border-v2-border bg-v2-surface p-6">
          <p className="text-v2-blue-700">Blue label text at 700 (AA on white)</p>
          <p className="text-v2-burgundy-700">Burgundy label text at 700</p>
          <p className="text-v2-green-700">Green label text at 700</p>
          <p className="text-v2-lavender-700">Lavender label text at 700</p>
          <p className="text-v2-gold-700">Gold label text at 700</p>
        </div>
      </div>
    </Page>
  ),
};

/** §4 glass system: card, nav, active tint, radius, float shadow, hover lift. */
export const GlassSurfaces: Story = {
  render: () => (
    <Page>
      <SectionTitle>Glass system (§4, §8)</SectionTitle>
      <div className="grid grid-cols-3 gap-6">
        <div className="glass-card p-6">
          <p className="text-lg">glass-card</p>
          <p className="text-sm text-v2-text-secondary">
            blur 24px · 72% white · float shadow · radius 24px
          </p>
        </div>
        <button type="button" className="glass-card hover-lift p-6 text-left">
          <p className="text-lg">glass-card + hover-lift</p>
          <p className="text-sm text-v2-text-secondary">
            translateY(-4px) on hover (suppressed under reduced motion)
          </p>
        </button>
        <div className="rounded-v2-kpi bg-v2-glass-active-bg p-6">
          {/* On the green-15% active tint, green-700 drops to ~4.2:1; green-800
              clears AA, so active-state labels on the tint use 800 not 700. */}
          <p className="text-lg text-v2-green-800">active nav tint</p>
          <p className="text-sm text-v2-text-secondary">
            Wellness Green glass · radius 28px (KPI)
          </p>
        </div>
      </div>
      <div className="glass-nav inline-flex gap-3 rounded-v2 p-3">
        <span className="rounded-v2 bg-v2-glass-active-bg px-4 py-2 text-v2-green-800">
          Início
        </span>
        <span className="px-4 py-2 text-v2-text-secondary">Agenda</span>
        <span className="px-4 py-2 text-v2-text-secondary">Pacientes</span>
      </div>
    </Page>
  ),
};

/** §5 greeting size token. No exclamation, per brand-voice. */
export const Greeting: Story = {
  render: () => (
    <Page>
      <SectionTitle>Typography (§5)</SectionTitle>
      <p className="text-v2-greeting">Bom dia, Ana</p>
      <p className="text-v2-text-secondary">42px / 600 greeting · no exclamation</p>
    </Page>
  ),
};

/** §6 heritage-v2 edge motifs, tiled as the frame will run them down the edges. */
export const HeritageMotifs: Story = {
  render: () => (
    <Page>
      <SectionTitle>Heritage-v2 edge motifs (§6, OsteoJP theme only)</SectionTitle>
      <div className="flex gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-v2-text-secondary">
            embroidery-left — burgundy, 20% (frame-applied)
          </span>
          <div
            className="h-64 w-12 rounded-v2 border border-v2-border"
            style={{
              backgroundImage: `url("${heritageV2Motif.embroideryLeft}")`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "100% auto",
              opacity: 0.2,
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-v2-text-secondary">
            azulejo-right — blue, 18% (frame-applied)
          </span>
          <div
            className="h-64 w-12 rounded-v2 border border-v2-border"
            style={{
              backgroundImage: `url("${heritageV2Motif.azulejoRight}")`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "100% auto",
              opacity: 0.18,
            }}
          />
        </div>
      </div>
    </Page>
  ),
};
