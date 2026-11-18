import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { hostname, release } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createInstallationReporter } from './installation-reporting'
import { installationEndpoint } from '../shared/installation-policy'
import { autoUpdater } from 'electron-updater'
import { createUpdateController } from './updates'
import { createServiceStatusMonitor } from './service-status'
import { printReceipt } from './receipt-printing'
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  Menu,
  clipboard,
  dialog,
} from 'electron'
import { allowSystemSwitchAuthorization } from './system-switch-authorization'
import { setWindowMode } from './window-mode'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isTrustedRenderer, rendererAsset } from './security'
import { applicationMenu } from './application-menu'
import packageInfo from '../../package.json'
import type {
  AboutInfo,
  AppInfo,
  BugReportContext,
  BugReportFile,
  BugReportPayload,
} from '../shared/desktop'
import { allowFirebaseRequest, isMemberFileUrl } from '../shared/firebase-policy'
import { loginSupportEndpoint } from '../shared/bug-report-policy'
import { supportFileType } from '../shared/support-files'
import { createAiSupport, ollamaDownloadPage } from './ai-support'
import { validAssistantUser, type AssistantUser } from '../shared/ai-support'
import { createAiConversationOutbox } from './ai-conversation-outbox'
import { aiConversationEndpoint, type AiConversationReason } from '../shared/ai-conversation-policy'

// Keep the new app's local profile separate from CERMS 4, including in development.
app.setName('CERMS 5')
app.setPath('userData', join(app.getPath('appData'), 'CERMS-5'))
protocol.registerSchemesAsPrivileged([
  { scheme: 'cerms', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const appIcon = app.isPackaged
  ? join(process.resourcesPath, 'branding/icon.png')
  : join(app.getAppPath(), 'resources/branding/icon.png')
let mainWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let bugReportWindow: BrowserWindow | null = null
let assistantWindow: BrowserWindow | null = null
let assistantUser: AssistantUser | null = null
let aiConversationOutbox: ReturnType<typeof createAiConversationOutbox> | undefined
const aiSupport = createAiSupport({
  version: app.getVersion(),
  changed: (state) => {
    try {
      aiConversationOutbox?.capture(state.turns, assistantUser)
    } catch {
      state.emailError =
        'This conversation could not be saved for email. Please free disk space and finish the conversation before closing.'
    }
    if (assistantWindow && !assistantWindow.isDestroyed())
      assistantWindow.webContents.send('support-ai:state', state)
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('support-ai:state', { ...state, turns: [] })
  },
})
function finishAiConversation(reason: AiConversationReason) {
  aiSupport.cancel()
  aiConversationOutbox?.capture(aiSupport.state().turns, assistantUser)
  const queued = aiConversationOutbox?.finish(reason) ?? false
  aiSupport.reset(queued ? 'Chat finished.' : undefined)
  void aiConversationOutbox?.flush().catch(() => {})
  return aiSupport.state()
}
let bugReportAuth: { token: string; email: string; uid: string; business: string } | null = null
let loginSupport = false
const bugReportEndpoint = 'https://us-central1-cerms-7af24.cloudfunctions.net/submitBugReport'
const bugReportId = /^[a-zA-Z0-9_-]{1,128}$/
const installationPath = join(app.getPath('userData'), 'installation-tracking.json')
const installationReporter = createInstallationReporter({
  enabled: app.isPackaged,
  version: app.getVersion(),
  device: {
    hostname: hostname() || 'Unnamed device',
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
  },
  read: async () => {
    try {
      return await readFile(installationPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Exclusive creation keeps one identity even if two app processes sign in together.
        try {
          await writeFile(
            installationPath,
            JSON.stringify({
              schemaVersion: 1,
              installationId: randomUUID(),
              version: app.getVersion(),
              previousVersion: null,
              acknowledged: [],
            }),
            { flag: 'wx', mode: 0o600 },
          )
        } catch (creationError) {
          if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') throw creationError
        }
        return readFile(installationPath, 'utf8')
      }
      throw error
    }
  },
  write: async (value) => {
    const temporary = installationPath + `.${process.pid}.tmp`
    await writeFile(temporary, value, { mode: 0o600 })
    await rename(temporary, installationPath)
  },
  post: async (token, data) => {
    const response = await net.fetch(installationEndpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }),
    })
    const result = (await response.json()) as {
      result?: { status: 'sent' | 'pending' | 'review' }
      error?: { status: string }
    }
    if (!response.ok || result.error)
      throw Object.assign(Error('Installation notification not confirmed'), {
        permanent: ['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED'].includes(
          result.error?.status || '',
        ),
      })
    if (!result.result || !['sent', 'pending', 'review'].includes(result.result.status))
      throw Error('Installation notification not confirmed')
    return result.result
  },
})

function aboutInfo(): AboutInfo {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    packaged: app.isPackaged,
    author: packageInfo.author,
  }
}

async function openAssistant(): Promise<void> {
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    if (assistantWindow.isMinimized()) assistantWindow.restore()
    assistantWindow.show()
    assistantWindow.focus()
    return
  }
  const window = new BrowserWindow({
    icon: appIcon,
    width: 780,
    height: 820,
    minWidth: 540,
    minHeight: 620,
    show: false,
    title: 'CERMS Assistant',
    backgroundColor: '#f4f7f5',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  assistantWindow = window
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    try {
      finishAiConversation('window-closed')
    } catch {
      event.preventDefault()
      dialog.showErrorBox(
        'Conversation could not be saved',
        'Free disk space and try closing again. Your chat remains open.',
      )
    }
  })
  window.once('closed', () => {
    if (assistantWindow !== window) return
    assistantWindow = null
    try {
      finishAiConversation('window-closed')
    } catch {
      /* Journal recovers on next launch. */
    }
  })
  try {
    await window.loadURL(
      devUrl ? new URL('assistant.html', devUrl).href : 'cerms://app/assistant.html',
    )
  } catch (error) {
    window.destroy()
    throw error
  }
}

async function openBugReport(
  auth: {
    token: string
    email: string
    uid: string
    business: string
  },
  login = false,
): Promise<void> {
  if (
    (!login &&
      (typeof auth.token !== 'string' ||
        !auth.token ||
        !bugReportId.test(auth.uid) ||
        !bugReportId.test(auth.business))) ||
    typeof auth.email !== 'string' ||
    auth.email.length > 320
  )
    throw new Error('Bug reports require an authenticated staff session.')
  if (
    bugReportWindow &&
    (loginSupport !== login ||
      bugReportAuth?.uid !== auth.uid ||
      bugReportAuth?.business !== auth.business)
  )
    bugReportWindow.destroy()
  loginSupport = login
  bugReportAuth = auth
  if (bugReportWindow && !bugReportWindow.isDestroyed()) {
    if (bugReportWindow.isMinimized()) bugReportWindow.restore()
    bugReportWindow.show()
    bugReportWindow.focus()
    return
  }
  const window = new BrowserWindow({
    icon: appIcon,
    width: 760,
    height: 760,
    minWidth: 620,
    minHeight: 620,
    show: false,
    title: login ? 'Contact support · CERMS' : 'Report a bug · CERMS',
    backgroundColor: '#f5f6f8',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  bugReportWindow = window
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  window.once('closed', () => {
    if (bugReportWindow === window) {
      bugReportWindow = null
      bugReportAuth = null
    }
  })
  try {
    if (devUrl) await window.loadURL(new URL('bug-report.html', devUrl).href)
    else await window.loadURL('cerms://app/bug-report.html')
  } catch (error) {
    window.destroy()
    throw error
  }
}

async function openAbout(): Promise<void> {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    if (aboutWindow.isMinimized()) aboutWindow.restore()
    aboutWindow.show()
    aboutWindow.focus()
    return
  }
  const window = new BrowserWindow({
    icon: appIcon,
    width: 560,
    height: 580,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    title: 'About CERMS',
    backgroundColor: '#f6f7f5',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  aboutWindow = window
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  window.once('closed', () => {
    if (aboutWindow === window) aboutWindow = null
  })
  try {
    if (devUrl) await window.loadURL(new URL('about.html', devUrl).href)
    else await window.loadURL('cerms://app/about.html')
  } catch (error) {
    window.destroy()
    throw error
  }
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    icon: appIcon,
    width: 480,
    height: 680,
    minWidth: 480,
    minHeight: 680,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#f5f6f8',
    title: 'CERMS 5',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  mainWindow = window
  window.webContents.on('did-start-navigation', (event) => {
    if (!event.isMainFrame || event.isSameDocument) return
    const item = Menu.getApplicationMenu()?.getMenuItemById('new-member')
    if (item) item.enabled = false
    const orderItem = Menu.getApplicationMenu()?.getMenuItemById('new-order')
    if (orderItem) orderItem.enabled = false
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    mainWindow = null
    const item = Menu.getApplicationMenu()?.getMenuItemById('new-member')
    if (item) item.enabled = false
    const orderItem = Menu.getApplicationMenu()?.getMenuItemById('new-order')
    if (orderItem) orderItem.enabled = false
    aboutWindow?.close()
    bugReportWindow?.close()
  })
  if (devUrl) await window.loadURL(devUrl)
  else await window.loadURL('cerms://app/index.html')
}

app
  .whenReady()
  .then(async () => {
    if (process.platform === 'darwin') app.dock?.setIcon(appIcon)
    let releaseUpdatesEnabled = false
    if (app.isPackaged) {
      try {
        const metadata = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'))
        releaseUpdatesEnabled =
          metadata.cermsRelease?.updatesEnabled === true &&
          existsSync(join(process.resourcesPath, 'app-update.yml'))
      } catch {
        /* Local previews do not opt into release updates. */
      }
    }
    const updates = createUpdateController(autoUpdater, {
      version: app.getVersion(),
      enabled: releaseUpdatesEnabled && ['darwin', 'win32'].includes(process.platform),
      disabledReason:
        app.isPackaged && process.platform === 'darwin' && !releaseUpdatesEnabled
          ? 'This Mac build uses manual updates. Automatic updates require a signed CERMS release.'
          : undefined,
      changed: (state) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('app:update-state', state)
      },
    })
    // Read-only Firebase access is a user requirement, not just a disabled UI control.
    session.defaultSession.webRequest.onBeforeRequest(
      {
        urls: [
          'https://*.googleapis.com/*',
          'https://us-central1-cerms-7af24.cloudfunctions.net/*',
          'https://*.firebaseio.com/*',
          'https://*.firebasedatabase.app/*',
        ],
      },
      (details, callback) =>
        callback({
          cancel: !allowFirebaseRequest(
            details.url,
            details.method,
            details.url.includes('/accounts:sendOobCode') ||
              details.url.includes('/accounts:update') ||
              details.url.startsWith('https://us-central1-cerms-7af24.cloudfunctions.net/') ||
              new URL(details.url).pathname.endsWith('/documents:commit')
              ? details.uploadData?.map((part) => part.bytes?.toString('utf8') ?? '').join('')
              : undefined,
          ),
        }),
    )
    // Commit bodies are independently narrowed above. Firebase validates the token's
    // signature; this additional gate rejects any other authenticated UID in CERMS.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://firestore.googleapis.com/*'] },
      (details, callback) => {
        if (
          details.method !== 'POST' ||
          !new URL(details.url).pathname.endsWith('/documents:commit')
        )
          return callback({})
        const authorization = Object.entries(details.requestHeaders).find(
          ([key]) => key.toLowerCase() === 'authorization',
        )?.[1]
        callback({ cancel: !allowSystemSwitchAuthorization(authorization) })
      },
    )
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    )
    session.defaultSession.setPermissionCheckHandler(() => false)
    protocol.handle('cerms', (request) => {
      const asset = rendererAsset(join(__dirname, '../renderer'), request.url)
      return asset
        ? net.fetch(pathToFileURL(asset).toString())
        : new Response('Forbidden', { status: 403 })
    })
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        applicationMenu(
          process.platform,
          () => {
            void openAbout().catch((error: unknown) =>
              console.error('Unable to open About CERMS', error),
            )
          },
          !app.isPackaged,
          () => {
            if (
              !mainWindow ||
              mainWindow.isDestroyed() ||
              !Menu.getApplicationMenu()?.getMenuItemById('new-member')?.enabled ||
              !isTrustedRenderer(mainWindow.webContents.getURL(), devUrl)
            )
              return
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.send('member:new')
          },
          () => {
            if (
              mainWindow &&
              !mainWindow.isDestroyed() &&
              Menu.getApplicationMenu()?.getMenuItemById('new-order')?.enabled &&
              isTrustedRenderer(mainWindow.webContents.getURL(), devUrl)
            ) {
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.show()
              mainWindow.focus()
              mainWindow.webContents.send('order:new')
            }
          },
          () => {
            void updates.check(true)
          },
        ),
      ),
    )
    function trustedWindow(
      event: Electron.IpcMainInvokeEvent,
      window: BrowserWindow | null,
    ): boolean {
      return (
        !!window &&
        !window.isDestroyed() &&
        event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame &&
        isTrustedRenderer(event.senderFrame.url, devUrl)
      )
    }
    ipcMain.handle('app:update-state', (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      return updates.state()
    })
    ipcMain.handle('app:update-check', (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      return updates.check(true)
    })
    ipcMain.handle('app:update-install', async (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      if (updates.state().phase !== 'ready') return false
      const result = await dialog.showMessageBox(mainWindow!, {
        type: 'question',
        title: 'Install CERMS update',
        message: 'Install the update and restart CERMS?',
        detail: 'Finish checkout and save any open forms first. You will need to sign in again.',
        buttons: ['Install and restart', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      })
      return result.response === 0 && updates.install()
    })
    const serviceStatus = createServiceStatusMonitor()
    ipcMain.handle('app:service-status', (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      return serviceStatus()
    })
    ipcMain.handle('receipt:printers', async (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      return (await mainWindow!.webContents.getPrintersAsync()).map(({ name, displayName }) => ({
        name,
        displayName,
      }))
    })
    ipcMain.handle('receipt:print', async (event, request: unknown) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      await printReceipt(mainWindow!, request)
    })
    ipcMain.handle('app:open-about', async (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      await openAbout()
    })
    ipcMain.handle('order:new-available', (event, available: unknown) => {
      if (!trustedWindow(event, mainWindow) || typeof available !== 'boolean')
        throw new Error('Untrusted request')
      const item = Menu.getApplicationMenu()?.getMenuItemById('new-order')
      if (item) item.enabled = available
    })
    ipcMain.handle('member:new-available', (event, available: unknown) => {
      if (!trustedWindow(event, mainWindow) || typeof available !== 'boolean')
        throw new Error('Untrusted request')
      const item = Menu.getApplicationMenu()?.getMenuItemById('new-member')
      if (item) item.enabled = available
    })
    ipcMain.handle('app:about-info', (event): AboutInfo => {
      if (!trustedWindow(event, aboutWindow)) throw new Error('Untrusted request')
      return aboutInfo()
    })
    ipcMain.handle('app:close-about', (event) => {
      if (!trustedWindow(event, aboutWindow)) throw new Error('Untrusted request')
      aboutWindow?.close()
    })
    ipcMain.handle('app:copy-about-info', (event) => {
      if (!trustedWindow(event, aboutWindow)) throw new Error('Untrusted request')
      const info = aboutInfo()
      clipboard.writeText(
        `CERMS ${info.version}\nPlatform: ${info.platform} (${process.arch})\nElectron: ${info.electron}\n${info.author}`,
      )
    })
    ipcMain.handle('app:window-mode', async (event, mode: unknown) => {
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame ||
        !isTrustedRenderer(event.senderFrame.url, devUrl) ||
        (mode !== 'login' && mode !== 'workspace')
      )
        throw new Error('Untrusted request')
      await setWindowMode(mainWindow, mode)
    })
    ipcMain.handle('app:report-installation', async (event, token: unknown) => {
      if (
        !trustedWindow(event, mainWindow) ||
        typeof token !== 'string' ||
        !token ||
        token.length > 20000
      )
        throw Error('Untrusted installation report')
      try {
        return await installationReporter.report(token)
      } catch {
        console.warn('Installation notification remains pending; it will retry after sign-in.')
        return 'pending'
      }
    })
    ipcMain.handle('app:info', (event): AppInfo => {
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame ||
        !isTrustedRenderer(event.senderFrame.url, devUrl)
      )
        throw new Error('Untrusted request')
      return {
        version: app.getVersion(),
        electron: process.versions.electron,
        platform: process.platform,
        packaged: app.isPackaged,
      }
    })
    ipcMain.handle('member:open-file', async (event, url: unknown) => {
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame ||
        !isTrustedRenderer(event.senderFrame.url, devUrl) ||
        typeof url !== 'string' ||
        !isMemberFileUrl(url)
      ) {
        throw new Error('This attachment cannot be opened by CERMS.')
      }
      await shell.openExternal(url)
    })
    ipcMain.handle('bug-report:open', async (event, auth: unknown) => {
      if (!trustedWindow(event, mainWindow) || !auth || typeof auth !== 'object')
        throw new Error('Untrusted request')
      await openBugReport(auth as { token: string; email: string; uid: string; business: string })
    })
    ipcMain.handle('bug-report:open-login', async (event, email: unknown) => {
      if (
        !trustedWindow(event, mainWindow) ||
        (email !== undefined && (typeof email !== 'string' || email.length > 320))
      )
        throw new Error('Untrusted support request')
      await openBugReport(
        { token: '', email: typeof email === 'string' ? email : '', uid: '', business: '' },
        true,
      )
    })
    ipcMain.handle('assistant:open', async (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      await openAssistant()
    })
    ipcMain.handle('assistant:context', (event) => {
      if (!trustedWindow(event, assistantWindow)) throw new Error('Untrusted request')
      return { user: assistantUser, version: app.getVersion() }
    })
    ipcMain.handle('assistant:close', (event) => {
      if (!trustedWindow(event, assistantWindow)) throw new Error('Untrusted request')
      assistantWindow?.close()
    })
    ipcMain.handle('assistant:user', (event, user: unknown) => {
      if (!trustedWindow(event, mainWindow) || !(user === null || validAssistantUser(user)))
        throw new Error('Untrusted assistant context')
      if (assistantUser?.uid !== user?.uid || assistantUser?.business !== user?.business) {
        finishAiConversation('session-changed')
        assistantWindow?.close()
      }
      assistantUser = user === null ? null : { ...user }
    })
    ipcMain.handle('support-ai:remove', async (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      if (aiSupport.state().busy)
        throw new Error('Finish or cancel the current assistant operation first.')
      const choice = await dialog.showMessageBox(mainWindow!, {
        type: 'question',
        title: 'Remove CERMS Assistant download?',
        message: 'Remove the CERMS Assistant model from this computer?',
        detail:
          'Ollama and other models stay installed. Other apps using this same model will need to download it again.',
        buttons: ['Cancel', 'Remove download'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (choice.response !== 1) return { ...aiSupport.state(), turns: [] }
      const state = await aiSupport.remove()
      if (!state.modelReady && !state.error) finishAiConversation('model-removed')
      return { ...aiSupport.state(), turns: [] }
    })
    ipcMain.handle('support-ai:state', async (event) => {
      if (!trustedWindow(event, assistantWindow) && !trustedWindow(event, mainWindow))
        throw new Error('Untrusted request')
      const state = await aiSupport.check()
      return trustedWindow(event, mainWindow) ? { ...state, turns: [] } : state
    })
    ipcMain.handle('support-ai:setup', async (event) => {
      if (!trustedWindow(event, assistantWindow)) throw new Error('Untrusted request')
      const state = await aiSupport.check()
      // Only the user-triggered setup action opens the official runtime download page.
      // CERMS never silently executes a downloaded installer or arbitrary shell command.
      if (state.runtime === 'missing') {
        await shell.openExternal(ollamaDownloadPage(process.platform))
        return aiSupport.state()
      }
      if (state.runtime !== 'available' || state.busy) return state
      return aiSupport.download()
    })
    ipcMain.handle('support-ai:ask', async (event, question: unknown) => {
      if (!trustedWindow(event, assistantWindow)) throw new Error('Untrusted request')
      if (!aiConversationOutbox)
        throw new Error(
          'AI conversation email storage is unavailable. You can still submit a ticket.',
        )
      return aiSupport.ask(question)
    })
    ipcMain.handle('support-ai:cancel', (event) => {
      if (!trustedWindow(event, assistantWindow)) throw new Error('Untrusted request')
      return aiSupport.cancel()
    })
    ipcMain.handle('support-ai:reset', (event) => {
      if (!trustedWindow(event, assistantWindow)) throw new Error('Untrusted request')
      return finishAiConversation('new-conversation')
    })
    ipcMain.handle('support-ai:finish', (event) => {
      if (!trustedWindow(event, assistantWindow)) throw new Error('Untrusted request')
      return finishAiConversation('end-button')
    })
    ipcMain.handle('bug-report:context', async (event): Promise<BugReportContext> => {
      if (!trustedWindow(event, bugReportWindow) || !bugReportAuth || !mainWindow)
        throw new Error('Bug report session is unavailable.')
      let logs: string[] = []
      try {
        const result: unknown = await mainWindow.webContents.executeJavaScript(
          'typeof window.__cermsDiagnostics === "function" ? window.__cermsDiagnostics() : []',
          true,
        )
        if (Array.isArray(result))
          logs = result.filter((item): item is string => typeof item === 'string').slice(-100)
      } catch {
        logs = ['Unable to read renderer diagnostics.']
      }
      return {
        ...(loginSupport ? { mode: 'login' as const } : {}),
        email: bugReportAuth.email,
        uid: bugReportAuth.uid,
        business: bugReportAuth.business,
        version: app.getVersion(),
        platform: process.platform,
        electron: process.versions.electron,
        logs,
      }
    })
    ipcMain.handle('bug-report:capture-main', async (event): Promise<BugReportFile> => {
      if (!trustedWindow(event, bugReportWindow) || !mainWindow)
        throw new Error('The main CERMS window is unavailable.')
      const image = await mainWindow.webContents.capturePage()
      const base64 = image.toJPEG(80).toString('base64')
      return {
        name: `cerms-main-${Date.now()}.jpg`,
        contentType: 'image/jpeg',
        base64,
        size: Buffer.byteLength(base64, 'base64'),
      }
    })
    ipcMain.handle('bug-report:choose-files', async (event): Promise<BugReportFile[]> => {
      if (!trustedWindow(event, bugReportWindow)) throw new Error('Untrusted request')
      const result = await dialog.showOpenDialog(bugReportWindow!, {
        title: 'Attach bug-report files',
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled) return []
      const files: BugReportFile[] = []
      let total = 0
      for (const path of result.filePaths.slice(0, 10)) {
        const data = await readFile(path)
        if (data.byteLength > 8 * 1024 * 1024 || total + data.byteLength > 8 * 1024 * 1024)
          throw new Error('Screenshots and attachments must total no more than 8 MB.')
        total += data.byteLength
        files.push({
          name: path.split(/[\\/]/).pop() || 'attachment',
          contentType: supportFileType(path),
          base64: data.toString('base64'),
          size: data.byteLength,
        })
      }
      return files
    })
    ipcMain.handle('bug-report:submit', async (event, payload: unknown) => {
      if (!trustedWindow(event, bugReportWindow) || !bugReportAuth)
        throw new Error('Bug report session is unavailable.')
      if (!payload || typeof payload !== 'object') throw new Error('Invalid bug report.')
      const report = payload as BugReportPayload
      if (
        !Array.isArray(report.files) ||
        !Array.isArray(report.screenshots) ||
        report.files.length > 10 ||
        report.screenshots.length > 5 ||
        [...report.files, ...report.screenshots].reduce((sum, file) => sum + file.size, 0) >
          8 * 1024 * 1024
      )
        throw new Error('Use at most 10 files and 5 screenshots, totaling no more than 8 MB.')
      const response = await net.fetch(loginSupport ? loginSupportEndpoint : bugReportEndpoint, {
        method: 'POST',
        headers: {
          ...(!loginSupport ? { Authorization: `Bearer ${bugReportAuth.token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: payload as BugReportPayload }),
      })
      const result = (await response.json()) as {
        result?: { reportId?: string }
        error?: { message?: string }
      }
      if (!response.ok || !result.result?.reportId)
        throw new Error(result.error?.message || 'Bug report could not be sent. Please retry.')
      return result.result
    })
    ipcMain.handle('bug-report:close', (event) => {
      if (!trustedWindow(event, bugReportWindow)) throw new Error('Untrusted request')
      bugReportWindow?.close()
    })
    const aiOutboxPath = join(app.getPath('userData'), 'ai-support-email-outbox.json')
    try {
      aiConversationOutbox = createAiConversationOutbox({
        version: app.getVersion(),
        platform: process.platform,
        device: hostname() || 'Unnamed device',
        read: () => {
          try {
            return readFileSync(aiOutboxPath, 'utf8')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
            throw error
          }
        },
        write: (text) => {
          mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 })
          const temporary = aiOutboxPath + '.' + randomUUID() + '.tmp'
          try {
            writeFileSync(temporary, text, {
              encoding: 'utf8',
              mode: 0o600,
              flag: 'wx',
              flush: true,
            })
            renameSync(temporary, aiOutboxPath)
          } catch (error) {
            try {
              unlinkSync(temporary)
            } catch {
              /* Preserve the existing journal. */
            }
            throw error
          }
        },
        post: async (data) => {
          const response = await net.fetch(aiConversationEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
            signal: AbortSignal.timeout(60000),
          })
          const result = (await response.json()) as { result?: { status?: string } }
          if (!response.ok || !['sent', 'review'].includes(result.result?.status ?? ''))
            throw new Error('Conversation email is pending.')
          return result.result!.status as 'sent' | 'review'
        },
      })
    } catch {
      console.error('AI conversation email storage needs review; existing files were preserved.')
    }
    void aiConversationOutbox?.flush().catch(() => {})
    const aiEmailRetry = setInterval(() => {
      void aiConversationOutbox?.flush().catch(() => {})
    }, 60000)
    aiEmailRetry.unref()
    let finishingQuit = false
    app.on('before-quit', (event) => {
      if (finishingQuit) return
      try {
        finishAiConversation('application-quit')
      } catch {
        event.preventDefault()
        dialog.showErrorBox(
          'AI conversation could not be saved',
          'Free disk space and try quitting again.',
        )
        return
      }
      if (!aiConversationOutbox?.pending()) {
        clearInterval(aiEmailRetry)
        return
      }
      event.preventDefault()
      finishingQuit = true
      clearInterval(aiEmailRetry)
      let deadline: ReturnType<typeof setTimeout>
      void Promise.race([
        aiConversationOutbox.flush(),
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, 8000)
        }),
      ])
        .catch(() => {})
        .finally(() => {
          clearTimeout(deadline)
          app.quit()
        })
    })
    await createWindow()
    const startupUpdate = setTimeout(() => {
      void updates.check()
    }, 15000)
    const updateInterval = setInterval(
      () => {
        void updates.check()
      },
      (app.getVersion().includes('-') ? 5 * 60 : 4 * 60 * 60) * 1000,
    )
    startupUpdate.unref()
    updateInterval.unref()
    app.once('before-quit', () => {
      clearTimeout(startupUpdate)
      clearInterval(updateInterval)
    })
    app.on('activate', () => {
      if (!mainWindow) void createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('Unable to start CERMS 5', error)
    app.quit()
  })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
