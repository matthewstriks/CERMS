import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/desktop'

const api: DesktopApi = {
  openAssistant: () => ipcRenderer.invoke('assistant:open'),
  closeAssistant: () => ipcRenderer.invoke('assistant:close'),
  setAssistantUser: (user) => ipcRenderer.invoke('assistant:user', user),
  getAssistantContext: () => ipcRenderer.invoke('assistant:context'),
  removeAiSupport: () => ipcRenderer.invoke('support-ai:remove'),
  getAiSupportState: () => ipcRenderer.invoke('support-ai:state'),
  setupAiSupport: () => ipcRenderer.invoke('support-ai:setup'),
  askAiSupport: (question) => ipcRenderer.invoke('support-ai:ask', question),
  cancelAiSupport: () => ipcRenderer.invoke('support-ai:cancel'),
  resetAiSupport: () => ipcRenderer.invoke('support-ai:reset'),
  finishAiSupport: () => ipcRenderer.invoke('support-ai:finish'),
  onAiSupportState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: import('../shared/ai-support').AiSupportState,
    ) => callback(state)
    ipcRenderer.on('support-ai:state', listener)
    return () => ipcRenderer.removeListener('support-ai:state', listener)
  },
  getUpdateState: () => ipcRenderer.invoke('app:update-state'),
  checkForUpdates: () => ipcRenderer.invoke('app:update-check'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),
  onUpdateState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: import('../shared/updates').UpdateState,
    ) => callback(state)
    ipcRenderer.on('app:update-state', listener)
    return () => ipcRenderer.removeListener('app:update-state', listener)
  },
  getServiceStatus: () => ipcRenderer.invoke('app:service-status'),
  onNewOrder: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('order:new', listener)
    return () => ipcRenderer.removeListener('order:new', listener)
  },
  setNewOrderAvailable: (available) => ipcRenderer.invoke('order:new-available', available),
  receiptPrinters: () => ipcRenderer.invoke('receipt:printers'),
  printReceipt: (request) => ipcRenderer.invoke('receipt:print', request),
  onNewMember: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('member:new', listener)
    return () => ipcRenderer.removeListener('member:new', listener)
  },
  setNewMemberAvailable: (available) => ipcRenderer.invoke('member:new-available', available),
  openAbout: () => ipcRenderer.invoke('app:open-about'),
  getAboutInfo: () => ipcRenderer.invoke('app:about-info'),
  closeAbout: () => ipcRenderer.invoke('app:close-about'),
  copyAboutInfo: () => ipcRenderer.invoke('app:copy-about-info'),
  setWindowMode: (mode) => ipcRenderer.invoke('app:window-mode', mode),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  reportInstallation: (token) => ipcRenderer.invoke('app:report-installation', token),
  openMemberFile: (url) => ipcRenderer.invoke('member:open-file', url),
  openBugReport: (auth) => ipcRenderer.invoke('bug-report:open', auth),
  openLoginSupport: (email) => ipcRenderer.invoke('bug-report:open-login', email),
  getBugReportContext: () => ipcRenderer.invoke('bug-report:context'),
  captureMainWindow: () => ipcRenderer.invoke('bug-report:capture-main'),
  chooseBugFiles: () => ipcRenderer.invoke('bug-report:choose-files'),
  submitBugReport: (payload) => ipcRenderer.invoke('bug-report:submit', payload),
  closeBugReport: () => ipcRenderer.invoke('bug-report:close'),
}
contextBridge.exposeInMainWorld('desktop', Object.freeze(api))
