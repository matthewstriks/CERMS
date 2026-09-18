import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/desktop'

const api: DesktopApi = {
  openAbout: () => ipcRenderer.invoke('app:open-about'),
  getAboutInfo: () => ipcRenderer.invoke('app:about-info'),
  closeAbout: () => ipcRenderer.invoke('app:close-about'),
  copyAboutInfo: () => ipcRenderer.invoke('app:copy-about-info'),
  setWindowMode: (mode) => ipcRenderer.invoke('app:window-mode', mode),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openMemberFile: (url) => ipcRenderer.invoke('member:open-file', url),
}
contextBridge.exposeInMainWorld('desktop', Object.freeze(api))
