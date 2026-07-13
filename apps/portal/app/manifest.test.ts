import { describe, expect, it } from 'vitest'
import manifest from './manifest'

// Guards the PWA install contract: name/short_name, the logged-in start_url,
// standalone display, brand theme colour, and exactly the three icon entries
// (192 any, 512 any, 512 maskable) that make the portal installable.
describe('portal PWA manifest', () => {
  const m = manifest()

  it('carries the OsteoJP identity and PT description', () => {
    expect(m.name).toBe('OsteoJP')
    expect(m.short_name).toBe('OsteoJP')
    expect(m.lang).toBe('pt')
    expect(m.description).toMatch(/paciente/i)
  })

  it('opens standalone on the logged-in landing route with brand colours', () => {
    expect(m.start_url).toBe('/portal/dashboard')
    expect(m.display).toBe('standalone')
    expect(m.theme_color).toBe('#45B9A7')
    expect(m.background_color).toBe('#F7F9FB')
  })

  it('declares 192/512 any icons plus a 512 maskable variant', () => {
    const icons = m.icons ?? []
    expect(icons).toHaveLength(3)
    expect(icons.every((i) => i.type === 'image/png')).toBe(true)

    const any192 = icons.find((i) => i.sizes === '192x192')
    const any512 = icons.find(
      (i) => i.sizes === '512x512' && i.purpose === 'any',
    )
    const maskable = icons.find(
      (i) => i.sizes === '512x512' && i.purpose === 'maskable',
    )

    expect(any192?.purpose).toBe('any')
    expect(any192?.src).toBe('/icon-192.png')
    expect(any512?.src).toBe('/icon-512.png')
    expect(maskable?.src).toBe('/icon-512-maskable.png')
  })
})
