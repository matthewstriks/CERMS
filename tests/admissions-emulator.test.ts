import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import {
  collection,
  doc,
  initializeFirestore,
  setDoc,
  updateDoc,
  deleteDoc,
  terminate,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { AdmissionsState } from '../src/domain/admissions'

// Explicit opt-in. Uses a separate demo project and ONLY a local emulator.
const fixture = vi.hoisted(() => ({
  app: undefined as FirebaseApp | undefined,
  databases: [] as Firestore[],
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({
    auth: { currentUser: { uid: 'fixture-staff' }, app: fixture.app },
  }),
}))
vi.mock('firebase/auth', () => ({ onAuthStateChanged: () => () => {} }))
vi.mock('firebase/firestore', async (original) => {
  const sdk = await original<typeof import('firebase/firestore')>()
  return {
    ...sdk,
    initializeFirestore: (app: FirebaseApp, settings: any, databaseId?: string) => {
      const port = Number(process.env.CERMS_ADMISSIONS_EMULATOR_PORT)
      if (
        app.options.projectId !== 'demo-cerms-admissions' ||
        !Number.isInteger(port) ||
        port < 1024 ||
        port > 65535
      )
        throw new Error('Local demo emulator configuration required')
      const db = sdk.initializeFirestore(app, settings, databaseId)
      sdk.connectFirestoreEmulator(db, '127.0.0.1', port)
      fixture.databases.push(db)
      return db
    },
  }
})
import { subscribeAdmissions } from '../src/data/firebase-admissions'

describe.skipIf(!process.env.CERMS_ADMISSIONS_EMULATOR_PORT)(
  'real Firestore admissions stream against local synthetic data',
  () => {
    let writer: Firestore
    let writerApp: FirebaseApp
    let state: AdmissionsState
    let stop: (() => void) | undefined
    beforeAll(() => {
      fixture.app = initializeApp(
        { projectId: 'demo-cerms-admissions', apiKey: 'fixture-only' },
        'admissions-reader',
      )
      writerApp = initializeApp(
        { projectId: 'demo-cerms-admissions', apiKey: 'fixture-only' },
        'admissions-writer',
      )
      writer = initializeFirestore(writerApp, {}, 'cerms')
    })
    afterAll(async () => {
      stop?.()
      await Promise.all(fixture.databases.map((db) => terminate(db)))
      await Promise.all([deleteApp(writerApp), deleteApp(fixture.app!)])
    })
    it('receives real server snapshots for additions, member edits, rental changes, checkouts, and access revocation', async () => {
      const profile = doc(writer, 'users', 'fixture-staff')
      const member = doc(writer, 'members', 'fixture-member')
      const visit = doc(collection(writer, 'activity'), 'fixture-visit')
      await setDoc(profile, { access: 'fixture-club' })
      await setDoc(member, { access: 'fixture-club', name: 'Fixture guest', id_number: 101 })
      stop = subscribeAdmissions({ uid: 'fixture-staff', club: 'fixture-club' }, (next) => {
        state = next
      })
      await expect.poll(() => state?.status, { timeout: 15000 }).toBe('live')
      expect(state.rows).toHaveLength(0)
      await setDoc(visit, {
        access: 'fixture-club',
        active: true,
        memberID: 'fixture-member',
        currIn: true,
        waitlist: false,
        lockerRoomStatus: [true, '12', 'Locker', 'fixture-staff', 100, 200],
      })
      await expect.poll(() => state?.rows[0]?.memberName).toBe('Fixture guest')
      await updateDoc(member, { name: 'Updated guest' })
      await expect.poll(() => state?.rows[0]?.memberName).toBe('Updated guest')
      await updateDoc(visit, { notes: 'Changed in another client', waitlist: true })
      await expect.poll(() => state?.rows[0]?.notes).toBe('Changed in another client')
      expect(state.rows[0]?.waiting).toBe(true)
      await updateDoc(visit, { goingInactive: true })
      await expect.poll(() => state?.rows.length).toBe(0)
      await updateDoc(visit, { goingInactive: false })
      await expect.poll(() => state?.rows.length).toBe(1)
      await deleteDoc(visit)
      await expect.poll(() => state?.rows.length).toBe(0)
      await updateDoc(profile, { access: 'other-club' })
      await expect.poll(() => state?.status).toBe('error')
      expect(state.rows).toEqual([])
    }, 30000)
  },
)
