import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({
  executablePath: resolve('release/mac-universal/CERMS 5.app/Contents/MacOS/CERMS 5'),
  env,
})
try {
  const page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: 'Sign in to CERMS' })).toBeVisible()
  const info = await page.evaluate(() => window.desktop.getAppInfo())
  assert.equal(info.packaged, true)
  assert.equal((await page.evaluate(() => window.desktop.getUpdateState())).phase, 'disabled')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await expect(page.locator('.login-brand img')).toBeVisible()
  console.log(
    `Universal Mac packaged preview launched successfully (${info.version}); sandbox, login and explicit manual-update mode verified. No sign-in or business writes performed.`,
  )
} finally {
  await app.close()
}
