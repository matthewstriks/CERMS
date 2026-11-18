// Focused help-article integration flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-help-articles-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({
    name: 'help-articles-fixture',
    version: pkg.version,
    main: 'bootstrap.cjs',
  }),
)
await writeFile(
  join(dir, 'bootstrap.cjs'),
  `const {app}=require('electron');const original=app.setPath.bind(app);app.setPath=(name,value)=>original(name,name==='userData'?${JSON.stringify(join(dir, 'profile'))}:value);require(${JSON.stringify(resolve('out/main/index.js'))});`,
)
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
let app
try {
  app = await electron.launch({ args: [dir, '--mute-audio'], env, timeout: 20000 })
  const main = await app.firstWindow()
  await app.context().route('https://**/*', (route) => route.abort())
  await app.evaluate(({ net }) => {
    const original = net.fetch.bind(net)
    globalThis.helpFixture = { chats: [], evaluationEmails: 0 }
    net.fetch = async (url, options) => {
      if (String(url).startsWith('file:')) return original(url, options)
      if (url === 'https://us-central1-cerms-7af24.cloudfunctions.net/emailAiSupportConversation') {
        globalThis.helpFixture.evaluationEmails++
        return new Response(JSON.stringify({ result: { status: 'sent' } }))
      }
      throw Error('Unexpected cloud request in isolated help check')
    }
    globalThis.fetch = async (url, options = {}) => {
      if (url === 'http://127.0.0.1:11434/api/tags')
        return new Response(JSON.stringify({ models: [{ name: 'qwen2.5:1.5b' }] }))
      if (url !== 'http://127.0.0.1:11434/api/chat')
        throw Error('No external requests or model downloads in help check')
      const body = JSON.parse(options.body)
      globalThis.helpFixture.chats.push(body)
      const duplicate = body.messages.at(-1).content.includes('duplicate')
      return new Response(
        JSON.stringify({
          done: true,
          message: {
            content: duplicate
              ? 'Review the matching member and choose Use existing member. See Reviewing a possible duplicate member.'
              : 'Open the original receipt and choose Return / refund. See Returning items and recording a refund.',
          },
        }),
      )
    }
  })
  await main.getByLabel('Email', { exact: true }).fill('synthetic@example.test')
  const opening = app.waitForEvent('window')
  await main.getByRole('button', { name: 'CERMS Assistant', exact: true }).click()
  const support = await opening
  await expect(support.getByLabel('Message CERMS Assistant', { exact: true })).toBeVisible()
  await support
    .getByLabel('Message CERMS Assistant', { exact: true })
    .fill('How do I refund part of a sale?')
  await support.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(
    support.getByText(
      'Open the original receipt and choose Return / refund. See Returning items and recording a refund.',
      { exact: true },
    ),
  ).toBeVisible()
  await support.getByText('Help articles · 3', { exact: true }).last().click()
  const article = support
    .locator('.assistant-sources > section')
    .filter({ has: support.getByText('Returning items and recording a refund', { exact: true }) })
    .first()
  await expect(article).toContainText('Restock returned items')
  await expect(article).toContainText('Process returns and refunds')
  assert.equal(
    await article.locator('p').evaluate((el) => getComputedStyle(el).whiteSpace),
    'pre-wrap',
  )
  assert.match(await article.locator('p').innerText(), /Steps\n\n1\./)
  await support
    .getByLabel('Message CERMS Assistant', { exact: true })
    .fill('Member may already exist: how do I use the duplicate?')
  await support.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(
    support.getByText(
      'Review the matching member and choose Use existing member. See Reviewing a possible duplicate member.',
      { exact: true },
    ),
  ).toBeVisible()
  await support.getByText('Help articles · 3', { exact: true }).last().click()
  await expect(support.locator('.assistant-sources').last()).toContainText(
    'I checked the matches. This is a different person',
  )
  const chats = await app.evaluate(() => globalThis.helpFixture.chats)
  assert.equal(chats.length, 2)
  assert.ok(chats[0].messages[0].content.includes('Returning items and recording a refund'))
  assert.ok(chats[1].messages[0].content.includes('Reviewing a possible duplicate member'))
  assert.ok(!JSON.stringify(chats).includes('synthetic@example.test'))
  assert.ok(
    chats.every((chat) => chat.model === 'qwen2.5:1.5b' && chat.messages[0].content.length < 7500),
  )
  assert.ok(
    !chats[0].messages[0].content.includes(
      'Refunds, returns and voiding a completed sale are not available',
    ),
  )
  await support.getByRole('button', { name: 'Finish chat', exact: true }).click()
  await expect(support.getByLabel('CERMS Assistant conversation')).toHaveCount(0)
  console.log(
    'Help documentation desktop passed: bundled refund and duplicate guides reach local-model prompts, topic changes retrieve new guides, expanded full steps retain line breaks, no private staff context or cloud/model effects. All requests mocked in a disposable profile.',
  )
} finally {
  await app?.close()
  await rm(dir, { recursive: true, force: true })
}
