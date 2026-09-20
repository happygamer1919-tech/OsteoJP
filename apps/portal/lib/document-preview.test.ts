import { describe, expect, it } from 'vitest'

import {
  PREVIEWABLE_DOCUMENT_MIME,
  isDocumentId,
  isDocumentPreviewable,
  narrowPreviewResponse,
} from './document-preview'

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

/**
 * THE ID IS CLIENT-CONTROLLED AND IT GOES INTO A FETCH PATH. `getPreviewUrlAction`
 * is a server action: anybody holding a session can call it with any string. Put
 * raw into `/api/v1/patient/documents/${id}/preview`, `../intake?` makes the
 * portal server fetch a DIFFERENT endpoint with that patient's bearer token and
 * hand the whole body back. It is only ever their own data, so nothing escalates,
 * but a preview action that can be aimed at another route is a confused deputy,
 * and the download beside it never returned more than `.url`.
 */
describe('the document id the preview action will accept', () => {
  it('accepts a uuid, in either case', () => {
    expect(isDocumentId('3f2b8c1e-9d4a-4b7c-8e21-0a1b2c3d4e5f')).toBe(true)
    expect(isDocumentId('3F2B8C1E-9D4A-4B7C-8E21-0A1B2C3D4E5F')).toBe(true)
  })

  it('refuses everything that could steer the path', () => {
    for (const id of ['', '../intake?', '../../v1/patient/intake', 'doc-1', '3f2b8c1e-9d4a-4b7c-8e21-0a1b2c3d4e5f/../x', ' 3f2b8c1e-9d4a-4b7c-8e21-0a1b2c3d4e5f', '3f2b8c1e-9d4a-4b7c-8e21-0a1b2c3d4e5f?x=1']) {
      expect(isDocumentId(id)).toBe(false)
    }
    expect(isDocumentId(undefined)).toBe(false)
    expect(isDocumentId(42)).toBe(false)
  })
})

describe('what the preview action hands back to the browser', () => {
  it('is url and kind and NOTHING else, whatever the body carried', () => {
    const out = narrowPreviewResponse({ url: 'https://x/object/sign/a?token=t', kind: 'pdf', intake: { notes: 'private' } })
    expect(out).toEqual({ url: 'https://x/object/sign/a?token=t', kind: 'pdf' })
    expect(Object.keys(out!)).toEqual(['url', 'kind'])
  })

  it('accepts the two kinds the route can return', () => {
    expect(narrowPreviewResponse({ url: 'https://x/a', kind: 'image' })).toEqual({ url: 'https://x/a', kind: 'image' })
  })

  it('refuses a body that is not a preview at all', () => {
    for (const body of [null, 'text', [], {}, { url: 'https://x/a' }, { kind: 'pdf' }, { url: '', kind: 'pdf' }, { url: 'https://x/a', kind: 'html' }, { url: 7, kind: 'pdf' }]) {
      expect(narrowPreviewResponse(body)).toBeNull()
    }
  })
})
