export const installationEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/reportInstallation'
export const installationVersion = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 80 &&
  /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(value)
export interface InstallationReport {
  installationId: string
  version: string
  previousVersion: string | null
  device: { hostname: string; platform: string; arch: string; osRelease: string }
}
export function isInstallationRequest(body?: string): boolean {
  try {
    if (!body || body.length > 4096) return false
    const p = JSON.parse(body),
      d = p.data
    return (
      Object.keys(p).join() === 'data' &&
      d &&
      Object.keys(d).sort().join() === 'device,installationId,previousVersion,version' &&
      typeof d.installationId === 'string' &&
      /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(d.installationId) &&
      installationVersion(d.version) &&
      (d.previousVersion === null || installationVersion(d.previousVersion)) &&
      d.device &&
      Object.keys(d.device).sort().join() === 'arch,hostname,osRelease,platform' &&
      Object.entries(d.device).every(
        ([k, v]) =>
          typeof v === 'string' &&
          v.length > 0 &&
          v.length <= (k === 'hostname' ? 255 : 100) &&
          !/[\x00-\x1f\x7f]/.test(v),
      ) &&
      ['win32', 'darwin', 'linux'].includes(d.device.platform)
    )
  } catch {
    return false
  }
}
