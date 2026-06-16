'use server'

import { getDocumentDownloadUrl } from '@/lib/api/client'

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
