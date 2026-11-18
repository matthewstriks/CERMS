import { doc, getDoc } from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import type { MembershipReader } from './membership-contracts'
import {
  inventoryEmailEndpoint,
  inventoryRecipients,
  type InventoryEmailSettings,
} from '../shared/inventory-email-policy'
export function createInventoryEmailSettings(reader: Pick<MembershipReader, 'uid' | 'club'>) {
  async function call(data: Record<string, unknown>): Promise<InventoryEmailSettings> {
    const { auth, db } = getFirebaseServices()
    if (auth.currentUser?.uid !== reader.uid) throw Error('Sign in again.')
    const profile = await getDoc(doc(db, 'users', reader.uid))
    if (profile.data()?.access !== reader.club)
      throw Error('Business access changed. Reopen Settings.')
    const response = await fetch(inventoryEmailEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body: JSON.stringify({ data: { business: reader.club, ...data } }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.result)
      throw Error(
        payload.error?.message || 'Inventory email settings could not be loaded or saved.',
      )
    const result = payload.result
    if (
      typeof result.enabled !== 'boolean' ||
      !Array.isArray(result.recipients) ||
      !Number.isSafeInteger(result.revision) ||
      result.revision < 0
    )
      throw Error('Inventory email settings are unavailable.')
    return {
      enabled: result.enabled,
      recipients: inventoryRecipients(result.recipients),
      revision: result.revision,
    }
  }
  return {
    get: () => call({ action: 'get' }),
    save: (enabled: boolean, recipients: string[], expectedRevision: number) =>
      call({ action: 'save', enabled, recipients, expectedRevision }),
  }
}
