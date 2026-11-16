import { expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const launchEnv = { ...process.env, ELECTRON_RENDERER_URL: '' }
// Some IDE hosts set this for their own runtime; a desktop test needs GUI mode.
delete launchEnv.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.', '--mute-audio'], env: launchEnv })
try {
  const page = await app.firstWindow({ timeout: 20000 })
  page.setDefaultTimeout(15000)
  console.log('Desktop window created:', page.url())
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  // Drive login UI through synthetic IPC status snapshots; never call Firebase data/Auth.
  await app.evaluate(({ ipcMain }) => {
    globalThis.cermsStatusFixture = {
      checkedAt: Date.now(),
      rows: [
        { id: 'internet', name: 'Internet', tone: 'green', detail: 'Connected' },
        { id: 'auth', name: 'Auth', tone: 'green', detail: 'No reported incidents' },
        {
          id: 'database',
          name: 'Database',
          tone: 'green',
          detail: 'No reported incidents',
        },
        {
          id: 'backend',
          name: 'API',
          tone: 'green',
          detail: 'No reported incidents',
        },
        {
          id: 'storage',
          name: 'Storage',
          tone: 'green',
          detail: 'No reported incidents',
        },
      ],
    }
    ipcMain.removeHandler('app:service-status')
    ipcMain.handle('app:service-status', () => globalThis.cermsStatusFixture)
  })
  await page.reload()
  const statusButton = page.getByRole('button', { name: /^Service status:/ })
  await expect(statusButton).toHaveClass(/service-green/)
  await statusButton.click()
  const statusPanel = page.getByRole('dialog', { name: 'Service status', exact: true })
  await expect(statusPanel).toBeVisible()
  await expect(statusPanel.getByRole('listitem')).toHaveCount(5)
  await expect(statusPanel).toContainText('public, global provider reports')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/login-service-status.png' })
  await app.evaluate(() => {
    globalThis.cermsStatusFixture.rows[2] = {
      id: 'database',
      name: 'Database',
      tone: 'red',
      detail: 'Provider reports an outage',
    }
  })
  await statusPanel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(statusButton).toHaveClass(/service-red/)
  await expect(statusPanel.getByRole('listitem').filter({ hasText: 'Database' })).toContainText(
    'outage',
  )
  await app.evaluate(() => {
    globalThis.cermsStatusFixture.checkedAt = Date.now() - 130000
  })
  await statusPanel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(statusButton).toHaveClass(/service-yellow/)
  await expect(statusPanel).toContainText('Last check is out of date')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    window.dispatchEvent(new Event('offline'))
  })
  await expect(statusButton).toHaveClass(/service-red/)
  await expect(statusPanel).toContainText('This device is offline')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  await app.evaluate(() => {
    globalThis.cermsStatusFixture.checkedAt = Date.now()
    globalThis.cermsStatusFixture.rows[2] = {
      id: 'database',
      name: 'Database',
      tone: 'green',
      detail: 'No reported incidents',
    }
  })
  await page.evaluate(() => {
    delete navigator.onLine
    window.dispatchEvent(new Event('online'))
  })
  await expect(statusButton).toHaveClass(/service-green/)
  await page.keyboard.press('Escape')
  await expect(statusPanel).not.toBeVisible()

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
    'Desktop smoke passed: service status green/yellow/red, stale/offline/recovery, details/keyboard dismissal, compact login, support, forgot password, protected routes, sandbox and reload.',
  )
} finally {
  await app.close()
}
