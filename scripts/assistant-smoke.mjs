// Focused CERMS Assistant flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-assistant-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'assistant-fixture', version: pkg.version, main: 'bootstrap.cjs' }),
)
await writeFile(
  join(dir, 'bootstrap.cjs'),
  `const {app}=require('electron');const original=app.setPath.bind(app);app.setPath=(name,value)=>original(name,name==='userData'?${JSON.stringify(join(dir, 'profile'))}:value);require(${JSON.stringify(resolve('out/main/index.js'))});`,
)
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
let app
const uid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
  club = 'fixture-club',
  base = 'projects/cerms-7af24/databases/cerms/documents',
  time = '2026-11-17T12:00:00Z'
const str = (stringValue) => ({ stringValue })
const documents = new Map([
  [
    base + '/users/' + uid,
    {
      name: base + '/users/' + uid,
      fields: {
        uid: str(uid),
        displayName: str('Synthetic Owner'),
        email: str('owner@example.test'),
        access: str(club),
      },
      createTime: time,
      updateTime: time,
    },
  ],
  [
    base + '/system/' + club,
    {
      name: base + '/system/' + club,
      fields: { businessName: str('Synthetic Club') },
      createTime: time,
      updateTime: time,
    },
  ],
])
const loginEmail = 'owner@example.test',
  verified = true
const token = () => {
  const now = Math.floor(Date.now() / 1000)
  return (
    'eyJhbGciOiJSUzI1NiJ9.' +
    Buffer.from(
      JSON.stringify({
        sub: uid,
        user_id: uid,
        email: loginEmail,
        email_verified: verified,
        aud: 'cerms-7af24',
        iss: 'https://securetoken.google.com/cerms-7af24',
        iat: now,
        exp: now + 3600,
        auth_time: now,
        firebase: { sign_in_provider: 'password' },
      }),
    ).toString('base64url') +
    '.fixture'
  )
}
try {
  app = await electron.launch({ args: [dir, '--mute-audio'], env, timeout: 20000 })
  const main = await app.firstWindow()
  main.setDefaultTimeout(15000)
  await app.evaluate(({ net, dialog, shell }) => {
    const f = (globalThis.assistantFixture = {
      runtime: false,
      installed: false,
      downloads: 0,
      deletes: [],
      chats: [],
      emails: [],
      reports: [],
      links: [],
      hold: true,
      reply: null,
      confirmation: 0,
    })
    const original = net.fetch.bind(net)
    net.fetch = async (url, options) => {
      if (String(url).startsWith('file:')) return original(url, options)
      if (url === 'https://us-central1-cerms-7af24.cloudfunctions.net/emailAiSupportConversation') {
        f.emails.push(JSON.parse(options.body).data)
        return new Response(JSON.stringify({ result: { status: 'sent' } }))
      }
      if (url === 'https://us-central1-cerms-7af24.cloudfunctions.net/submitBugReport') {
        const data = JSON.parse(options.body).data
        f.reports.push(data)
        return new Response(JSON.stringify({ result: { reportId: data.requestId } }))
      }
      throw Error('No real cloud requests in assistant check')
    }
    shell.openExternal = async (url) => {
      f.links.push(url)
    }
    dialog.showMessageBox = async (_parent, options) => {
      if (!options.title.includes('Remove CERMS Assistant')) throw Error('Unexpected native dialog')
      return { response: f.confirmation }
    }
    globalThis.fetch = async (url, options = {}) => {
      if (!String(url).startsWith('http://127.0.0.1:11434/api/'))
        throw Error('No external fetches in assistant check')
      if (!f.runtime) throw Error('Synthetic Ollama missing')
      if (String(url).endsWith('/tags'))
        return new Response(
          JSON.stringify({
            models: f.installed
              ? [{ name: 'qwen2.5:1.5b' }, { name: 'another-model:latest' }]
              : [{ name: 'another-model:latest' }],
          }),
        )
      if (String(url).endsWith('/pull')) {
        if (JSON.parse(options.body).model !== 'qwen2.5:1.5b') throw Error('Wrong model')
        f.downloads++
        f.installed = true
        return new Response(
          '{"status":"pulling","digest":"synthetic","total":100,"completed":50}\n{"status":"success"}\n',
        )
      }
      if (String(url).endsWith('/delete')) {
        if (options.method !== 'DELETE') throw Error('Wrong removal method')
        f.deletes.push(JSON.parse(options.body))
        f.installed = false
        return new Response(null, { status: 200 })
      }
      if (!String(url).endsWith('/chat')) throw Error('Unexpected Ollama operation')
      const body = JSON.parse(options.body)
      f.chats.push(body)
      const response = () =>
        new Response(
          JSON.stringify({
            done: true,
            message: {
              content:
                'Open the original receipt and choose Return / refund. See Returning items and recording a refund.',
            },
          }),
        )
      if (f.hold)
        return new Promise((resolve) => {
          f.reply = () => resolve(response())
        })
      return response()
    }
  })
  await app.context().route('cerms://app/assets/firebase-messaging-*.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: 'export function createMessaging(){return{subscribeUnreadCount(receive){receive(0);return()=>{}}}}',
    }),
  )
  await app.context().route('https://**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    const respond = (d) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) })
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if (url.pathname.endsWith(':signInWithPassword'))
        return respond({
          localId: uid,
          email: loginEmail,
          idToken: token(),
          refreshToken: 'synthetic',
          expiresIn: '3600',
        })
      if (url.pathname.endsWith(':lookup'))
        return respond({
          users: [
            {
              localId: uid,
              email: loginEmail,
              emailVerified: true,
              displayName: 'Synthetic Owner',
              providerUserInfo: [
                { providerId: 'password', email: loginEmail, federatedId: loginEmail },
              ],
            },
          ],
        })
    }
    if (url.hostname === 'firestore.googleapis.com') {
      if (url.pathname.includes('/Listen/')) {
        assert.equal(url.searchParams.get('database'), 'projects/cerms-7af24/databases/cerms')
        return route.abort()
      }
      assert.ok(url.pathname.startsWith('/v1/' + base))
      if (url.pathname.endsWith(':batchGet'))
        return respond(
          request
            .postDataJSON()
            .documents.map((name) =>
              documents.has(name)
                ? { found: documents.get(name) }
                : { missing: name, readTime: time },
            ),
        )
      if (url.pathname.endsWith(':runQuery')) return respond([])
      throw Error('No Firestore writes in assistant check')
    }
    return route.abort()
  })
  await main.getByLabel('Email', { exact: true }).fill(loginEmail)
  await main.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await main.evaluate(() => {
    location.hash = 'members'
  })
  await main.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(main.getByRole('button', { name: 'Report a bug', exact: true })).toBeVisible()
  await expect(main.getByRole('button', { name: 'CERMS Assistant', exact: true })).toBeVisible()
  let opening = app.waitForEvent('window')
  await main.getByRole('button', { name: 'CERMS Assistant', exact: true }).click()
  let assistant = await opening
  assistant.setDefaultTimeout(15000)
  await expect(
    assistant.getByRole('heading', { name: 'CERMS Assistant', exact: true }),
  ).toBeVisible()
  await expect(
    assistant.getByText('Chats may be monitored for quality assurance. Answers can be incorrect.', {
      exact: true,
    }),
  ).toBeVisible()
  await assistant.getByRole('button', { name: 'Download Ollama', exact: true }).click()
  assert.deepEqual(await app.evaluate(() => globalThis.assistantFixture.links), [
    'https://ollama.com/download/mac',
  ])
  await app.evaluate(() => {
    globalThis.assistantFixture.runtime = true
  })
  await assistant.getByRole('button', { name: 'I installed Ollama', exact: true }).click()
  await assistant.getByRole('button', { name: 'Download CERMS Assistant', exact: true }).click()
  await expect(assistant.getByLabel('Message CERMS Assistant', { exact: true })).toBeEnabled()
  await assistant
    .getByLabel('Message CERMS Assistant', { exact: true })
    .fill('How do I refund part of a sale?')
  await assistant.getByRole('button', { name: 'Send message', exact: true }).click()
  const thinking = assistant.getByRole('status', {
    name: 'CERMS Assistant is thinking',
    exact: true,
  })
  await expect(thinking).toBeVisible()
  await expect(assistant.locator('.assistant-message-user .assistant-bubble')).toHaveText(
    'How do I refund part of a sale?',
  )
  assert.ok((await assistant.locator('body').innerText()).includes('matthew@') === false)
  await assistant.screenshot({ path: '/private/tmp/cerms-assistant-thinking.png' })
  // Opening/sending a bug report must not cancel the independent in-flight chat.
  opening = app.waitForEvent('window')
  await main.getByRole('button', { name: 'Report a bug', exact: true }).click()
  const report = await opening
  await expect(report.getByRole('heading', { name: 'Report a bug', exact: true })).toBeVisible()
  assert.equal(await report.getByLabel('Message CERMS Assistant').count(), 0)
  const denied = await report.evaluate(() =>
    window.desktop.askAiSupport('print receipt').then(
      () => '',
      (e) => e.message,
    ),
  )
  assert.match(denied, /Untrusted/)
  await report.getByLabel('Subject', { exact: true }).fill('Synthetic independent report')
  await report
    .getByLabel('What happened?', { exact: true })
    .fill('Synthetic report; no real email.')
  await report.getByRole('button', { name: 'Send bug report', exact: true }).click()
  await expect(report.getByRole('heading', { name: 'Report sent', exact: true })).toBeVisible()
  await report.getByRole('button', { name: 'Done', exact: true }).click()
  assert.equal(await app.evaluate(() => globalThis.assistantFixture.emails.length), 0)
  await expect(thinking).toBeVisible()
  await app.evaluate(() => {
    const f = globalThis.assistantFixture
    f.hold = false
    f.reply()
  })
  await expect(
    assistant.locator('.assistant-message-assistant .assistant-message-text'),
  ).toContainText('Return / refund')
  await expect(thinking).toHaveCount(0)
  await assistant.screenshot({ path: '/private/tmp/cerms-assistant-chat.png' })
  await assistant.getByRole('button', { name: 'Finish chat', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.assistantFixture.emails.length)).toBe(1)
  let mail = await app.evaluate(() => globalThis.assistantFixture.emails[0])
  assert.deepEqual(mail.user, { uid, name: 'Synthetic Owner', email: loginEmail, business: club })
  assert.equal(mail.reason, 'end-button')
  assert.ok(
    !JSON.stringify(await app.evaluate(() => globalThis.assistantFixture.chats)).includes(
      loginEmail,
    ),
  )
  await assistant
    .getByLabel('Message CERMS Assistant', { exact: true })
    .fill('How do I print a receipt?')
  await assistant.getByLabel('Message CERMS Assistant', { exact: true }).press('Enter')
  await expect(
    assistant.locator('.assistant-message-assistant .assistant-message-text'),
  ).toBeVisible()
  await assistant.getByRole('button', { name: 'Close assistant', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.assistantFixture.emails.length)).toBe(2)
  await main.evaluate(() => {
    location.hash = 'settings'
  })
  const settings = main.getByRole('region', { name: 'CERMS Assistant', exact: true })
  await expect(settings.getByText('Local download installed.', { exact: true })).toBeVisible()
  await settings.getByRole('button', { name: 'Remove assistant download', exact: true }).click()
  await expect(
    settings.getByRole('button', { name: 'Remove assistant download', exact: true }),
  ).toBeEnabled()
  assert.equal(await app.evaluate(() => globalThis.assistantFixture.deletes.length), 0)
  await app.evaluate(() => {
    globalThis.assistantFixture.confirmation = 1
  })
  await settings.getByRole('button', { name: 'Remove assistant download', exact: true }).click()
  await expect(settings.getByText('Local download not installed.', { exact: true })).toBeVisible()
  assert.deepEqual(await app.evaluate(() => globalThis.assistantFixture.deletes), [
    { model: 'qwen2.5:1.5b' },
  ])
  opening = app.waitForEvent('window')
  await settings.getByRole('button', { name: 'Open CERMS Assistant', exact: true }).click()
  assistant = await opening
  await expect(
    assistant.getByRole('button', { name: 'Download CERMS Assistant', exact: true }),
  ).toBeVisible()
  await assistant.getByRole('button', { name: 'Download CERMS Assistant', exact: true }).click()
  await expect(assistant.getByLabel('Message CERMS Assistant', { exact: true })).toBeEnabled()
  await main.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect.poll(() => assistant.isClosed()).toBe(true)
  await expect(main.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  opening = app.waitForEvent('window')
  await main.getByRole('button', { name: 'CERMS Assistant', exact: true }).click()
  assistant = await opening
  await assistant
    .getByLabel('Message CERMS Assistant', { exact: true })
    .fill('How do I print a receipt?')
  await assistant.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(
    assistant.locator('.assistant-message-assistant .assistant-message-text'),
  ).toBeVisible()
  await assistant.getByRole('button', { name: 'Close assistant', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.assistantFixture.emails.length)).toBe(3)
  mail = await app.evaluate(() => globalThis.assistantFixture.emails.at(-1))
  assert.equal(mail.user, null)
  assert.equal(mail.reason, 'window-closed')
  console.log(
    'CERMS Assistant passed: separate chat/bug windows, branded setup, message/thinking bubbles, report independence, chat-start user and signed-out email identity, confirmed fixed-model removal/cancel/redownload, and trusted-window IPC. All model/Firebase/email effects mocked.',
  )
} finally {
  await app?.close()
  await rm(dir, { recursive: true, force: true })
}
