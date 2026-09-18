import type { BrowserWindow } from 'electron'

let transitions: Promise<void> = Promise.resolve()
function fullscreen(window: BrowserWindow, enabled: boolean): Promise<void> {
  if (window.isFullScreen() === enabled) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const remove = () => {
      window.removeListener('enter-full-screen', done)
      window.removeListener('leave-full-screen', done)
    }
    const done = () => {
      clearTimeout(timer)
      remove()
      resolve()
    }
    const timer = setTimeout(() => {
      remove()
      reject(new Error('Unable to resize the application window. Please try again.'))
    }, 10000)
    if (enabled) window.once('enter-full-screen', done)
    else window.once('leave-full-screen', done)
    window.setFullScreen(enabled)
  })
}
export function setWindowMode(window: BrowserWindow, mode: 'login' | 'workspace'): Promise<void> {
  const next = transitions
    .catch(() => undefined)
    .then(async () => {
      if (window.isDestroyed()) return
      if (mode === 'workspace') {
        window.setResizable(true)
        window.setMaximizable(true)
        await fullscreen(window, false)
        window.setFullScreenable(false)
        window.setMinimumSize(1024, 700)
        window.maximize()
      } else {
        await fullscreen(window, false)
        if (window.isMaximized()) window.unmaximize()
        window.setMinimumSize(480, 680)
        window.setSize(480, 680)
        window.center()
        window.setResizable(false)
        window.setMaximizable(false)
        window.setFullScreenable(false)
      }
    })
  transitions = next
  return next
}
