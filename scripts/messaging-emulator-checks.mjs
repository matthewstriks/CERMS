import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { staffMessaging } from '../functions/staff-messaging.mjs'
export async function messagingEmulatorChecks({ project, port }) {
  assert.equal(project, 'demo-cerms-rules')
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536)
  const require = createRequire(new URL('../functions/package.json', import.meta.url))
  const { initializeApp, deleteApp } = require('firebase-admin/app')
  const { getFirestore, FieldValue } = require('firebase-admin/firestore')
  const previousHost = process.env.FIRESTORE_EMULATOR_HOST
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + port
  const app = initializeApp({ projectId: project }, 'synthetic-messaging')
  const db = getFirestore(app, 'cerms')
  try {
    const business = 'messaging-emulator',
      alice = 'messaging-alice',
      bob = 'messaging-bob'
    await db.doc('system/' + business).set({ businessName: 'Synthetic messaging' })
    for (const uid of [alice, bob])
      await db.doc('users/' + uid).set({ uid, access: business, displayName: uid })
    const deps = {
      db,
      timestamp: () => FieldValue.serverTimestamp(),
      fail: (code, message) => {
        throw Object.assign(new Error(message), { code })
      },
    }
    const call = (action, data = {}, uid = alice) =>
      staffMessaging({ auth: { uid }, data: { business, action, ...data } }, deps)
    const { chatId } = await call('start', { recipients: [bob] })
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        call('send', {
          chatId,
          requestId: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          text: 'Concurrent ' + i,
        }),
      ),
    )
    const prefix = `system/${business}/staffChats/${chatId}`
    const chat = (await db.doc(prefix).get()).data(),
      messages = await db
        .collection(prefix + '/messages')
        .orderBy('sequence', 'asc')
        .get()
    assert.equal(chat.lastSequence, 6)
    assert.deepEqual(
      messages.docs.map((d) => d.data().sequence),
      [1, 2, 3, 4, 5, 6],
    )
    const newest = messages.docs.at(-1),
      oldest = messages.docs[0]
    assert.ok(newest.data().sentAt.toMillis())
    await Promise.all([
      call('read', { chatId, messageId: newest.id }, bob),
      call('read', { chatId, messageId: oldest.id }, bob),
    ])
    assert.equal((await db.doc(prefix).get()).data().readBy[bob].sequence, 6)
    const search = await call('search', { chatId, query: 'CONCURRENT', before: 4 })
    assert.deepEqual(
      search.messages.map((m) => m.sequence),
      [3, 2, 1],
    )
    const directory = await call('directory', { cursor: null })
    assert.deepEqual(directory.staff, [{ uid: bob, name: bob }])
    await call('send', { chatId, requestId: newest.id, text: newest.data().text })
    assert.equal((await db.doc(prefix).get()).data().lastSequence, 6)
    console.log(
      'Messaging emulator passed concurrent send/read transactions, real SDK history/search queries, timestamps and idempotent retries in isolated demo-cerms-rules.',
    )
  } finally {
    await db.terminate()
    await deleteApp(app)
    if (previousHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST
    else process.env.FIRESTORE_EMULATOR_HOST = previousHost
  }
}
