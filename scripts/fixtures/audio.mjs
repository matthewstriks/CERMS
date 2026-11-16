// Injected before renderer startup. Never accesses the actual audio device.
export function audioFixture() {
  window.__audioFixture = { notes: [], levels: [], resumes: 0 }
  window.AudioContext = class {
    state = 'running'
    currentTime = 1
    destination = {}
    async resume() {
      this.state = 'running'
      window.__audioFixture.resumes++
    }
    async close() {
      this.state = 'closed'
    }
    createOscillator() {
      return {
        type: '',
        frequency: { value: 0 },
        onended: null,
        connect() {},
        disconnect() {},
        stop() {},
        start() {
          window.__audioFixture.notes.push(this.frequency.value)
        },
      }
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime(value) {
            if (value !== 0.0001) window.__audioFixture.levels.push(value)
          },
        },
        connect() {},
        disconnect() {},
      }
    }
  }
}
