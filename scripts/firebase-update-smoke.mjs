// Synthetic loopback feed only. Downloads inert bytes, never runs an installer.
import electron from 'electron'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
if (typeof electron === 'string') {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(electron, [import.meta.filename], { env, stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
const { app, session } = electron
const require = createRequire(import.meta.url)
const { NsisUpdater } = require('electron-updater')
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor')
async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'cerms-update-smoke-'))
  const installer = Buffer.from('Inert synthetic Windows installer bytes; never execute.')
  const sha512 = createHash('sha512').update(installer).digest('base64')
  const requests = []
  const manifest = (version) =>
    JSON.stringify({
      version,
      releaseNotes: '### Added\n- Synthetic release notes from the published feed.',
      path: `CERMS-5-${version}-win-x64.exe`,
      sha512,
      files: [{ url: `CERMS-5-${version}-win-x64.exe`, size: installer.length, sha512 }],
    })
  let advertised = '5.0.0-alpha.2',
    tamper = false
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    requests.push(path)
    if (path === '/windows/alpha.yml') res.end(manifest(advertised))
    else if (path === '/windows/latest.yml') res.end(manifest('5.0.0'))
    else if (path.endsWith('.exe')) {
      const bytes = tamper ? Buffer.from('corrupted payload') : installer
      res.setHeader('Content-Length', bytes.length)
      res.end(bytes)
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  let success = false
  try {
    await app.whenReady()
    session
      .fromPartition('electron-updater', { cache: false })
      .webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: new URL(details.url).hostname !== '127.0.0.1' })
      })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}/windows/`
    async function updater(version, channel, id) {
      const root = join(dir, id)
      await mkdir(root)
      const config = join(root, 'app-update.yml')
      await writeFile(
        config,
        JSON.stringify({ provider: 'generic', url, channel, updaterCacheDirName: 'synthetic' }),
      )
      const adapter = {
        version,
        name: 'CERMS synthetic updater',
        isPackaged: true,
        userDataPath: root,
        baseCachePath: root,
        appUpdateConfigPath: config,
        whenReady: () => app.whenReady(),
        quit: () => {
          throw new Error('Tests must never quit to install')
        },
        onQuit: () => {
          throw new Error('Tests must never register an install-on-quit handler')
        },
      }
      const instance = new NsisUpdater(null, adapter)
      instance.httpExecutor = new ElectronHttpExecutor()
      instance._testOnlyOptions = { platform: 'win32', isUseDifferentialDownload: false }
      instance.setFeedURL({ provider: 'generic', url, channel, useMultipleRangeRequest: false })
      instance.autoDownload = true
      instance.autoInstallOnAppQuit = false
      instance.allowDowngrade = false
      instance.logger = { info() {}, warn() {}, error() {}, debug() {} }
      return instance
    }
    const alpha = await updater('5.0.0-alpha.1', 'alpha', 'alpha')
    const checked = await alpha.checkForUpdates()
    assert.equal(checked.updateInfo.version, '5.0.0-alpha.2')
    assert.equal(
      checked.updateInfo.releaseNotes,
      '### Added\n- Synthetic release notes from the published feed.',
    )
    const paths = await checked.downloadPromise
    assert.deepEqual(await readFile(paths[0]), installer)
    assert.equal(alpha.quitAndInstallCalled, false)
    const stable = await updater('5.0.0', 'latest', 'stable')
    const stableResult = await stable.checkForUpdates()
    assert.equal(stableResult.downloadPromise, undefined)
    advertised = '5.0.0-alpha.1'
    const newer = await updater('5.0.0-alpha.2', 'alpha', 'newer')
    assert.equal((await newer.checkForUpdates()).downloadPromise, undefined)
    advertised = '5.0.0-alpha.3'
    tamper = true
    const bad = await updater('5.0.0-alpha.2', 'alpha', 'tampered')
    const badResult = await bad.checkForUpdates()
    await assert.rejects(badResult.downloadPromise, /checksum|mismatch/i)
    assert.ok(requests.includes('/windows/alpha.yml') && requests.includes('/windows/latest.yml'))
    console.log(
      'Synthetic Windows generic feed: alpha download, stable isolation, downgrade refusal and corrupt-download rejection passed. No installer executed.',
    )
    success = true
  } catch (error) {
    console.error(error)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
    app.exit(success ? 0 : 1)
  }
}
void main()
