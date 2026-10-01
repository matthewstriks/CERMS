import { getFirebaseServices } from './firebase-membership'

export const documentBase = 'projects/cerms-7af24/databases/cerms/documents'
export interface VersionedDocument {
  name: string
  updateTime: string
  fields: Record<string, any>
}
/** REST exposes the updateTime precondition needed for safe edits/deletion. */
export async function readVersionedDocument(path: string): Promise<VersionedDocument | null> {
  if (
    !/^(members\/[a-zA-Z0-9_-]{1,128}|system\/[a-zA-Z0-9_-]{1,128}\/(products|memberIdentities|memberNumbers|staffPermissions)\/[a-zA-Z0-9_-]{1,128})$/.test(
      path,
    )
  )
    throw new Error('Unsupported document path.')
  const user = getFirebaseServices().auth.currentUser
  if (!user) throw new Error('Sign in again to continue.')
  const name = `${documentBase}/${path}`
  const response = await fetch(`https://firestore.googleapis.com/v1/${documentBase}:batchGet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ documents: [name] }),
  })
  if (!response.ok)
    throw new Error('The record could not be read. Check your connection and permissions.')
  const rows: any = await response.json()
  if (!Array.isArray(rows) || rows.length !== 1)
    throw new Error('The record response could not be verified.')
  const row = rows[0]
  if (row.missing === name) return null
  if (row.found?.name !== name || typeof row.found.updateTime !== 'string' || !row.found.fields)
    throw new Error('The record version could not be verified.')
  return row.found as VersionedDocument
}
