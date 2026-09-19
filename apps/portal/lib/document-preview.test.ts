import { describe, expect, it } from 'vitest'

import { PREVIEWABLE_DOCUMENT_MIME, isDocumentPreviewable } from './document-preview'

/**
 * The portal's copy of the previewable-type list, pinned to the same four
 * literals as the api and web copies. If this suite and its two siblings ever
 * disagree, one app is offering a button another app refuses.
 */

describe('the types the portal offers to preview', () => {
  it('are exactly the four every browser renders', () => {
    expect([...PREVIEWABLE_DOCUMENT_MIME]).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
  })

  it('offers a PDF and the three web image types', () => {
    expect(isDocumentPreviewable('application/pdf')).toBe(true)
    expect(isDocumentPreviewable('image/jpeg')).toBe(true)
    expect(isDocumentPreviewable('image/png')).toBe(true)
    expect(isDocumentPreviewable('image/webp')).toBe(true)
  })

  it('tolerates stored casing and padding', () => {
    expect(isDocumentPreviewable('Application/PDF')).toBe(true)
    expect(isDocumentPreviewable('  image/PNG  ')).toBe(true)
  })
})

describe('what keeps the download button alone', () => {
  it('does not offer HEIC or HEIF, which Chrome and Firefox do not render', () => {
    expect(isDocumentPreviewable('image/heic')).toBe(false)
    expect(isDocumentPreviewable('image/heif')).toBe(false)
  })

  it('does not offer Word documents', () => {
    expect(isDocumentPreviewable('application/msword')).toBe(false)
    expect(
      isDocumentPreviewable(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(false)
  })

  it('does not offer a document with no stored type', () => {
    // Every imported row whose vendor export omitted tipo_mime looks like this.
    expect(isDocumentPreviewable(null)).toBe(false)
    expect(isDocumentPreviewable(undefined)).toBe(false)
    expect(isDocumentPreviewable('')).toBe(false)
    expect(isDocumentPreviewable('   ')).toBe(false)
  })

  it('does not offer svg, which renders and can carry script', () => {
    expect(isDocumentPreviewable('image/svg+xml')).toBe(false)
  })
})
