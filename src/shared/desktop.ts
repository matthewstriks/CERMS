import type { UpdateState } from './updates'
import type { ServiceStatus } from './service-status'
import type { AiSupportState, AssistantUser } from './ai-support'
export interface AppInfo {
  version: string
  electron: string
  platform: string
  packaged: boolean
}
export interface AboutInfo extends AppInfo {
  author: string
}
export interface BugReportFile {
  name: string
  contentType: string
  base64: string
  size: number
}
export interface BugReportContext {
  mode?: 'login'
  email: string
  uid: string
  business: string
  version: string
  platform: string
  electron: string
  logs: string[]
}
export interface BugReportPayload {
  replyEmail?: string
  requestId: string
  subject: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  message: string
  context: BugReportContext
  screenshots: BugReportFile[]
  files: BugReportFile[]
}
export interface DesktopApi {
  openAssistant(): Promise<void>
  closeAssistant(): Promise<void>
  setAssistantUser(user: AssistantUser | null): Promise<void>
  getAssistantContext(): Promise<{ user: AssistantUser | null; version: string }>
  removeAiSupport(): Promise<AiSupportState>
  getAiSupportState(): Promise<AiSupportState>
  setupAiSupport(): Promise<AiSupportState>
  askAiSupport(question: string): Promise<AiSupportState>
  cancelAiSupport(): Promise<AiSupportState>
  resetAiSupport(): Promise<AiSupportState>
  finishAiSupport(): Promise<AiSupportState>
  onAiSupportState(callback: (state: AiSupportState) => void): () => void
  reportInstallation(token: string): Promise<string>
  getUpdateState(): Promise<UpdateState>
  onUpdateState(callback: (state: UpdateState) => void): () => void
  checkForUpdates(): Promise<UpdateState>
  installUpdate(): Promise<boolean>
  getServiceStatus(): Promise<ServiceStatus>
  onNewOrder(callback: () => void): () => void
  setNewOrderAvailable(available: boolean): Promise<void>
  receiptPrinters(): Promise<{ name: string; displayName: string }[]>
  printReceipt(request: { text: string; printer: string; width: 58 | 80 }): Promise<void>
  onNewMember(callback: () => void): () => void
  setNewMemberAvailable(available: boolean): Promise<void>
  openAbout(): Promise<void>
  getAboutInfo(): Promise<AboutInfo>
  closeAbout(): Promise<void>
  copyAboutInfo(): Promise<void>
  setWindowMode(mode: 'login' | 'workspace'): Promise<void>
  getAppInfo(): Promise<AppInfo>
  openMemberFile(url: string): Promise<void>
  openBugReport(auth: {
    token: string
    email: string
    uid: string
    business: string
  }): Promise<void>
  openLoginSupport(email?: string): Promise<void>
  getBugReportContext(): Promise<BugReportContext>
  captureMainWindow(): Promise<BugReportFile>
  chooseBugFiles(): Promise<BugReportFile[]>
  submitBugReport(payload: BugReportPayload): Promise<{ reportId: string }>
  closeBugReport(): Promise<void>
}
