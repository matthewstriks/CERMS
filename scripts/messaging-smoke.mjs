import { audioFixture } from './fixtures/audio.mjs'
import { saveNotificationSoundPreference } from '../functions/notification-sounds.mjs'
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { staffMessaging } from '../functions/staff-messaging.mjs'
import { posFixture, owner as uid, business } from './fixtures/pos-server.mjs'
const soundsSmoke = process.argv.includes('--sounds')
let failSoundSave = false
const soundBodies = []
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
const app = await electron.launch({ args: ['.', '--mute-audio'], env, timeout: 20000 }),
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
    if (
      url.hostname === 'us-central1-cerms-7af24.cloudfunctions.net' &&
      url.pathname === '/saveNotificationSoundPreference'
    ) {
      const data = req.postDataJSON().data
      soundBodies.push(data)
      if (failSoundSave) {
        failSoundSave = false
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Synthetic sound save failure' } }),
        })
      }
      return respond({
        result: await saveNotificationSoundPreference({ auth: { uid }, data }, fixture.deps),
      })
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
  await page.addInitScript(audioFixture)
  await page.evaluate(audioFixture)
  page.setDefaultTimeout(15000)
  page.on('pageerror', (e) => errors.push(e.message))
  await publish()
  await page.getByLabel('Email', { exact: true }).fill('matthew@striks.com')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const badge = page.locator('.nav-unread-badge')
  await expect(badge).toHaveAttribute('title', '105 unread messages')
  await expect(badge.locator('[aria-hidden="true"]')).toHaveText('99+')
  if (soundsSmoke) {
    const notes = () => page.evaluate(() => window.__audioFixture.notes.length)
    const setVolume = (value) =>
      settings.getByLabel('Notification volume', { exact: true }).evaluate((node, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
          node,
          String(value),
        )
        node.dispatchEvent(new Event('input', { bubbles: true }))
      }, value)
    assert.equal(await notes(), 0, 'Historical unread messages do not play sounds at startup')
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('region', { name: 'Notification sounds', exact: true })
    await expect(settings.getByLabel('Enable notification sounds', { exact: true })).toBeChecked()
    await expect(settings.getByLabel('Notification volume', { exact: true })).toHaveValue('100')
    const incoming = async (text) => {
      await call('send', { chatId: directId, requestId: crypto.randomUUID(), text }, 'alice')
      await publish()
    }
    await incoming('New message while Settings is open')
    await expect.poll(notes).toBe(2)
    await publish()
    assert.equal(await notes(), 2, 'Repeated snapshot does not beep again')
    await call('send', {
      chatId: directId,
      requestId: crypto.randomUUID(),
      text: 'Own outgoing message',
    })
    await publish()
    assert.equal(await notes(), 2, 'Outgoing messages do not beep')
    await page.waitForTimeout(800)
    await settings.getByLabel('Enable notification sounds', { exact: true }).uncheck()
    await setVolume(25)
    await settings.getByRole('button', { name: 'Test sound', exact: true }).click()
    await expect.poll(notes).toBe(4)
    assert.equal(await page.evaluate(() => window.__audioFixture.levels.at(-1)), 0.009375)
    assert.equal(soundBodies.length, 0, 'Test and unsaved controls never save a profile')
    const before = structuredClone(docs.get('users/' + uid))
    await settings.getByRole('button', { name: 'Save sound preferences', exact: true }).click()
    await expect(
      settings.getByRole('status', { name: 'Sound preference status', exact: true }),
    ).toContainText('saved')
    assert.deepEqual(docs.get('users/' + uid), {
      ...before,
      notificationSoundPreference: { enabled: false, volume: 25 },
    })
    await page.waitForTimeout(800)
    await incoming('Muted incoming message')
    await page.evaluate(() => {
      const node = document.createElement('div')
      node.id = 'sound-test-alert'
      node.setAttribute('role', 'alert')
      node.textContent = 'Muted popup warning'
      document.body.append(node)
    })
    await page.waitForTimeout(100)
    assert.equal(await notes(), 4)
    await settings.getByRole('button', { name: 'Test sound', exact: true }).click()
    await expect.poll(notes).toBe(6)
    await settings.getByLabel('Enable notification sounds', { exact: true }).check()
    await setVolume(80)
    failSoundSave = true
    await settings.getByRole('button', { name: 'Save sound preferences', exact: true }).click()
    await expect(settings.getByRole('alert')).toContainText('Synthetic sound save failure')
    assert.deepEqual(docs.get('users/' + uid).notificationSoundPreference, {
      enabled: false,
      volume: 25,
    })
    await settings.getByRole('button', { name: 'Save sound preferences', exact: true }).click()
    await expect(
      settings.getByRole('status', { name: 'Sound preference status', exact: true }),
    ).toContainText('saved')
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      document.getElementById('sound-test-alert').textContent = 'New popup warning'
    })
    await expect.poll(notes).toBe(8)
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      const node = document.createElement('p')
      node.setAttribute('role', 'status')
      node.textContent = 'Loading records'
      document.body.append(node)
    })
    assert.equal(await notes(), 8, 'Loading indicators are silent')
    await page.evaluate(() => {
      const node = document.createElement('aside')
      node.id = 'sound-progress-fixture'
      node.setAttribute('data-notification-sound', 'update:downloading:synthetic')
      node.textContent = 'Downloading 10%'
      document.body.append(node)
    })
    await expect.poll(notes).toBe(10)
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      document.getElementById('sound-progress-fixture').textContent = 'Downloading 75%'
    })
    await page.waitForTimeout(100)
    assert.equal(await notes(), 10, 'Download progress does not replay a notification key')
    await setVolume(0)
    await settings.getByRole('button', { name: 'Save sound preferences', exact: true }).click()
    await expect(
      settings.getByRole('status', { name: 'Sound preference status', exact: true }),
    ).toContainText('saved')
    await expect(settings.getByRole('button', { name: 'Test sound', exact: true })).toBeDisabled()
    await incoming('Zero-volume message')
    assert.equal(await notes(), 10)
    await setVolume(65)
    await settings.getByRole('button', { name: 'Save sound preferences', exact: true }).click()
    await expect(
      settings.getByRole('status', { name: 'Sound preference status', exact: true }),
    ).toContainText('saved')
    await page.getByRole('link', { name: 'Overview', exact: true }).click()
    await incoming('Message on another screen')
    await expect.poll(notes).toBe(12)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('matthew@striks.com')
    await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(settings.getByLabel('Notification volume', { exact: true })).toHaveValue('65')
    await expect(settings.getByLabel('Enable notification sounds', { exact: true })).toBeChecked()
    assert.equal(await notes(), 12, 'Signing in does not replay historical notifications')
    await mkdir('artifacts', { recursive: true })
    await page.screenshot({ path: 'artifacts/notification-sounds-settings.png' })
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await page.screenshot({ path: 'artifacts/notification-sounds-settings-dark.png' })
    assert.equal(soundBodies.length, 5, 'Only deliberate saves called the preference service')
    assert.deepEqual(errors, [])
    console.log(
      'Notification sounds passed: new incoming messages across screens, silent history/outgoing/repeated snapshots, popup sounds, mute/zero/volume, explicit test, save failure/retry and account persistence. Audio mocked; all HTTPS intercepted.',
    )
  } else {
    await page.getByRole('link', { name: /^Messages/ }).click()
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
    await expect(
      page.getByRole('button', { name: 'Retry same message', exact: true }),
    ).toBeEnabled()
    await page.getByRole('button', { name: 'Retry same message', exact: true }).click()
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
    assert.equal(sendBodies[0].requestId, sendBodies[1].requestId)
    assert.equal(docs.get(directPath).lastSequence, 106)
    await expect(page.locator('.nav-unread-badge')).toHaveCount(0)
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
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
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
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
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
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'Unsent conversation draft',
    )
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
  }
} finally {
  await app.close()
}
