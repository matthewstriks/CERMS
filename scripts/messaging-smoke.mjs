import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { staffMessaging } from '../functions/staff-messaging.mjs'
import { posFixture, owner as uid, business } from './fixtures/pos-server.mjs'
const fixture = posFixture(),
  docs = fixture.docs,
  base = 'projects/cerms-7af24/databases/cerms/documents'
let tick = Date.now()
fixture.deps.timestamp = () => ({ timestampValue: new Date(++tick).toISOString() })
for (const [id, name] of [
  ['alice', 'Alice Staff'],
  ['bob', 'Bob Staff'],
  ['z-taylor', 'Taylor Staff'],
  ['foreign', 'Foreign Staff'],
])
  docs.set('users/' + id, {
    uid: id,
    displayName: name,
    access: id === 'foreign' ? 'other' : business,
  })
for (let i = 0; i < 55; i++) {
  const id = 'directory-' + String(i).padStart(3, '0')
  docs.set('users/' + id, { uid: id, displayName: 'Sample Staff ' + i, access: business })
}
const call = (action, data = {}, actor = uid) =>
  staffMessaging({ auth: { uid: actor }, data: { business, action, ...data } }, fixture.deps)
const { chatId: directId } = await call('start', { recipients: ['alice'] })
const directPath = `system/${business}/staffChats/${directId}`
for (let i = 1; i <= 105; i++) {
  const id = String(i).padStart(8, '0') + '-0000-4000-8000-000000000001'
  docs.set(`${directPath}/messages/${id}`, {
    sequence: i,
    text: i === 1 ? 'Opening checklist from last month' : 'Historical message ' + i,
    senderUid: 'alice',
    senderName: 'Alice Staff',
    sentAt: { timestampValue: new Date(tick - 86400000 + i * 1000).toISOString() },
  })
}
Object.assign(docs.get(directPath), {
  lastSequence: 105,
  lastMessage: { ...docs.get(`${directPath}/messages/00000105-0000-4000-8000-000000000001`) },
})
const encode = (v) =>
  v === null
    ? { nullValue: null }
    : typeof v === 'string'
      ? { stringValue: v }
      : typeof v === 'boolean'
        ? { booleanValue: v }
        : typeof v === 'number'
          ? { integerValue: String(v) }
          : v.timestampValue
            ? v
            : Array.isArray(v)
              ? { arrayValue: { values: v.map(encode) } }
              : {
                  mapValue: {
                    fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])),
                  },
                }
const document = (p) => ({
  name: base + '/' + p,
  fields: Object.fromEntries(Object.entries(docs.get(p)).map(([k, v]) => [k, encode(v)])),
  createTime: new Date(tick).toISOString(),
  updateTime: new Date(tick).toISOString(),
})
function snapshot() {
  const millis = (t) => (t?.timestampValue ? Date.parse(t.timestampValue) : null)
  const chats = [...docs]
    .filter(([p]) => p.startsWith(`system/${business}/staffChats/`) && !p.includes('/messages/'))
    .map(([p, c]) => ({
      ...c,
      id: p.split('/').at(-1),
      updatedAt: millis(c.updatedAt),
      lastMessage: c.lastMessage
        ? { ...c.lastMessage, sentAt: millis(c.lastMessage.sentAt) }
        : null,
      readBy: Object.fromEntries(
        Object.entries(c.readBy).map(([k, v]) => [k, { ...v, readAt: millis(v.readAt) }]),
      ),
    }))
    .filter((c) => c.participantUids.includes(uid))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const messages = Object.fromEntries(
    chats.map((c) => [
      c.id,
      [...docs]
        .filter(([p]) => p.startsWith(`system/${business}/staffChats/${c.id}/messages/`))
        .map(([p, m]) => ({ ...m, id: p.split('/').at(-1), sentAt: millis(m.sentAt) }))
        .sort((a, b) => a.sequence - b.sequence),
    ]),
  )
  return { chats, messages }
}
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 20000 }),
  errors = []
let page,
  dropSend = true,
  sendBodies = [],
  directoryCalls = 0
const publish = async () =>
  page.evaluate((state) => {
    window.__messagingFixture = state
    window.dispatchEvent(new Event('messaging-fixture'))
  }, snapshot())
try {
  const adapter = await readFile(
    new URL('./fixtures/messaging-module.mjs', import.meta.url),
    'utf8',
  )
  const admissions = await readFile(
    new URL('./fixtures/admissions-module.mjs', import.meta.url),
    'utf8',
  )
  await app
    .context()
    .route('cerms://app/assets/firebase-messaging-*.js', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: adapter }),
    )
  await app
    .context()
    .route('cerms://app/assets/firebase-admissions-*.js', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: admissions }),
    )
  await app.context().route('https://**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      respond = (p) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(p) })
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if (url.pathname.endsWith(':signInWithPassword')) {
        const now = Math.floor(Date.now() / 1000),
          payload = Buffer.from(
            JSON.stringify({
              sub: uid,
              user_id: uid,
              aud: 'cerms-7af24',
              iss: 'https://securetoken.google.com/cerms-7af24',
              iat: now,
              exp: now + 3600,
              auth_time: now,
              firebase: { sign_in_provider: 'password' },
            }),
          ).toString('base64url')
        return respond({
          localId: uid,
          email: 'matthew@striks.com',
          idToken: `eyJhbGciOiJSUzI1NiJ9.${payload}.fixture`,
          refreshToken: 'fixture-only',
          expiresIn: '3600',
        })
      }
      if (url.pathname.endsWith(':lookup'))
        return respond({
          users: [
            {
              localId: uid,
              email: 'matthew@striks.com',
              emailVerified: true,
              displayName: 'Matthew Test Striks',
              providerUserInfo: [
                {
                  providerId: 'password',
                  email: 'matthew@striks.com',
                  federatedId: 'matthew@striks.com',
                },
              ],
            },
          ],
        })
    }
    if (
      url.hostname === 'us-central1-cerms-7af24.cloudfunctions.net' &&
      url.pathname === '/staffMessaging'
    ) {
      const d = req.postDataJSON().data
      try {
        if (d.action === 'send') sendBodies.push(d)
        if (d.action === 'directory') directoryCalls++
        const result = await staffMessaging({ auth: { uid }, data: d }, fixture.deps)
        if (d.action !== 'directory' && d.action !== 'search') await publish()
        if (d.action === 'send' && dropSend) {
          dropSend = false
          return route.abort('failed')
        }
        return respond({ result })
      } catch (e) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              status: String(e.code ?? 'invalid-argument')
                .replaceAll('-', '_')
                .toUpperCase(),
              message: e.message,
            },
          }),
        })
      }
    }
    if (url.hostname === 'firestore.googleapis.com') {
      assert.ok(url.pathname.startsWith('/v1/' + base), 'Only named cerms reads')
      const d = req.postDataJSON()
      if (url.pathname.endsWith(':batchGet'))
        return respond(
          d.documents.map((name) => {
            const p = name.slice(base.length + 1)
            return docs.has(p)
              ? { found: document(p) }
              : { missing: name, readTime: new Date(tick).toISOString() }
          }),
        )
      if (url.pathname.endsWith(':runQuery'))
        return respond(
          [...docs.keys()]
            .filter((p) => p.startsWith('system/') && p.split('/').length === 2)
            .map((p) => ({ document: document(p) })),
        )
    }
    errors.push('Unexpected network request ' + url.hostname + url.pathname)
    return route.abort()
  })
  page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (e) => errors.push(e.message))
  await publish()
  await page.getByLabel('Email', { exact: true }).fill('matthew@striks.com')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Messages', exact: true }).click()
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  let picker = page.getByRole('dialog', { name: 'New staff conversation' })
  await picker.getByLabel('Search staff', { exact: true }).fill('Taylor')
  await expect(picker.getByText('Taylor Staff', { exact: true })).toBeVisible()
  assert.ok(directoryCalls >= 2, 'Directory search includes every staff page')
  await expect(picker.getByText('Foreign Staff', { exact: true })).toHaveCount(0)
  await picker.getByLabel('Search staff', { exact: true }).fill('Alice')
  await picker.getByRole('checkbox').check()
  await picker.getByRole('button', { name: 'Open conversation', exact: true }).click()
  const history = page.getByLabel('Chat history', { exact: true })
  await expect(history.getByText('Historical message 105', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Load older messages', exact: true }).click()
  await history.getByText('Historical message 6', { exact: true }).scrollIntoViewIfNeeded()
  await expect(history.getByText('Historical message 6', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Load older messages', exact: true }).click()
  await expect(
    history.getByText('Opening checklist from last month', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Latest messages', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('Please confirm the closing count.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry same message', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Retry same message', exact: true }).click()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
  assert.equal(sendBodies[0].requestId, sendBodies[1].requestId)
  assert.equal(docs.get(directPath).lastSequence, 106)
  const sentId = sendBodies[0].requestId
  await call('read', { chatId: directId, messageId: sentId }, 'alice')
  await publish()
  const outgoing = page
    .locator('article.chat-message')
    .filter({ hasText: 'Please confirm the closing count.' })
  await expect(outgoing.getByText('Read', { exact: true })).toBeVisible()
  await outgoing.locator('summary').click()
  await expect(outgoing).toContainText('Alice Staff')
  await expect(outgoing.locator('time')).toBeVisible()
  await expect.poll(() => docs.get(directPath).readBy[uid]?.sequence).toBe(106)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const incomingId = '22222222-2222-4222-8222-222222222222'
  await call(
    'send',
    { chatId: directId, requestId: incomingId, text: 'Closing count confirmed.' },
    'alice',
  )
  await publish()
  await page.waitForTimeout(650)
  assert.equal(
    docs.get(directPath).readBy[uid].sequence,
    106,
    'Hidden conversation must not mark incoming messages read',
  )
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => docs.get(directPath).readBy[uid]?.sequence).toBe(107)
  await page.getByLabel('Search this conversation', { exact: true }).fill('opening checklist')
  await page.getByRole('button', { name: 'Search messages', exact: true }).click()
  await page.getByRole('button', { name: 'Search older history', exact: true }).click()
  await expect(page.getByLabel('Message search results', { exact: true })).toContainText(
    'Opening checklist from last month',
  )
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  picker = page.getByRole('dialog', { name: 'New staff conversation' })
  await picker.getByLabel('Search staff', { exact: true }).fill('Alice')
  await picker.getByRole('checkbox').check()
  await picker.getByLabel('Search staff', { exact: true }).fill('Bob')
  await picker.getByRole('checkbox').check()
  await picker.getByRole('button', { name: 'Open conversation', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Alice Staff, Bob Staff', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Message', { exact: true }).fill('Team handoff for tonight.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
  const groupId = (await call('start', { recipients: ['alice', 'bob'] })).chatId,
    groupSend = sendBodies.at(-1)
  await call('read', { chatId: groupId, messageId: groupSend.requestId }, 'bob')
  await publish()
  await expect(page.getByText('Read by 1 of 2', { exact: true })).toBeVisible()
  await call(
    'send',
    {
      chatId: directId,
      requestId: '33333333-3333-4333-8333-333333333333',
      text: 'One more question.',
    },
    'alice',
  )
  await publish()
  const direct = page.getByRole('button', {
    name: 'Open conversation with Alice Staff',
    exact: true,
  })
  await expect(direct).toContainText('Unread')
  assert.equal(docs.get(directPath).readBy[uid].sequence, 107)
  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  await direct.click()
  await expect.poll(() => docs.get(directPath).readBy[uid]?.sequence).toBe(108)
  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('Unsent conversation draft')
  await page
    .getByRole('button', { name: 'Open conversation with Alice Staff, Bob Staff', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Open conversation with Alice Staff', exact: true })
    .click()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Unsent conversation draft')
  await page.getByLabel('Message', { exact: true }).fill('')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900))
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeInViewport()
  await expect(
    page
      .getByLabel('Chat history', { exact: true })
      .getByText('One more question.', { exact: true }),
  ).toBeInViewport()
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/staff-messaging.png' })
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await page.screenshot({ path: 'artifacts/staff-messaging-dark.png' })
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light'
  })
  assert.deepEqual(errors, [])
  console.log(
    'Staff messaging passed: complete staff search, private direct/group chats, older history, server history search, send retry, timestamps, per-staff receipts, hidden-window read protection and unread navigation. All HTTPS intercepted; no real messages sent.',
  )
} finally {
  await app.close()
}
