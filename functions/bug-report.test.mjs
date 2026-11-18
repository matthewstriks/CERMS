import test from 'node:test'
import assert from 'node:assert/strict'
import { submitBugReport, submitLoginSupport } from './bug-report.mjs'
import { downloadDisposition } from './support-email.mjs'
import { posFixture, owner, business } from '../scripts/fixtures/pos-server.mjs'
function fixture() {
  const f = posFixture(),
    sent = [],
    files = new Map(),
    optionsSaved = [],
    signedOptions = []
  const request = {
    auth: { uid: owner, token: { email: 'synthetic@example.com' } },
    data: {
      requestId: '10000000-0000-4000-8000-000000000001',
      subject: 'Synthetic problem',
      priority: 'normal',
      message: 'Synthetic details',
      context: {
        uid: owner,
        email: 'spoofed@example.com',
        business,
        version: '5.0.0-alpha.6',
        platform: 'win32',
        electron: '44',
        logs: ['Bearer synthetic-token', 'password=secret'],
      },
      screenshots: [],
      files: [{ name: 'example.txt', contentType: 'text/plain', base64: 'YWJj', size: 3 }],
    },
  }
  const deps = {
    ...f.deps,
    bucket: {
      file: (path) => ({
        save: async (bytes, options) => {
          assert.equal(options.preconditionOpts.ifGenerationMatch, 0)
          assert.ok(
            path.startsWith(`reports/${business}/${owner}/`) || path.startsWith('login-support/'),
          )
          optionsSaved.push(options)
          if (files.has(path)) throw Object.assign(Error('exists'), { code: 412 })
          files.set(path, bytes)
        },
        getSignedUrl: async (options) => {
          signedOptions.push(options)
          assert.equal(options.version, 'v4')
          assert.equal(options.action, 'read')
          return ['https://storage.example.invalid/signed']
        },
      }),
    },
    send: async (message) => {
      sent.push(message)
      return { accepted: ['matthew@rocmtssolutions.com'] }
    },
  }
  return {
    ...f,
    request,
    deps,
    files,
    sent,
    optionsSaved,
    signedOptions,
    report: `system/${business}/bugReports/${owner}-${request.data.requestId}`,
  }
}
test('auth-derived reporter, private immutable artifacts and sent retry never doubles email', async () => {
  const f = fixture()
  const result = await submitBugReport(f.request, f.deps)
  assert.equal(result.reportId, f.request.data.requestId)
  assert.equal(f.sent[0].replyTo, 'synthetic@example.com')
  assert.ok(!f.sent[0].text.includes('spoofed@example.com'))
  assert.equal(f.docs.get(f.report).state, 'sent')
  assert.deepEqual(f.docs.get(f.report).logs, ['Bearer [redacted]', 'password=[redacted]'])
  await submitBugReport(f.request, f.deps)
  assert.equal(f.sent.length, 1)
  assert.equal(f.files.size, 1)
  assert.ok([...f.docs.keys()].every((p) => !p.startsWith('mail/')))
  f.request.data.message = 'Changed'
  await assert.rejects(submitBugReport(f.request, f.deps), { code: 'already-exists' })
})
test('invalid auth, foreign scope, forged context, attachment sizes and headers cause no side effects', async () => {
  for (const mutate of [
    (f) => {
      f.request.auth = null
    },
    (f) => {
      f.request.auth.token.email = 'a@example.com\r\nBcc:evil@example.com'
    },
    (f) => {
      f.request.data.context.business = 'foreign'
    },
    (f) => {
      f.request.data.context.uid = 'someone-else'
    },
    (f) => {
      f.request.data.subject = 'Bad\r\nheader'
    },
    (f) => {
      f.request.data.files[0].size = 1
    },
    (f) => {
      f.request.data.files[0].base64 = 'invalid'
    },
    (f) => {
      f.request.data.files[0].size = 9 * 1024 * 1024
    },
    (f) => {
      f.request.data.unexpected = true
    },
  ]) {
    const f = fixture()
    mutate(f)
    await assert.rejects(submitBugReport(f.request, f.deps))
    assert.equal(f.files.size, 0)
    assert.equal(f.sent.length, 0)
    assert.equal(f.commits(), 0)
  }
})
test('uncertain SMTP acceptance blocks repeat email and concurrent submissions', async () => {
  const f = fixture()
  f.deps.send = async () => {
    f.sent.push('attempt')
    throw Error('lost acceptance response')
  }
  await assert.rejects(submitBugReport(f.request, f.deps), /Support must review/)
  assert.equal(f.docs.get(f.report).state, 'uncertain')
  await assert.rejects(submitBugReport(f.request, f.deps), /support review/)
  assert.equal(f.sent.length, 1)
  f.docs.get(f.report).state = 'preparing'
  f.docs.get(f.report).leaseUntil = new Date(Date.now() + 60000)
  await assert.rejects(submitBugReport(f.request, f.deps), { code: 'aborted' })
})
test('pre-send failure can retry immutable artifacts; business revocation blocks retry', async () => {
  const f = fixture(),
    bucket = f.deps.bucket
  f.deps.bucket = {
    file: () => ({
      save: async () => {
        throw Error('offline')
      },
    }),
  }
  await assert.rejects(submitBugReport(f.request, f.deps), /offline/)
  assert.equal(f.docs.get(f.report).state, 'failed')
  f.deps.bucket = bucket
  await submitBugReport(f.request, f.deps)
  f.docs.get(`users/${owner}`).access = 'other'
  await assert.rejects(submitBugReport(f.request, f.deps), { code: 'permission-denied' })
  assert.equal(f.sent.length, 1)
})
test('new requests are rate-limited while identical sent retries stay free', async () => {
  const f = fixture()
  for (let i = 0; i < 5; i++) {
    f.request.data.requestId = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    await submitBugReport(f.request, f.deps)
    await submitBugReport(f.request, f.deps)
  }
  f.request.data.requestId = '10000000-0000-4000-8000-999999999999'
  await assert.rejects(submitBugReport(f.request, f.deps), { code: 'resource-exhausted' })
  assert.equal(f.sent.length, 5)
})

test('accepts an 8 MB artifact without regex recursion and rejects aggregate overflow', async () => {
  const f = fixture(),
    bytes = Buffer.alloc(8 * 1024 * 1024, 65)
  f.request.data.files = [
    {
      name: 'bounded.bin',
      contentType: 'application/octet-stream',
      size: bytes.length,
      base64: bytes.toString('base64'),
    },
  ]
  await submitBugReport(f.request, f.deps)
  assert.equal(f.files.size, 1)
  const rejected = fixture()
  rejected.request.data.files.unshift(f.request.data.files[0])
  await assert.rejects(submitBugReport(rejected.request, rejected.deps), {
    code: 'invalid-argument',
  })
  assert.equal(rejected.files.size, 0)
  assert.equal(rejected.sent.length, 0)
})

test('formatted report escapes text and signs original-image downloads with filename and media type', async () => {
  const f = fixture()
  f.request.data.subject = 'Screenshot <problem>'
  f.request.data.message = 'Broken <script>alert(1)</script>\nNext line'
  f.request.data.files[0].name = 'photo café.png'
  f.request.data.files[0].contentType = 'image/png'
  await submitBugReport(f.request, f.deps)
  assert.equal(f.optionsSaved[0].metadata.contentType, 'image/png')
  assert.match(f.optionsSaved[0].metadata.contentDisposition, /filename="photo caf_.png"/)
  assert.match(f.signedOptions[0].responseDisposition, /filename\*=UTF-8''photo%20caf%C3%A9.png/)
  assert.equal(f.signedOptions[0].responseType, 'image/png')
  assert.deepEqual([...f.files.values()][0], Buffer.from('abc'))
  assert.ok(f.sent[0].html.includes('Download photo café.png'))
  assert.ok(f.sent[0].html.includes('&lt;script&gt;'))
  assert.ok(!f.sent[0].html.includes('<script>'))
  assert.ok(!downloadDisposition('../bad\r\n"name.png').includes('\r'))
})

function loginFixture() {
  const f = fixture()
  f.request.auth = undefined
  f.request.rawRequest = { ip: '203.0.113.1' }
  f.request.data.replyEmail = 'help@example.test'
  Object.assign(f.request.data.context, {
    mode: 'login',
    uid: '',
    business: '',
    email: 'help@example.test',
  })
  return f
}
test('signed-out support sends only to support, identifies unverified reply email and preserves business/Auth records', async () => {
  const f = loginFixture(),
    before = new Map(f.docs)
  await submitLoginSupport(f.request, f.deps)
  assert.deepEqual(f.sent[0].to, ['matthew@rocmtssolutions.com'])
  assert.equal(f.sent[0].replyTo, 'help@example.test')
  assert.match(f.sent[0].html, /not been verified/)
  assert.equal(f.docs.get('supportRequests/' + f.request.data.requestId).state, 'sent')
  for (const [path, value] of before) assert.deepEqual(f.docs.get(path), value)
  await submitLoginSupport(f.request, f.deps)
  assert.equal(f.sent.length, 1)
  await assert.rejects(submitBugReport(f.request, f.deps), { code: 'unauthenticated' })
})
test('login support rejects staff claims/header injection and enforces its public rate limits', async () => {
  for (const modify of [
    (f) => {
      f.request.data.context.business = 'dev'
    },
    (f) => {
      f.request.data.context.uid = owner
    },
    (f) => {
      f.request.data.replyEmail = 'x@example.test\r\nBcc: z@example.test'
    },
    (f) => {
      delete f.request.rawRequest.ip
    },
  ]) {
    const f = loginFixture()
    modify(f)
    await assert.rejects(submitLoginSupport(f.request, f.deps))
    assert.equal(f.sent.length, 0)
  }
  const f = loginFixture()
  for (let i = 0; i < 3; i++) {
    f.request.data.requestId = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    await submitLoginSupport(f.request, f.deps)
  }
  f.request.data.requestId = '10000000-0000-4000-8000-999999999999'
  await assert.rejects(submitLoginSupport(f.request, f.deps), { code: 'resource-exhausted' })
  assert.equal(f.sent.length, 3)
})

const githubIssue = { number: 42, url: 'https://github.com/matthewstriks/CERMS/issues/42' }
test('staff and login reports create an issue before email, persist its link and never duplicate on retry', async () => {
  for (const [make, submit] of [
    [fixture, submitBugReport],
    [loginFixture, submitLoginSupport],
  ]) {
    const f = make()
    let creates = 0
    f.deps.github = {
      create: async () => {
        assert.equal(f.sent.length, 0)
        creates++
        return githubIssue
      },
    }
    const result = await submit(f.request, f.deps)
    assert.equal(result.issueUrl, githubIssue.url)
    assert.match(f.sent[0].html, /View GitHub issue #42/)
    assert.ok(f.sent[0].text.includes(githubIssue.url))
    const path = f.request.auth ? f.report : 'supportRequests/' + f.request.data.requestId
    assert.deepEqual(f.docs.get(path).github.issue, githubIssue)
    await submit(f.request, f.deps)
    assert.equal(creates, 1)
    assert.equal(f.sent.length, 1)
  }
})
test('lost issue confirmation recovers original issue; pending lookup never creates another or sends email', async () => {
  const f = fixture()
  let creates = 0,
    found = null
  f.deps.github = {
    create: async () => {
      creates++
      throw Error('lost response')
    },
    find: async () => found,
  }
  await assert.rejects(submitBugReport(f.request, f.deps), { code: 'unavailable' })
  assert.equal(f.docs.get(f.report).github.state, 'uncertain')
  await assert.rejects(submitBugReport(f.request, f.deps), { code: 'unavailable' })
  assert.equal(creates, 1)
  assert.equal(f.sent.length, 0)
  found = githubIssue
  await submitBugReport(f.request, f.deps)
  assert.equal(creates, 1)
  assert.equal(f.sent.length, 1)
})
