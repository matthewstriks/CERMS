import { expect, it, vi } from 'vitest'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import {
  notificationSoundEndpoint,
  validNotificationSoundPreference,
  defaultNotificationSoundPreference,
} from '../src/shared/notification-sound-policy'
import { createNotificationAudio } from '../src/renderer/src/lib/notification-audio'
it('allows only bounded own-setting callable payloads and keeps direct profile/legacy/Auth writes denied', () => {
  expect(defaultNotificationSoundPreference).toEqual({ enabled: true, volume: 100 })
  for (const volume of [0, 50, 100])
    expect(
      allowFirebaseRequest(
        notificationSoundEndpoint,
        'POST',
        JSON.stringify({ data: { enabled: true, volume } }),
      ),
    ).toBe(true)
  for (const bad of [
    null,
    {},
    [],
    { enabled: true, volume: -1 },
    { enabled: true, volume: 101 },
    { enabled: true, volume: 0.5 },
    { enabled: true, volume: '50' },
    { enabled: true, volume: 50, uid: 'other' },
  ]) {
    expect(validNotificationSoundPreference(bad)).toBe(false)
    expect(
      allowFirebaseRequest(notificationSoundEndpoint, 'POST', JSON.stringify({ data: bad })),
    ).toBe(false)
  }
  expect(allowFirebaseRequest(notificationSoundEndpoint, 'GET')).toBe(false)
  expect(allowFirebaseRequest(notificationSoundEndpoint + '?x=1', 'POST', '{}')).toBe(false)
  expect(
    allowFirebaseRequest(
      'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
      'POST',
      JSON.stringify({
        writes: [
          {
            update: {
              name: 'projects/cerms-7af24/databases/cerms/documents/users/staff',
              fields: {
                notificationSoundPreference: {
                  mapValue: {
                    fields: { enabled: { booleanValue: true }, volume: { integerValue: '50' } },
                  },
                },
              },
            },
            updateMask: { fieldPaths: ['notificationSoundPreference'] },
            currentDocument: { exists: true },
          },
        ],
      }),
    ),
  ).toBe(false)
})
function fakeAudio() {
  const gains: any[] = [],
    oscillators: any[] = []
  const context = {
    state: 'running',
    currentTime: 1,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createOscillator: () => {
      const o = {
        type: '',
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      }
      oscillators.push(o)
      return o
    },
    createGain: () => {
      const g = {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      gains.push(g)
      return g
    },
  }
  return { context, gains, oscillators }
}
it('synthesizes a bounded two-note chime at the selected volume without hardware audio, coalesces bursts and supports explicit previews', async () => {
  const f = fakeAudio()
  let now = 0
  const audio = createNotificationAudio(
    () => f.context as unknown as AudioContext,
    () => now,
  )
  expect(await audio.play(0)).toBe(false)
  expect(await audio.play(101)).toBe(false)
  expect(f.oscillators).toHaveLength(0)
  expect(await audio.play(50)).toBe(true)
  expect(f.oscillators.map((o) => o.frequency.value)).toEqual([660, 880])
  expect(f.gains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0375, 1.02)
  expect(await audio.play(50)).toBe(false)
  expect(await audio.play(100, true)).toBe(true)
  expect(f.gains[2].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.15, 1.02)
  now = 1000
  expect(await audio.play(50)).toBe(true)
  audio.dispose()
  expect(f.context.close).toHaveBeenCalledOnce()
})
it('drops automatic audio while blocked rather than replaying old alerts on later interaction, and handles unavailable output', async () => {
  const f = fakeAudio()
  f.context.state = 'suspended'
  const audio = createNotificationAudio(() => f.context as unknown as AudioContext)
  expect(await audio.play(50)).toBe(false)
  expect(f.oscillators).toHaveLength(0)
  f.context.state = 'running'
  await audio.unlock()
  expect(f.oscillators).toHaveLength(0)
  audio.dispose()
  expect(
    await createNotificationAudio(() => {
      throw new Error('No device')
    }).play(50, true),
  ).toBe(false)
})

it('cancels pending preview playback when the account changes or sounds are disabled', async () => {
  const f = fakeAudio()
  f.context.state = 'suspended'
  let resume!: () => void
  f.context.resume = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resume = resolve
      }),
  )
  const audio = createNotificationAudio(() => f.context as unknown as AudioContext)
  const pending = audio.play(50, true)
  audio.stop()
  f.context.state = 'running'
  resume()
  expect(await pending).toBe(false)
  expect(f.oscillators).toHaveLength(0)
  audio.dispose()
})

it('uses a distinct descending error tone and prioritizes an error over a recent normal notification', async () => {
  const f = fakeAudio()
  let now = 0
  const audio = createNotificationAudio(
    () => f.context as unknown as AudioContext,
    () => now,
  )
  expect(await audio.play(50)).toBe(true)
  now = 100
  expect(await audio.play(50, false, 'error')).toBe(true)
  expect(f.oscillators.slice(2).map((o) => o.frequency.value)).toEqual([440, 294])
  expect(f.oscillators.slice(2).map((o) => o.type)).toEqual(['triangle', 'triangle'])
  expect(f.oscillators[0].stop).toHaveBeenCalledWith()
  expect(f.gains[2].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0375, 1.02)
  expect(await audio.play(50, false, 'error')).toBe(false)
  expect(await audio.play(50, false, 'message')).toBe(false)
  expect(await audio.play(0, true, 'error')).toBe(false)
  expect(await audio.play(25, true, 'error')).toBe(true)
  now = 1000
  expect(await audio.play(50, false, 'message')).toBe(true)
  expect(f.oscillators.slice(-2).map((o) => o.frequency.value)).toEqual([660, 880])
  audio.dispose()
})
