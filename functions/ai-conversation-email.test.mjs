import test from 'node:test'
import assert from 'node:assert/strict'
import { emailAiSupportConversation } from './ai-conversation-email.mjs'
import { posFixture } from '../scripts/fixtures/pos-server.mjs'
function fixture() {
  const f = posFixture(),
    sent = []
  const request = {
    rawRequest: { ip: '203.0.113.8' },
    data: {
      id: '10000000-0000-4000-8000-000000000001',
      version: '5.0.0-alpha.10',
      model: 'qwen2.5:1.5b',
      platform: 'darwin',
      device: 'Synthetic Mac',
      startedAt: Date.now() - 10000,
      finishedAt: Date.now(),
      reason: 'window-closed',
      turns: [
        { role: 'user', text: 'Print <receipt> password=secret' },
        {
          role: 'assistant',
          text: 'Choose Print.',
          sources: [{ id: 'receipt', title: 'Printing or emailing a receipt' }],
        },
      ],
    },
  }
  return {
    ...f,
    request,
    sent,
    deps: {
      ...f.deps,
      send: async (m) => {
        sent.push(m)
        return { accepted: m.to }
      },
    },
  }
}
test('private full-conversation email has fixed recipient, safe HTML and duplicate-safe audit without storing chat', async () => {
  const f = fixture(),
    before = new Map(f.docs)
  assert.deepEqual(await emailAiSupportConversation(f.request, f.deps), { status: 'sent' })
  await emailAiSupportConversation(f.request, f.deps)
  assert.equal(f.sent.length, 1)
  assert.deepEqual(f.sent[0].to, ['matthew@rocmtssolutions.com'])
  assert.match(f.sent[0].text, /Choose Print/)
  assert.match(f.sent[0].text, /Printing or emailing a receipt/)
  assert.match(f.sent[0].html, /&lt;receipt&gt;/)
  assert.ok(!f.sent[0].text.includes('password=secret'))
  assert.ok(!JSON.stringify([...f.docs.values()]).includes('Choose Print'))
  for (const [path, value] of before) assert.deepEqual(f.docs.get(path), value)
  assert.ok(
    [...f.docs.keys()]
      .filter((p) => !before.has(p))
      .every((p) => p.startsWith('aiSupportConversationEmail')),
  )
})
test('chat reports identify original staff, signed-out sessions and older unrecorded users', async () => {
  const f = fixture()
  f.request.data.user = {
    uid: 'synthetic-user',
    name: '<Synthetic Staff>',
    email: 'staff@example.test',
    business: 'club-a',
  }
  await emailAiSupportConversation(f.request, f.deps)
  assert.match(f.sent[0].text, /User \(recorded at chat start\): <Synthetic Staff>/)
  assert.match(f.sent[0].text, /staff@example.test/)
  assert.match(f.sent[0].text, /synthetic-user/)
  assert.match(f.sent[0].html, /&lt;Synthetic Staff&gt;/)
  assert.match(f.sent[0].text, /client-reported snapshot/)
  const loggedOut = fixture()
  loggedOut.request.data.user = null
  await emailAiSupportConversation(loggedOut.request, loggedOut.deps)
  assert.match(loggedOut.sent[0].text, /Signed out/)
  const old = fixture()
  await emailAiSupportConversation(old.request, old.deps)
  assert.match(old.sent[0].text, /Not recorded/)
  const bad = fixture()
  bad.request.data.user = {
    uid: 'u',
    name: 'Test',
    email: 'test@example.test',
    business: 'x',
    token: 'secret',
  }
  await assert.rejects(emailAiSupportConversation(bad.request, bad.deps), {
    code: 'invalid-argument',
  })
  assert.equal(bad.sent.length, 0)
})
test('SMTP uncertainty never resends; malformed or redirected requests have no effects', async () => {
  const f = fixture()
  let attempts = 0
  f.deps.send = async () => {
    attempts++
    throw Error('response lost')
  }
  assert.deepEqual(await emailAiSupportConversation(f.request, f.deps), { status: 'review' })
  assert.deepEqual(await emailAiSupportConversation(f.request, f.deps), { status: 'review' })
  assert.equal(attempts, 1)
  for (const change of [
    (d) => {
      d.to = 'evil@example.test'
    },
    (d) => {
      d.turns[0].text = 'x'.repeat(2001)
    },
    (d) => {
      d.model = 'paid-cloud-model'
    },
  ]) {
    const g = fixture()
    change(g.request.data)
    await assert.rejects(emailAiSupportConversation(g.request, g.deps), {
      code: 'invalid-argument',
    })
    assert.equal(g.sent.length, 0)
  }
})
test('public login-capable endpoint enforces new-conversation limits while sent retries remain free', async () => {
  const f = fixture()
  for (let i = 0; i < 10; i++) {
    f.request.data.id = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    await emailAiSupportConversation(f.request, f.deps)
  }
  await emailAiSupportConversation(f.request, f.deps)
  f.request.data.id = '10000000-0000-4000-8000-999999999999'
  await assert.rejects(emailAiSupportConversation(f.request, f.deps), {
    code: 'resource-exhausted',
  })
  assert.equal(f.sent.length, 10)
})
