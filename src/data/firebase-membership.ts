import { initializeApp } from 'firebase/app'
import {
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth'
import {
  and,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  or,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore/lite'
import type {
  QueryNonFilterConstraint,
  QueryDocumentSnapshot,
  QueryFieldFilterConstraint,
  QueryCompositeFilterConstraint,
} from 'firebase/firestore/lite'
import { assertAccess, finiteNumber, memberFromLegacy, timestampToMillis } from '../domain/legacy'
import { firebaseDatabaseId, firebaseProjectId } from '../shared/firebase-policy'
import type { MembershipQuery, MembershipReader } from './membership-contracts'
import { dobVariants, nameVariants } from './membership-search'

const config = {
  apiKey: import.meta.env.RENDERER_VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.RENDERER_VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.RENDERER_VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.RENDERER_VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.RENDERER_VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.RENDERER_VITE_FIREBASE_APP_ID,
}
let services: ReturnType<typeof createServices> | undefined
function createServices() {
  if (!config.apiKey || !config.appId || config.projectId !== firebaseProjectId)
    throw new Error(
      'The existing CERMS Firebase client configuration is missing or incorrect. Check .env.local and restart the app.',
    )
  const app = initializeApp(config, 'cerms-membership-readonly')
  // No local auth persistence, record cache, analytics, or automatic user-profile updates.
  return {
    auth: initializeAuth(app, { persistence: inMemoryPersistence }),
    db: getFirestore(app, firebaseDatabaseId),
  }
}

export function getFirebaseServices() {
  services ??= createServices()
  return services
}

export function membershipError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (
    [
      'auth/invalid-credential',
      'auth/wrong-password',
      'auth/user-not-found',
      'auth/invalid-login-credentials',
    ].includes(code)
  )
    return 'Unable to sign in. Check your CERMS email and password.'
  if (code === 'auth/invalid-email') return 'Enter a valid email address.'
  if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Please try again later.'
  if (code === 'auth/user-disabled') return 'This account is disabled. Contact your administrator.'
  if (code === 'permission-denied')
    return 'Your existing Firebase permissions do not allow this read. No records or rules were changed.'
  if (code === 'failed-precondition')
    return 'Firebase cannot run this query with its current indexes. No indexes were created or changed. Try the recent-members view.'
  if (code === 'unavailable' || code === 'auth/network-request-failed')
    return 'Firebase could not be reached. Check your connection and try again.'
  if (code) return 'The Firebase request could not be completed. No data was changed.'
  return error instanceof Error ? error.message : 'Unable to load membership records.'
}

export async function connectMembership(
  email: string,
  password: string,
): Promise<MembershipReader> {
  services ??= createServices()
  const { auth } = services
  await signOut(auth)
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password)
    return await loadMembershipSession()
  } catch (error) {
    await signOut(auth)
    throw new Error(membershipError(error))
  }
}
/** Rebuild all club-scoped readers from the authenticated user's saved access. */
export async function loadMembershipSession(): Promise<MembershipReader> {
  const { auth, db } = getFirebaseServices()
  const user = auth.currentUser
  if (!user) throw new Error('Your session has ended. Sign in again.')
  const profile = await getDoc(doc(db, 'users', user.uid))
  const fields = profile.data()
  if (
    !profile.exists() ||
    !fields ||
    typeof fields.access !== 'string' ||
    !fields.access.trim() ||
    fields.access.includes('/')
  ) {
    throw new Error(
      'Your account has no valid CERMS club access. Contact your administrator; this app will not change your profile.',
    )
  }
  const access: string = fields.access
  const uid = user.uid
  let closed = false
  const cursors = new Map<string, { snapshot: QueryDocumentSnapshot; fingerprint: string }>()
  async function assertSession() {
    if (closed || auth.currentUser?.uid !== uid)
      throw new Error('Your session has ended. Sign in again.')
    const current = await getDoc(doc(db, 'users', uid))
    if (!current.exists() || current.data().access !== access)
      throw new Error('Your club access has changed. Sign out and sign in again.')
    if (closed) throw new Error('Your session has ended. Sign in again.')
  }
  return {
    uid,
    club: access,
    staffName: typeof fields.displayName === 'string' ? fields.displayName : 'CERMS staff',
    close() {
      closed = true
      cursors.clear()
    },
    async list(request: MembershipQuery) {
      await assertSession()
      const value = request.search.trim()
      if (value.length > 200) throw new Error('Please use a shorter search.')
      const constraints: QueryNonFilterConstraint[] = []
      const filters: (QueryFieldFilterConstraint | QueryCompositeFilterConstraint)[] = [
        where('access', '==', access),
      ]
      if (request.dnaOnly) filters.push(where('dna', '==', true))
      if (value) {
        if (request.field === 'name')
          filters.push(
            or(
              ...['fname', 'lname', 'name'].flatMap((field) =>
                nameVariants(value).map((variant) => where(field, '==', variant)),
              ),
            ),
          )
        else if (request.field === 'dob') filters.push(where('dob', 'in', dobVariants(value)))
        else if (request.field === 'number') {
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
            throw new Error('Enter a numeric CERMS membership number.')
          filters.push(where('id_number', 'in', [Number(value), value]))
        } else
          filters.push(where(request.field === 'id' ? 'idnum' : 'membership_type', '==', value))
      } else if (!request.dnaOnly) constraints.push(orderBy('creation_time', 'desc'))
      const fingerprint = JSON.stringify([value, request.field, request.dnaOnly])
      if (request.cursor) {
        const cursor = cursors.get(request.cursor)
        if (!cursor || cursor.fingerprint !== fingerprint)
          throw new Error('This page has expired. Refresh the member list.')
        constraints.push(startAfter(cursor.snapshot))
      }
      const result = await getDocs(
        query(collection(db, 'members'), and(...filters), ...constraints, limit(26)),
      )
      if (closed) throw new Error('Your session has ended. Sign in again.')
      const page = result.docs.slice(0, 25)
      const nextCursor = result.docs.length > 25 ? crypto.randomUUID() : null
      if (nextCursor) cursors.set(nextCursor, { snapshot: page[page.length - 1]!, fingerprint })
      return {
        members: page.map((record) => memberFromLegacy(record.id, record.data(), access)),
        nextCursor,
      }
    },
    async history(memberId) {
      await assertSession()
      if (!memberId || memberId.includes('/')) throw new Error('Invalid member ID.')
      const member = await getDoc(doc(db, 'members', memberId))
      if (!member.exists()) throw new Error('This member no longer exists.')
      assertAccess(member.data(), access)
      // Same equality filters as CERMS 4. No new composite indexes required.
      const [visits, orders] = await Promise.all([
        getDocs(
          query(
            collection(db, 'activity'),
            where('access', '==', access),
            where('memberID', '==', memberId),
            limit(51),
          ),
        ),
        getDocs(
          query(
            collection(db, 'orders'),
            where('access', '==', access),
            where('customerID', '==', memberId),
            limit(51),
          ),
        ),
      ])
      if (closed) throw new Error('Your session has ended. Sign in again.')
      return {
        visitsLimited: visits.size > 50,
        ordersLimited: orders.size > 50,
        visits: visits.docs.slice(0, 50).map((record) => {
          const data = record.data()
          assertAccess(data, access)
          const rental = Array.isArray(data.lockerRoomStatus) ? data.lockerRoomStatus : []
          return {
            id: record.id,
            enteredAt: timestampToMillis(data.timeIn),
            leftAt: timestampToMillis(data.timeOut),
            rental: typeof rental[2] === 'string' ? rental[2] : '—',
            location:
              typeof rental[1] === 'string' || typeof rental[1] === 'number'
                ? String(rental[1])
                : '—',
          }
        }),
        orders: orders.docs.slice(0, 50).map((record) => {
          const data = record.data()
          assertAccess(data, access)
          const tender = Array.isArray(data.paymentMethod) ? data.paymentMethod : []
          return {
            id: record.id,
            placedAt: timestampToMillis(data.timestamp),
            card: finiteNumber(tender[0]),
            giftCard: finiteNumber(tender[1]),
            cash: finiteNumber(tender[2]),
            total: Array.isArray(data.total) ? finiteNumber(data.total[2]) : null,
          }
        }),
      }
    },
  }
}

export async function disconnectMembership(): Promise<void> {
  if (services) await signOut(services.auth)
}

/** Only called after the user explicitly submits the forgot-password form. */
export async function requestPasswordReset(email: string): Promise<void> {
  services ??= createServices()
  try {
    await sendPasswordResetEmail(services.auth, email.trim())
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'auth/user-not-found'
    )
      return
    throw new Error(membershipError(error))
  }
}
