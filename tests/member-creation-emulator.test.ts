import { afterAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  setDoc,
  terminate,
} from 'firebase/firestore/lite'
import {
  createEmulatorMemberCreator,
  assertMemberLabTarget,
  MEMBER_LAB_PROJECT,
} from '../src/data/emulator-member-creator'
import { emptyMemberDraft } from '../src/domain/member-creation'
import { memberFromLegacy } from '../src/domain/legacy'

describe.skipIf(!process.env.CERMS_MEMBER_EMULATOR_PORT)(
  'member creation in isolated Firestore emulator',
  () => {
    const port = Number(process.env.CERMS_MEMBER_EMULATOR_PORT)
    let creator: ReturnType<typeof createEmulatorMemberCreator>
    let app: ReturnType<typeof initializeApp>
    let db: ReturnType<typeof initializeFirestore>
    const draft = (id: string) => ({
      ...emptyMemberDraft(),
      firstName: 'Synthetic',
      lastName: 'Guest',
      birthDate: '1990-01-02',
      governmentId: id,
      membershipProductId: 'annual',
    })
    afterAll(async () => {
      if (creator) await creator.close()
      if (db) await terminate(db)
      if (app) await deleteApp(app)
    })
    it('creates readable legacy records, supports retry, rejects duplicates and reserves IDs atomically', async () => {
      assertMemberLabTarget(MEMBER_LAB_PROJECT, '127.0.0.1', port)
      creator = createEmulatorMemberCreator(port)
      app = initializeApp(
        { projectId: MEMBER_LAB_PROJECT, apiKey: 'fixture-only' },
        'member-lab-inspection',
      )
      db = initializeFirestore(app, { host: `127.0.0.1:${port}`, ssl: false })
      expect(await creator.options()).toHaveLength(3)
      const request = crypto.randomUUID()
      const result = await creator.create(draft('FAKE-A'), request)
      expect(await creator.create(draft('FAKE-A'), request)).toEqual(result)
      const record = (await getDoc(doc(db, 'members', result.id))).data()!
      expect(record.creation_time.toMillis()).toBeGreaterThan(0)
      expect(memberFromLegacy(result.id, record, 'fixture-club')).toMatchObject({
        name: 'Synthetic Guest',
        number: String(result.number),
        membership: 'Annual membership',
        waiver: false,
      })
      await expect(creator.create(draft('FAKE-A'), crypto.randomUUID())).rejects.toThrow(
        'already exists',
      )
      await expect(
        creator.create({ ...draft('FAKE-A'), firstName: 'Changed' }, request),
      ).rejects.toThrow('different details')
      expect((await getDoc(doc(db, 'members', result.id))).data()).toEqual(record)
      const simultaneous = await Promise.allSettled(
        ['B', 'C'].map((id) =>
          creator.create(
            {
              ...draft(`FAKE-${id}`),
              importExisting: true,
              membershipNumber: '555555',
              createdDate: '2020-01-01',
              expiresDate: '2021-01-01',
            },
            crypto.randomUUID(),
          ),
        ),
      )
      expect(simultaneous.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const identities = await Promise.allSettled(
        [1, 2].map(() => creator.create(draft('FAKE-D'), crypto.randomUUID())),
      )
      expect(identities.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      // A legacy record has no claims and may store its number as a string.
      await setDoc(doc(db, 'members', 'legacy-fixture'), {
        access: 'fixture-club',
        dob: '1980-01-01',
        idnum: 'OLD',
        id_number: '444444',
      })
      await expect(
        creator.create(
          { ...draft('FAKE-E'), importExisting: true, membershipNumber: '444444' },
          crypto.randomUUID(),
        ),
      ).rejects.toThrow('already in use')
      await expect(
        creator.create({ ...draft('OLD'), birthDate: '1980-01-01' }, crypto.randomUUID()),
      ).rejects.toThrow('already exists')
      expect((await getDocs(collection(db, 'members'))).size).toBe(4)
      expect((await getDocs(collection(db, 'orders'))).empty).toBe(true)
      expect((await getDocs(collection(db, 'system'))).empty).toBe(true)
    }, 30000)
  },
)
