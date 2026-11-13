import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env })
try {
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  await expect(page.getByRole('complementary', { name: 'Application updates' })).toHaveCount(0)
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().getMenuItemById('check-for-updates').click(),
  )
  const notice = page.getByRole('complementary', { name: 'Application updates' })
  await expect(notice).toContainText('installed release builds')
  await notice.getByRole('button', { name: 'Dismiss update notice' }).click()
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test')
  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    globalThis.updateTestInstalls = 0
    globalThis.updateTestChecks = 0
    ipcMain.removeHandler('app:update-install')
    ipcMain.handle('app:update-install', () => {
      globalThis.updateTestInstalls++
      return true
    })
    ipcMain.removeHandler('app:update-check')
    ipcMain.handle('app:update-check', () => {
      globalThis.updateTestChecks++
      const state = {
        phase: 'current',
        currentVersion: '5.0.0-alpha.1',
        message: 'You have the latest version.',
        manual: true,
      }
      BrowserWindow.getAllWindows()[0].webContents.send('app:update-state', state)
      return state
    })
    BrowserWindow.getAllWindows()[0].webContents.send('app:update-state', {
      phase: 'downloading',
      currentVersion: '5.0.0-alpha.1',
      version: '5.0.0-alpha.2',
      percent: 35,
      message: 'Downloading CERMS 5.0.0-alpha.2…',
      manual: false,
    })
  })
  await expect(notice).toContainText('35%')
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('app:update-state', {
      phase: 'ready',
      currentVersion: '5.0.0-alpha.1',
      version: '5.0.0-alpha.2',
      message: 'CERMS 5.0.0-alpha.2 is ready.',
      manual: false,
    }),
  )
  await expect(notice.getByRole('button', { name: 'Install and restart' })).toBeVisible()
  assert.equal(await app.evaluate(() => globalThis.updateTestInstalls), 0)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('synthetic@example.test')
  await notice.getByRole('button', { name: 'Install and restart' }).click()
  assert.equal(await app.evaluate(() => globalThis.updateTestInstalls), 1)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('app:update-state', {
      phase: 'error',
      currentVersion: '5.0.0-alpha.1',
      message: 'Update check unavailable.',
      manual: true,
    }),
  )
  await notice.getByRole('button', { name: 'Try again' }).click()
  await expect(notice).toContainText('latest version')
  assert.equal(await app.evaluate(() => globalThis.updateTestChecks), 1)
  console.log(
    'Update UI passed: disabled development checks, menu action, download progress, ready notice, explicit install action, failure retry and preserved login form. All update events/install requests synthetic; no download or restart performed.',
  )
} finally {
  await app.close()
}
