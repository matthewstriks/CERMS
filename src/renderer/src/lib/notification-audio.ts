export type NotificationSoundKind = 'message' | 'notification' | 'error'
// Local synthesized tones only: no media downloads, telemetry or native audio privileges.
export function createNotificationAudio(
  factory = () => new AudioContext(),
  now = () => Date.now(),
) {
  let context: AudioContext | null = null,
    lastAutomatic = -Infinity,
    lastAutomaticKind: NotificationSoundKind | null = null,
    generation = 0
  const playing = new Set<OscillatorNode>()
  function get() {
    if (!context || context.state === 'closed') context = factory()
    return context
  }
  const stop = () => {
    for (const node of playing) {
      try {
        node.stop()
        node.disconnect()
      } catch {
        /* already stopped */
      }
    }
    playing.clear()
  }
  return {
    async unlock() {
      try {
        const c = get()
        if (c.state === 'suspended') await c.resume()
      } catch {
        /* Test sound can report unavailable audio. */
      }
    },
    stop() {
      generation++
      stop()
    },
    async play(
      volume: number,
      preview = false,
      kind: NotificationSoundKind = 'notification',
    ): Promise<boolean> {
      if (
        !Number.isInteger(volume) ||
        volume <= 0 ||
        volume > 100 ||
        (!preview &&
          now() - lastAutomatic < 750 &&
          !(kind === 'error' && lastAutomaticKind !== 'error'))
      )
        return false
      const currentGeneration = generation
      try {
        const c = get()
        if (c.state !== 'running') {
          if (!preview) {
            void c.resume().catch(() => {})
            return false
          }
          let timeout: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              c.resume(),
              new Promise((resolve) => {
                timeout = setTimeout(resolve, 1200)
              }),
            ])
          } finally {
            if (timeout !== undefined) clearTimeout(timeout)
          }
        }
        if (c.state !== 'running' || generation !== currentGeneration) return false
        stop()
        const start = c.currentTime,
          level = 0.15 * (volume / 100) ** 2
        const notes =
          kind === 'error'
            ? [
                [0, 440],
                [0.16, 294],
              ]
            : [
                [0, 660],
                [0.15, 880],
              ]
        for (const [offset, frequency] of notes) {
          const oscillator = c.createOscillator(),
            gain = c.createGain(),
            time = start + offset!
          oscillator.type = kind === 'error' ? 'triangle' : 'sine'
          oscillator.frequency.value = frequency!
          gain.gain.setValueAtTime(0.0001, time)
          gain.gain.exponentialRampToValueAtTime(level, time + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24)
          oscillator.connect(gain)
          gain.connect(c.destination)
          playing.add(oscillator)
          oscillator.onended = () => {
            playing.delete(oscillator)
            oscillator.disconnect()
            gain.disconnect()
          }
          oscillator.start(time)
          oscillator.stop(time + 0.25)
        }
        if (!preview) {
          lastAutomatic = now()
          lastAutomaticKind = kind
        }
        return true
      } catch {
        return false
      }
    },
    dispose() {
      generation++
      stop()
      const previous = context
      context = null
      lastAutomatic = -Infinity
      lastAutomaticKind = null
      void previous?.close().catch(() => {})
    },
  }
}
export const notificationAudio = createNotificationAudio()
export function requestNotificationSound(kind: NotificationSoundKind = 'notification') {
  window.dispatchEvent(new CustomEvent('cerms:notification-sound', { detail: kind }))
}
