import { describe, it, expect } from 'vitest'
import { createInstallationReporter } from '../src/main/installation-reporting'
import { installationEndpoint, isInstallationRequest } from '../src/shared/installation-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
const device = { hostname: 'Matt-Laptop', platform: 'win32', arch: 'x64', osRelease: '10.0.26100' }
function fixture() {
  let stored: string | null = null
  const calls: unknown[] = []
  const options = {
    enabled: true,
    version: '5.0.0-alpha.9',
    device,
    read: async () => stored,
    write: async (value: string) => {
      stored = value
    },
    post: async (token: string, data: unknown) => {
      calls.push({ token, data })
      return { status: 'sent' as const }
    },
    wait: async () => {},
  }
  return {
    options,
    calls,
    stored: () => stored,
    set: (value: string) => {
      stored = value
    },
  }
}
describe('installation confirmations', () => {
  it('reports each device/version once, preserves identity through upgrades/restarts and never stores auth tokens', async () => {
    const f = fixture(),
      controller = createInstallationReporter(f.options)
    await Promise.all([controller.report('secret-token'), controller.report('another-token')])
    await createInstallationReporter(f.options).report('ben-token')
    expect(f.calls).toHaveLength(1)
    const first = JSON.parse(f.stored()!)
    expect(f.stored()).not.toContain('token')
    await createInstallationReporter({ ...f.options, version: '5.0.0-alpha.10' }).report(
      'ben-token',
    )
    const next = JSON.parse(f.stored()!)
    expect(next.installationId).toBe(first.installationId)
    expect(next.previousVersion).toBe('5.0.0-alpha.9')
    expect(f.calls).toHaveLength(2)
    const other = fixture()
    await createInstallationReporter(other.options).report('ben-token')
    expect(JSON.parse(other.stored()!).installationId).not.toBe(first.installationId)
  })
  it('retries a lost response with the same event and leaves exhausted attempts for a later login', async () => {
    const f = fixture()
    let attempts = 0
    const controller = createInstallationReporter({
      ...f.options,
      post: async (_token, data) => {
        f.calls.push(data)
        if (++attempts === 1) throw Error('lost response')
        return { status: 'sent' }
      },
    })
    expect(await controller.report('secret')).toBe('sent')
    expect(f.calls[0]).toEqual(f.calls[1])
    const pending = fixture()
    expect(
      await createInstallationReporter({
        ...pending.options,
        post: async () => {
          throw Error('offline')
        },
      }).report('secret'),
    ).toBe('pending')
    expect(JSON.parse(pending.stored()!).acknowledged).toEqual([])
  })
  it('does nothing in development and never resets a corrupt identity or permits forged actor fields', async () => {
    const f = fixture()
    expect(
      await createInstallationReporter({ ...f.options, enabled: false }).report('secret'),
    ).toBe('disabled')
    expect(f.stored()).toBe(null)
    expect(f.calls).toHaveLength(0)
    f.set('{broken')
    await expect(createInstallationReporter(f.options).report('secret')).rejects.toThrow()
    expect(f.stored()).toBe('{broken')
    expect(f.calls).toHaveLength(0)
    const data = {
      installationId: '10000000-0000-4000-8000-000000000001',
      version: f.options.version,
      previousVersion: null,
      device,
    }
    const body = JSON.stringify({ data })
    expect(isInstallationRequest(body)).toBe(true)
    expect(allowFirebaseRequest(installationEndpoint, 'POST', body)).toBe(true)
    expect(allowFirebaseRequest(installationEndpoint + '?extra=1', 'POST', body)).toBe(false)
    expect(
      isInstallationRequest(JSON.stringify({ data: { ...data, email: 'forged@example.com' } })),
    ).toBe(false)
  })
})
