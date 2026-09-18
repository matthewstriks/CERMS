import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const launchEnv = { ...process.env, ELECTRON_RENDERER_URL: '' }
// Some IDE hosts set this for their own runtime; a desktop test needs GUI mode.
delete launchEnv.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env: launchEnv })
try {
  const page = await app.firstWindow({ timeout: 20000 })
  page.setDefaultTimeout(15000)
  console.log('Desktop window created:', page.url())
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  assert.equal(
    await page
      .locator('.login-brand img')
      .evaluate((image) => image.complete && image.naturalWidth > 0),
    true,
  )
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.equal((await page.evaluate(() => window.desktop.getAppInfo())).electron, '44.4.1')
  const preferences = await app.evaluate(({ BrowserWindow }) => {
    const webContents = BrowserWindow.getAllWindows()[0].webContents
    const prefs = webContents.getLastWebPreferences()
    return {
      sandbox: prefs.sandbox,
      nodeIntegration: prefs.nodeIntegration,
      contextIsolation: prefs.contextIsolation,
    }
  })
  assert.deepEqual(preferences, { sandbox: true, nodeIntegration: false, contextIsolation: true })
  await mkdir('artifacts', { recursive: true })
  const info = await page.evaluate(() => window.desktop.getAppInfo())
  await page.getByText(`Version ${info.version}`, { exact: true }).waitFor()
  assert.deepEqual(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()),
    [480, 680],
  )
  assert.equal(await page.getByRole('navigation').count(), 0)
  await page.getByRole('button', { name: 'Support', exact: true }).click()
  await page.getByText('Support is not implemented yet.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Support', exact: true }).click()
  await page.screenshot({ path: 'artifacts/login.png', fullPage: true })
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByRole('heading', { name: 'Reset your password' }).waitFor()
  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await page.evaluate(() => {
    window.location.hash = 'members'
  })
  await page.reload()
  await page.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  assert.equal(await page.getByRole('navigation').count(), 0)
  assert.deepEqual(errors, [])
  console.log(
    'Desktop smoke passed: compact login, version, support, forgot password, protected routes, sandbox and reload.',
  )
} finally {
  await app.close()
}
