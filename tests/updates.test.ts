import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createUpdateController } from '../src/main/updates'
import type { UpdateState } from '../src/shared/updates'
function fixture(enabled = true, version = '5.0.0-alpha.1') {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    allowDowngrade: true,
    disableWebInstaller: false,
    checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '5.0.0-alpha.2' } })),
    quitAndInstall: vi.fn(),
  })
  const states: UpdateState[] = []
  const controller = createUpdateController(
    updater as unknown as Parameters<typeof createUpdateController>[0],
    { enabled, version, changed: (s) => states.push(s) },
  )
  return { updater, controller, states }
}
describe('application updater', () => {
  it('never checks, downloads or installs updates in development or unsigned preview mode', async () => {
    const f = fixture(false)
    expect((await f.controller.check(true)).phase).toBe('disabled')
    expect(f.updater.checkForUpdates).not.toHaveBeenCalled()
    expect(f.controller.install()).toBe(false)
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled()
  })
  it('downloads automatically, installs on a normal exit, keeps prereleases scoped and forbids downgrade/web installers', () => {
    const f = fixture()
    expect(f.updater.autoDownload).toBe(true)
    expect(f.updater.autoInstallOnAppQuit).toBe(true)
    expect(f.updater.allowPrerelease).toBe(true)
    expect(f.updater.allowDowngrade).toBe(false)
    expect(f.updater.disableWebInstaller).toBe(true)
    expect(fixture(true, '5.0.0').updater.allowPrerelease).toBe(false)
  })
  it('deduplicates checks and reports downloaded progress without ever forcing an install', async () => {
    const f = fixture()
    await Promise.all([f.controller.check(), f.controller.check(true)])
    expect(f.updater.checkForUpdates).toHaveBeenCalledTimes(1)
    f.updater.emit('update-available', { version: '5.0.0-alpha.2' })
    f.updater.emit('download-progress', { percent: 34.6 })
    expect(f.controller.state()).toMatchObject({ phase: 'downloading', percent: 35, manual: true })
    await f.controller.check()
    expect(f.updater.checkForUpdates).toHaveBeenCalledTimes(1)
    f.updater.emit('update-downloaded', { version: '5.0.0-alpha.2' })
    expect(f.controller.state().phase).toBe('ready')
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled()
    await f.controller.check()
    expect(f.controller.state().phase).toBe('ready')
    expect(f.controller.install()).toBe(true)
    expect(f.updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
  it('refuses early installation and keeps errors recoverable without disclosing updater errors/tokens', async () => {
    const f = fixture()
    expect(f.controller.install()).toBe(false)
    f.updater.checkForUpdates.mockRejectedValueOnce(new Error('secret feed URL token'))
    expect((await f.controller.check(true)).phase).toBe('error')
    expect(f.controller.state().message).not.toContain('secret')
    f.updater.checkForUpdates.mockImplementationOnce(async () => {
      f.updater.emit('update-not-available')
      return { updateInfo: { version: '5.0.0-alpha.1' } }
    })
    expect((await f.controller.check(true)).phase).toBe('current')
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled()
  })
  it('handles asynchronous download failures without an unhandled rejection', async () => {
    const f = fixture()
    let reject!: (e: Error) => void
    const downloadPromise = new Promise<string[]>((_r, j) => {
      reject = j
    })
    f.updater.checkForUpdates.mockResolvedValueOnce({
      updateInfo: { version: '5.0.0-alpha.2' },
      downloadPromise,
    } as never)
    await f.controller.check()
    reject(new Error('download failure'))
    await Promise.resolve()
    expect(f.controller.state().phase).toBe('error')
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled()
  })
})

it('carries version-matched notes through download and clears them when checking another version', async () => {
  const f = fixture()
  f.updater.emit('update-available', {
    version: '5.0.0-alpha.2',
    releaseNotes: '### Added\n- New staff chat.',
  })
  expect(f.controller.state().releaseNotes).toContain('New staff chat')
  f.updater.emit('download-progress', { percent: 75 })
  f.updater.emit('update-downloaded', { version: '5.0.0-alpha.2' })
  expect(f.controller.state().releaseNotes).toContain('New staff chat')
  f.updater.emit('update-available', { version: '5.0.0-alpha.3' })
  expect(f.controller.state().releaseNotes).toBeUndefined()
  f.updater.emit('update-not-available')
  expect(f.controller.state().version).toBeUndefined()
  expect(f.controller.state().releaseNotes).toBeUndefined()
})
