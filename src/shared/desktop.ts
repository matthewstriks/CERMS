export interface AppInfo {
  version: string
  electron: string
  platform: string
  packaged: boolean
}
export interface AboutInfo extends AppInfo {
  author: string
}
export interface DesktopApi {
  openAbout(): Promise<void>
  getAboutInfo(): Promise<AboutInfo>
  closeAbout(): Promise<void>
  copyAboutInfo(): Promise<void>
  setWindowMode(mode: 'login' | 'workspace'): Promise<void>
  getAppInfo(): Promise<AppInfo>
  openMemberFile(url: string): Promise<void>
}
