export type UpdatePhase =
  'disabled' | 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error'
export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  version?: string
  percent?: number
  message: string
  manual: boolean
}
