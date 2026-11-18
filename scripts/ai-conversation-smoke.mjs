// Isolated local profile and mocked delivery: no real model, email, profile or cloud writes.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-ai-email-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'cerms-ai-email-fixture', version: pkg.version, main: 'bootstrap.cjs' }),
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
    globalThis.aiEmailFixture = { posts: [], offline: false }
    globalThis.fetch = async (url) => {
      if (String(url) === 'http://127.0.0.1:11434/api/tags')
        return new Response(JSON.stringify({ models: [{ name: 'qwen2.5:1.5b' }] }))
      if (String(url) === 'http://127.0.0.1:11434/api/chat')
        return new Response(
          JSON.stringify({
            done: true,
            message: { content: 'Open a saved receipt and choose Print.' },
          }),
        )
      throw Error('Unexpected AI request')
    }
    const original = net.fetch.bind(net)
    net.fetch = async (url, options) => {
      if (String(url).startsWith('file:')) return original(url, options)
      if (url !== 'https://us-central1-cerms-7af24.cloudfunctions.net/emailAiSupportConversation')
        throw Error('Unexpected cloud request')
      if (globalThis.aiEmailFixture.offline) throw Error('Synthetic offline')
      globalThis.aiEmailFixture.posts.push(JSON.parse(options.body).data)
      return new Response(JSON.stringify({ result: { status: 'sent' } }))
    }
  })
  async function open() {
    const opening = app.waitForEvent('window')
    await main.getByRole('button', { name: 'CERMS Assistant', exact: true }).click()
    return opening
  }
  async function ask(support) {
    await expect(support.getByLabel('Message CERMS Assistant', { exact: true })).toBeVisible()
    await support
      .getByLabel('Message CERMS Assistant', { exact: true })
      .fill('How do I print a receipt?')
    await support.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(
      support.getByText('Open a saved receipt and choose Print.', { exact: true }),
    ).toBeVisible()
  }
  let support = await open()
  await ask(support)
  await support.getByRole('button', { name: 'Finish chat', exact: true }).click()
  await expect(support.getByRole('heading', { name: 'How can I help?', exact: true })).toBeVisible()
  await expect.poll(() => app.evaluate(() => globalThis.aiEmailFixture.posts.length)).toBe(1)
  await support.getByRole('button', { name: 'Close assistant', exact: true }).click()
  assert.equal(await app.evaluate(() => globalThis.aiEmailFixture.posts.length), 1)
  support = await open()
  await ask(support)
  await support.getByRole('button', { name: 'New chat', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.aiEmailFixture.posts.length)).toBe(2)
  await ask(support)
  await support.close()
  await expect.poll(() => app.evaluate(() => globalThis.aiEmailFixture.posts.length)).toBe(3)
  const sent = await app.evaluate(() => globalThis.aiEmailFixture.posts)
  assert.deepEqual(
    sent.map((p) => p.reason),
    ['end-button', 'new-conversation', 'window-closed'],
  )
  assert.equal(new Set(sent.map((p) => p.id)).size, 3)
  assert.ok(sent.every((p) => p.turns.length === 2))
  support = await open()
  await ask(support)
  // Actual application quit goes through the shutdown hook before window close.
  const stopped = app.waitForEvent('close')
  await app.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 0)
  })
  await stopped
  const journal = JSON.parse(
    await readFile(join(dir, 'profile/ai-support-email-outbox.json'), 'utf8'),
  )
  assert.equal(journal.draft, null)
  assert.deepEqual(journal.pending, [])
  console.log(
    'AI conversation lifecycle passed: end button, new conversation, native window close and application quit; full transcripts queued once and acknowledged. All model/network delivery mocked in an isolated profile.',
  )
} finally {
  if (app) await app.close().catch(() => {})
  await rm(dir, { recursive: true, force: true })
}
