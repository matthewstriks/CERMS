import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import type { MembershipReader } from './membership-contracts'
import {
  canManageCatalog,
  catalogCommit,
  isCatalogCommit,
  type CatalogKind,
} from '../shared/catalog-policy'
import {
  validCategory,
  validProduct,
  type CatalogCategory,
  type CatalogProduct,
  type CatalogRecord,
} from '../domain/catalog'
export function createCatalog(reader: MembershipReader) {
  const { auth, db } = getFirebaseServices()
  let cursor: QueryDocumentSnapshot | undefined
  async function session() {
    if (auth.currentUser?.uid !== reader.uid) throw new Error('Sign in again to manage products.')
    const profile = await getDoc(doc(db, 'users', reader.uid))
    if (
      !profile.exists() ||
      profile.data().access !== reader.club ||
      !canManageCatalog(reader.uid, reader.club, profile.data().rank) ||
      auth.currentUser?.uid !== reader.uid
    )
      throw new Error(
        'Business admin access is required for this system. Sign in again if your access changed.',
      )
  }
  function read<T>(
    snapshot: QueryDocumentSnapshot,
    valid: (d: unknown) => boolean,
  ): CatalogRecord<T> {
    const { version, updatedAt: _time, updatedBy: _actor, ...data } = snapshot.data()
    if (!Number.isSafeInteger(version) || version < 1 || !valid(data))
      throw new Error('A catalog record has an unsupported format. No records were changed.')
    return { id: snapshot.id, version, data: data as T }
  }
  return {
    async categories(): Promise<CatalogRecord<CatalogCategory>[]> {
      await session()
      const rows: CatalogRecord<CatalogCategory>[] = []
      let after: QueryDocumentSnapshot | undefined
      do {
        const result = await getDocs(
          query(
            collection(db, 'system', reader.club, 'categories'),
            orderBy('name'),
            ...(after ? [startAfter(after)] : []),
            limit(100),
          ),
        )
        rows.push(...result.docs.map((d) => read<CatalogCategory>(d, validCategory)))
        if (result.size < 100) {
          await session()
          return rows
        }
        after = result.docs.at(-1)
      } while (rows.length < 1000)
      throw new Error('This catalog exceeds 1,000 categories. Contact your administrator.')
    },
    async products(reset = false) {
      await session()
      const result = await getDocs(
        query(
          collection(db, 'system', reader.club, 'products'),
          orderBy('name'),
          ...(!reset && cursor ? [startAfter(cursor)] : []),
          limit(100),
        ),
      )
      await session()
      cursor = result.docs.at(-1)
      return {
        rows: result.docs.map((d) => read<CatalogProduct>(d, validProduct)),
        more: result.size === 100,
      }
    },
    async save(
      kind: CatalogKind,
      id: string,
      data: CatalogProduct | CatalogCategory,
      priorVersion: number,
    ): Promise<number> {
      await session()
      const version = priorVersion + 1
      const body = JSON.stringify(
        catalogCommit(reader.club, kind, id, { ...data }, version, reader.uid),
      )
      if (!isCatalogCommit(body)) throw new Error('Check the product fields before saving.')
      const ref = doc(db, 'system', reader.club, kind, id)
      const matches = (saved: Record<string, unknown>) =>
        saved.version === version &&
        saved.updatedBy === reader.uid &&
        Object.entries(data).every(([k, v]) => JSON.stringify(v) === JSON.stringify(saved[k]))
      // A retry with an unchanged request cannot create another product or overwrite newer data.
      const before = await getDoc(ref)
      if (before.exists() && matches(before.data())) return version
      if ((before.exists() ? before.data().version : 0) !== priorVersion)
        throw new Error(
          'This item changed since you opened it. Close the editor and refresh before trying again.',
        )
      let response: Response | undefined
      try {
        response = await fetch(
          'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
              'Content-Type': 'application/json',
            },
            body,
          },
        )
      } catch {
        /* Confirm an uncertain commit using the same ID/version. */
      }
      if (response?.ok) return version
      const saved = await getDoc(ref)
      if (saved.exists() && matches(saved.data())) return version
      if (saved.exists() && saved.data().version !== priorVersion)
        throw new Error(
          'Another admin changed this item. Close the editor and refresh to see their changes.',
        )
      throw new Error(
        'Save was not confirmed. Check your connection and catalog permissions, then retry with the same details.',
      )
    },
  }
}
export type CatalogClient = ReturnType<typeof createCatalog>
