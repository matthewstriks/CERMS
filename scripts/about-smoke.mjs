import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env })
try {
  const login = await app.firstWindow()
  await login.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  const errors = []
  const nextWindow = app.waitForEvent('window')
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const about = menu.getMenuItemById('about-cerms')
    if (!about) throw new Error('About menu missing')
    about.click()
  })
  const about = await nextWindow
  about.on('pageerror', (error) => errors.push(error.message))
  await about.getByRole('heading', { name: 'CERMS.' }).waitFor()
  assert.equal(
    await about
      .locator('.about-mark')
      .evaluate((image) => image.complete && image.naturalWidth > 0),
    true,
  )
  const version = await app.evaluate(({ app }) => app.getVersion())
  await about.getByText(`Version ${version}`, { exact: true }).waitFor()
  await about.getByText('RocMTSSolutions LLC.', { exact: true }).waitFor()
  assert.equal(await about.evaluate(() => typeof window.require), 'undefined')
  assert.equal(
    await about.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    true,
  )
  await login.evaluate(() => window.desktop.openAbout())
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 2)
  // About cannot resize the login window or access member attachment actions.
  assert.equal(
    await about.evaluate(() =>
      window.desktop.setWindowMode('workspace').then(
        () => false,
        () => true,
      ),
    ),
    true,
  )
  assert.equal(
    await about.evaluate(() =>
      window.desktop.openMemberFile('https://example.com').then(
        () => false,
        () => true,
      ),
    ),
    true,
  )
  await about.getByRole('button', { name: 'Copy app details' }).click()
  await about.getByText('Details copied', { exact: true }).waitFor()
  assert.match(
    await app.evaluate(({ clipboard }) => clipboard.readText()),
    new RegExp(`^CERMS ${version.replaceAll('.', '\\.')}`),
  )
  await mkdir('artifacts', { recursive: true })
  await about.screenshot({ path: 'artifacts/about-cerms.png' })
  await Promise.all([
    about.waitForEvent('close'),
    about.getByRole('button', { name: 'Done', exact: true }).click(),
  ])
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
  const reopened = app.waitForEvent('window')
  await login.evaluate(() => window.desktop.openAbout())
  const again = await reopened
  await again.getByRole('button', { name: 'Done' }).waitFor()
  await Promise.all([
    again.waitForEvent('close'),
    again.keyboard.press('Escape').catch((error) => {
      if (!again.isClosed()) throw error
    }),
  ])
  await login.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'About smoke passed: native menu, version, single window, layout, sandbox, IPC boundaries, copy, Done, Escape, reopen, unchanged login.',
  )
} finally {
  await app.close()
}
