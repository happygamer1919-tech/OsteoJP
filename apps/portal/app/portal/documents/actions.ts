'use server'

import {
  getDocumentDownloadUrl,
  getDocumentPreviewUrl,
  type DocumentPreviewKind,
} from '@/lib/api/client'
import { s } from '@/lib/i18n'

export async function getDownloadUrlAction(
  id: string,
): Promise<{ url: string } | { error: string }> {
  try {
    const url = await getDocumentDownloadUrl(id)
    return { url }
  } catch {
    return { error: 'Não foi possível abrir o documento. Tente novamente.' }
  }
}

/**
 * A 60-second INLINE url for a document the patient owns, so it can be rendered
 * in the page. Every refusal - not theirs, not there, not a type a browser
 * renders - comes back as the same message, and the download button beside it
 * still works.
 */
export async function getPreviewUrlAction(
  id: string,
): Promise<{ url: string; kind: DocumentPreviewKind } | { error: string }> {
  try {
    return await getDocumentPreviewUrl(id)
  } catch {
    return { error: s.documents.preview_error }
  }
}
