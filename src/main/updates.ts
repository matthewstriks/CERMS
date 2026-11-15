import { releaseNotesText } from '../shared/release-notes'
import type { AppUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/updates'

type Updater = Pick<
  AppUpdater,
  | 'on'
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowPrerelease'
  | 'allowDowngrade'
  | 'disableWebInstaller'
  | 'checkForUpdates'
  | 'quitAndInstall'
>
export function createUpdateController(
  updater: Updater,
  options: {
    version: string
    enabled: boolean
    disabledReason?: string
    changed(state: UpdateState): void
  },
) {
  let state: UpdateState = {
    phase: options.enabled ? 'idle' : 'disabled',
    currentVersion: options.version,
    message: options.enabled
      ? 'Updates are checked automatically.'
      : (options.disabledReason ?? 'Automatic updates are available in installed release builds.'),
    manual: false,
  }
  let checking: Promise<UpdateState> | undefined
  function set(patch: Partial<UpdateState>) {
    state = { ...state, ...patch }
    options.changed({ ...state })
  }
  function failed() {
    set({
      phase: 'error',
      percent: undefined,
      message:
        'Update could not be checked or downloaded. You can keep using this version and try again later.',
    })
  }
  // Never set a feed URL from renderer input. The packaged app-update.yml owns it.
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = options.version.includes('-')
  updater.allowDowngrade = false
  updater.disableWebInstaller = true
  updater.on('checking-for-update', () =>
    set({
      phase: 'checking',
      version: undefined,
      releaseNotes: undefined,
      message: 'Checking for updates…',
    }),
  )
  updater.on('update-available', (info) =>
    set({
      phase: 'downloading',
      version: info.version,
      releaseNotes: releaseNotesText(info.releaseNotes, info.version),
      percent: 0,
      message: `Downloading CERMS ${info.version}…`,
    }),
  )
  updater.on('download-progress', (progress) =>
    set({
      phase: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      message: `Downloading CERMS ${state.version ?? 'update'}…`,
    }),
  )
  updater.on('update-downloaded', (info) =>
    set({
      phase: 'ready',
      version: info.version,
      releaseNotes:
        info.releaseNotes == null && state.version === info.version
          ? state.releaseNotes
          : releaseNotesText(info.releaseNotes, info.version),
      percent: 100,
      message: `CERMS ${info.version} is ready. It will install when you quit, or you can restart now.`,
    }),
  )
  updater.on('update-not-available', () =>
    set({
      phase: 'current',
      version: undefined,
      releaseNotes: undefined,
      percent: undefined,
      message: 'You have the latest version available for this release channel.',
    }),
  )
  updater.on('error', failed)
  return {
    state: () => ({ ...state }),
    check(manual = false): Promise<UpdateState> {
      if (manual) set({ manual: true })
      if (!options.enabled || state.phase === 'ready' || state.phase === 'downloading')
        return Promise.resolve({ ...state })
      if (checking) return checking
      set({
        phase: 'checking',
        manual,
        version: undefined,
        releaseNotes: undefined,
        percent: undefined,
        message: 'Checking for updates…',
      })
      checking = Promise.resolve()
        .then(() => updater.checkForUpdates())
        .then((result) => {
          // Auto-download is asynchronous; handle failures without unhandled rejections.
          if (result?.downloadPromise) void result.downloadPromise.catch(failed)
          if (!result) failed()
          return { ...state }
        })
        .catch(() => {
          failed()
          return { ...state }
        })
        .finally(() => {
          checking = undefined
        })
      return checking
    },
    install() {
      if (!options.enabled || state.phase !== 'ready') return false
      updater.quitAndInstall(false, true)
      return true
    },
  }
}
