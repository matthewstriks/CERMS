import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/desktop'

const api: DesktopApi = {
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
  openMemberFile: (url) => ipcRenderer.invoke('member:open-file', url),
}
contextBridge.exposeInMainWorld('desktop', Object.freeze(api))
