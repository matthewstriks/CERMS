import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  defaultNotificationSoundPreference,
  type NotificationSoundPreference,
} from '../../../shared/notification-sound-policy'
import type { MembershipReader } from '../../../data/membership-contracts'
import { useMembershipSession } from './membership-session'
import { notificationAudio } from './notification-audio'
interface SoundSettings {
  preference: NotificationSoundPreference
  saving: boolean
  save(preference: NotificationSoundPreference): Promise<void>
}
const Context = createContext<SoundSettings | null>(null)
export function NotificationSoundProvider({ children }: { children: ReactNode }) {
  const { reader } = useMembershipSession()
  const current = useRef(reader)
  current.current = reader
  const [saved, setSaved] = useState<{
    reader: MembershipReader
    preference: NotificationSoundPreference
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const operation = useRef(false)
  const preference =
    saved?.reader === reader
      ? saved.preference
      : (reader?.notificationSoundPreference ?? defaultNotificationSoundPreference)
  return (
    <Context.Provider
      value={{
        preference,
        saving,
        async save(next) {
          if (!reader) throw new Error('Sign in to save sound preferences.')
          if (operation.current)
            throw new Error('Wait for your current sound settings to finish saving.')
          operation.current = true
          setSaving(true)
          try {
            const client = await import('../../../data/firebase-notification-sounds')
            await client.saveNotificationSoundPreference(reader.uid, next)
            if (current.current?.uid === reader.uid)
              setSaved({ reader: current.current, preference: { ...next } })
          } finally {
            operation.current = false
            setSaving(false)
          }
        },
      }}
    >
      <NotificationSoundRuntime />
      {children}
    </Context.Provider>
  )
}
export function useNotificationSounds() {
  const context = useContext(Context)
  if (!context) throw new Error('Missing sound preference provider')
  return context
}
function NotificationSoundRuntime() {
  const { reader, switching } = useMembershipSession(),
    { preference } = useNotificationSounds()
  const state = useRef({ reader, switching, preference })
  state.current = { reader, switching, preference }
  useEffect(() => {
    const unlock = () => void notificationAudio.unlock()
    const play = (event: Event) => {
      const kind = (event as CustomEvent).detail
      if (!['message', 'notification', 'error'].includes(kind)) return
      const current = state.current
      if (current.reader && !current.switching && current.preference.enabled)
        void notificationAudio.play(current.preference.volume, false, kind)
    }
    document.addEventListener('pointerdown', unlock, true)
    document.addEventListener('keydown', unlock, true)
    window.addEventListener('cerms:notification-sound', play)
    return () => {
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      window.removeEventListener('cerms:notification-sound', play)
      notificationAudio.dispose()
    }
  }, [])
  useEffect(() => {
    notificationAudio.stop()
    if (!reader || switching) return
    const seen = new WeakMap<Element, string>()
    const scan = (announce = true) => {
      let changed: 'notification' | 'error' | null = null
      for (const node of document.querySelectorAll('[role="alert"], [data-notification-sound]')) {
        if (!node.getClientRects().length || node.closest('dialog:not([open]), [hidden]')) {
          seen.delete(node)
          continue
        }
        const explicit = node.getAttribute('data-notification-sound')
        const key = explicit && explicit !== 'true' ? explicit : (node.textContent?.trim() ?? '')
        const explicitKind = node.getAttribute('data-notification-sound-kind')
        const kind =
          explicitKind === 'error'
            ? 'error'
            : explicitKind === 'notification'
              ? 'notification'
              : node.getAttribute('role') === 'alert'
                ? 'error'
                : 'notification'
        const signature = `${kind}:${key}`
        if (key && seen.get(node) !== signature && announce)
          changed = kind === 'error' ? 'error' : (changed ?? 'notification')
        seen.set(node, signature)
      }
      if (changed)
        window.dispatchEvent(new CustomEvent('cerms:notification-sound', { detail: changed }))
    }
    scan(false)
    const observer = new MutationObserver(() => scan())
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'open',
        'hidden',
        'class',
        'style',
        'role',
        'data-notification-sound',
        'data-notification-sound-kind',
      ],
    })
    return () => {
      observer.disconnect()
      notificationAudio.stop()
    }
  }, [reader?.uid, reader?.club, switching])
  useEffect(() => {
    if (!preference.enabled || preference.volume === 0) notificationAudio.stop()
  }, [preference.enabled, preference.volume])
  return null
}
