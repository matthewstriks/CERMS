// Focused feature check: no authentication, cloud uploads, email or production requests.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { supportEmail } from '../functions/support-email.mjs'
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const fixture = '/private/tmp/cerms-login-support-image.png'
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1cAAAAASUVORK5CYII=',
  'base64',
)
await writeFile(fixture, bytes)
const app = await electron.launch({ args: ['.', '--mute-audio'], env, timeout: 20000 }),
  unexpected = []
try {
  await app.context().route('https://**/*', (route) => {
    unexpected.push(new URL(route.request().url()).hostname)
    return route.abort()
  })
  await app.evaluate(({ net, dialog }, fixture) => {
    globalThis.supportRequests = []
    const original = net.fetch.bind(net)
    net.fetch = async (url, options) => {
      if (String(url).startsWith('file:')) return original(url, options)
      if (url !== 'https://us-central1-cerms-7af24.cloudfunctions.net/submitLoginSupport')
        throw Error('Unexpected main request')
      if (options.headers.Authorization) throw Error('Login support must not use staff tokens')
      const data = JSON.parse(options.body).data
      globalThis.supportRequests.push(data)
      return new Response(JSON.stringify({ result: { reportId: data.requestId } }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
  }, fixture)
  const main = await app.firstWindow()
  await main.getByLabel('Email', { exact: true }).fill('login@example.test')
  await main.getByLabel('Password', { exact: true }).fill('never-report-this-password')
  let opening = app.waitForEvent('window')
  await main.getByRole('button', { name: 'Support', exact: true }).click()
  let support = await opening
  await expect(support.getByRole('heading', { name: 'Contact support', exact: true })).toBeVisible()
  await expect(support.getByLabel('Reply email', { exact: true })).toHaveValue('login@example.test')
  await support.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await app.evaluate(() => globalThis.supportRequests.length), 0)
  opening = app.waitForEvent('window')
  await main.getByRole('button', { name: 'Support', exact: true }).click()
  support = await opening
  await support.getByLabel('Reply email', { exact: true }).fill('reply@example.test')
  await support.getByLabel('Subject', { exact: true }).fill('Unable to sign in')
  await support.getByRole('combobox').selectOption('high')
  await support
    .getByLabel('What happened?', { exact: true })
    .fill('Synthetic sign-in issue.\nPlease help.')
  await support.getByRole('button', { name: 'Capture screenshot', exact: true }).click()
  await expect(support.getByRole('img', { name: 'Captured main window 1' })).toBeVisible()
  await support.getByRole('button', { name: 'Attach files', exact: true }).click()
  await expect(support.getByText('cerms-login-support-image.png', { exact: false })).toBeVisible()
  await support.getByRole('button', { name: 'Send support request', exact: true }).click()
  await expect(support.getByRole('heading', { name: 'Report sent', exact: true })).toBeVisible()
  const requests = await app.evaluate(() => globalThis.supportRequests)
  assert.equal(requests.length, 1)
  const report = requests[0]
  assert.equal(report.context.mode, 'login')
  assert.equal(report.context.uid, '')
  assert.equal(report.context.business, '')
  assert.equal(report.replyEmail, 'reply@example.test')
  assert.equal(report.files[0].contentType, 'image/png')
  assert.deepEqual(Buffer.from(report.files[0].base64, 'base64'), bytes)
  assert.ok(!JSON.stringify(report).includes('never-report-this-password'))
  assert.deepEqual(unexpected, [])
  const preview = supportEmail(
    {
      ...report.context,
      email: report.replyEmail,
      origin: 'login',
      subject: report.subject,
      message: report.message,
      priority: report.priority,
    },
    [
      {
        name: report.files[0].name,
        size: bytes.length,
        contentType: 'image/png',
        url: 'https://example.invalid/download',
      },
    ],
    report.requestId,
    Date.now(),
  )
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/support-email-preview.html', preview.html)
  await support.setContent(preview.html)
  await support.screenshot({ path: 'artifacts/support-email-preview.png', fullPage: true })
  console.log(
    'Login Support opens without sign-in, pre-fills reply email, supports cancellation/screenshots/files, preserves PNG bytes/type and submits once. Email layout captured; all sends/network mocked.',
  )
} finally {
  await app.close()
  await rm(fixture, { force: true })
}
