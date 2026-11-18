import { randomUUID } from 'node:crypto'
import { installationVersion, type InstallationReport } from '../shared/installation-policy'
type State = {
  schemaVersion: 1
  installationId: string
  version: string
  previousVersion: string | null
  acknowledged: string[]
}
export type InstallationStatus = 'sent' | 'review' | 'pending' | 'disabled'
export function createInstallationReporter(options: {
  enabled: boolean
  version: string
  device: InstallationReport['device']
  read(): Promise<string | null>
  write(value: string): Promise<void>
  post(token: string, data: InstallationReport): Promise<{ status: 'sent' | 'review' | 'pending' }>
  wait?(ms: number): Promise<void>
}) {
  let inFlight: Promise<InstallationStatus> | undefined
  async function attempt(token: string): Promise<InstallationStatus> {
    if (!options.enabled) return 'disabled'
    if (!installationVersion(options.version)) throw Error('Invalid installed version')
    const raw = await options.read()
    let state: State
    if (raw === null)
      state = {
        schemaVersion: 1,
        installationId: randomUUID(),
        version: options.version,
        previousVersion: null,
        acknowledged: [],
      }
    else {
      state = JSON.parse(raw) as State
      if (
        state.schemaVersion !== 1 ||
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(state.installationId) ||
        !installationVersion(state.version) ||
        !(state.previousVersion === null || installationVersion(state.previousVersion)) ||
        !Array.isArray(state.acknowledged) ||
        !state.acknowledged.every(installationVersion)
      )
        throw Error('Installation record needs review; identity was not reset')
      if (state.version !== options.version) {
        state.previousVersion = state.version
        state.version = options.version
      }
    }
    if (state.acknowledged.includes(options.version)) return 'sent'
    await options.write(JSON.stringify(state))
    const data: InstallationReport = {
      installationId: state.installationId,
      version: options.version,
      previousVersion: state.previousVersion,
      device: options.device,
    }
    const wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await options.post(token, data)
        if (result.status === 'sent' || result.status === 'review') {
          state.acknowledged = [...new Set([...state.acknowledged, options.version])].slice(-200)
          await options.write(JSON.stringify(state))
          return result.status
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'permanent' in error && error.permanent)
          throw error
      }
      if (attempt < 2) await wait(attempt === 0 ? 2000 : 10000)
    }
    return 'pending'
  }
  return {
    report(token: string): Promise<InstallationStatus> {
      if (inFlight) return inFlight
      inFlight = attempt(token).finally(() => {
        inFlight = undefined
      })
      return inFlight
    },
  }
}
