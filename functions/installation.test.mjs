import test from 'node:test'
import assert from 'node:assert/strict'
import { reportInstallation } from './installation.mjs'
import { posFixture, owner, business } from '../scripts/fixtures/pos-server.mjs'
function fixture() {
  const f = posFixture(),
    emails = []
  const request = {
    auth: { uid: owner, token: { email: 'matthew@example.test' } },
    data: {
      installationId: '10000000-0000-4000-8000-000000000001',
      version: '5.0.0-alpha.9',
      previousVersion: null,
      device: { hostname: 'Matt-Laptop', platform: 'win32', arch: 'x64', osRelease: '10.0.26100' },
    },
  }
  return {
    ...f,
    request,
    emails,
    deps: {
      ...f.deps,
      send: async (message) => {
        emails.push(message)
        return { accepted: message.to }
      },
    },
  }
}
test('one email for each installation/version, with the verified first user and device; later logins never resend', async () => {
  const f = fixture(),
    profiles = new Map(f.docs)
  await reportInstallation(f.request, f.deps)
  await reportInstallation(f.request, f.deps)
  assert.equal(f.emails.length, 1)
  assert.deepEqual(f.emails[0].to, ['matthew@rocmtssolutions.com'])
  assert.match(f.emails[0].text, /Matt-Laptop/)
  assert.match(f.emails[0].text, /5.0.0-alpha.9/)
  assert.match(f.emails[0].text, /Matthew Test Striks/)
  f.docs.set('users/ben', { uid: 'ben', access: business, displayName: 'Ben' })
  f.request.auth = { uid: 'ben', token: { email: 'ben@example.test' } }
  await reportInstallation(f.request, f.deps)
  assert.equal(f.emails.length, 1)
  f.request.data.installationId = '20000000-0000-4000-8000-000000000002'
  f.request.data.device.hostname = 'Ben-PC'
  await reportInstallation(f.request, f.deps)
  assert.equal(f.emails.length, 2)
  assert.match(f.emails[1].text, /Ben logged in on Ben-PC/)
  f.request.data.previousVersion = f.request.data.version
  f.request.data.version = '5.0.0-alpha.10'
  await reportInstallation(f.request, f.deps)
  assert.equal(f.emails.length, 3)
  for (const [path, data] of profiles) assert.deepEqual(f.docs.get(path), data)
})
test('failed/invalid sign-ins or forged actor/destination fields cannot send mail', async () => {
  for (const modify of [
    (f) => {
      f.request.auth = null
    },
    (f) => {
      f.docs.delete('users/' + owner)
    },
    (f) => {
      f.docs.get('users/' + owner).uid = 'someone-else'
    },
    (f) => {
      f.request.data.to = 'someone@example.test'
    },
    (f) => {
      f.request.data.version = 'not-a-version'
    },
    (f) => {
      f.request.data.device.hostname = 'Bad\r\nBcc: other'
    },
  ]) {
    const f = fixture()
    modify(f)
    await assert.rejects(reportInstallation(f.request, f.deps))
    assert.equal(f.emails.length, 0)
    assert.equal(f.commits(), 0)
  }
})
test('uncertain SMTP acceptance remains for review rather than resending; email content is escaped', async () => {
  const f = fixture()
  f.request.data.device.hostname = '<Laptop>'
  f.deps.send = async (message) => {
    f.emails.push(message)
    throw Error('acceptance response lost')
  }
  assert.deepEqual(await reportInstallation(f.request, f.deps), { status: 'review' })
  assert.deepEqual(await reportInstallation(f.request, f.deps), { status: 'review' })
  assert.equal(f.emails.length, 1)
  assert.match(f.emails[0].html, /&lt;Laptop&gt;/)
  assert.ok(!f.emails[0].html.includes('<Laptop>'))
  assert.equal([...f.docs.values()].filter((d) => d.state === 'uncertain').length, 1)
})
