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
} from 'electron'
import { allowSystemSwitchAuthorization } from './system-switch-authorization'
import { setWindowMode } from './window-mode'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isTrustedRenderer, rendererAsset } from './security'
import { applicationMenu } from './application-menu'
import packageInfo from '../../package.json'
import type { AboutInfo, AppInfo } from '../shared/desktop'
import { allowFirebaseRequest, isMemberFileUrl } from '../shared/firebase-policy'

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

function aboutInfo(): AboutInfo {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    packaged: app.isPackaged,
    author: packageInfo.author,
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
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    mainWindow = null
    aboutWindow?.close()
  })
  if (devUrl) await window.loadURL(devUrl)
  else await window.loadURL('cerms://app/index.html')
}

app
  .whenReady()
  .then(async () => {
    if (process.platform === 'darwin') app.dock?.setIcon(appIcon)
    // Read-only Firebase access is a user requirement, not just a disabled UI control.
    session.defaultSession.webRequest.onBeforeRequest(
      {
        urls: [
          'https://*.googleapis.com/*',
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
    ipcMain.handle('app:open-about', async (event) => {
      if (!trustedWindow(event, mainWindow)) throw new Error('Untrusted request')
      await openAbout()
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
    await createWindow()
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
