import { createContext, useContext, useRef, useState, useLayoutEffect, useEffect } from 'react'
import type { ReactNode } from 'react'
import { canSwitchSystems } from '../../../shared/firebase-policy'
import type { MembershipReader } from '../../../data/membership-contracts'

interface MembershipSession {
  theme: 'light' | 'dark'
  savingTheme: boolean
  themeError: string
  toggleTheme(): Promise<void>
  switching: boolean
  sessionError: string
  switchSystem(systemId: string): Promise<void>
  reader: MembershipReader | null
  connect(email: string, password: string): Promise<void>
  disconnect(): Promise<void>
  refreshProfile(): Promise<void>
}
const Context = createContext<MembershipSession | null>(null)
export function MembershipSessionProvider({ children }: { children: ReactNode }) {
  const [reader, setReader] = useState<MembershipReader | null>(null)
  const [switching, setSwitching] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [savingTheme, setSavingTheme] = useState(false)
  const [themeError, setThemeError] = useState('')
  const themeOperation = useRef(false)
  const activeReader = useRef(reader)
  activeReader.current = reader
  useEffect(() => {
    let active = true
    if (!reader) void window.desktop.setAssistantUser(null).catch(() => {})
    else
      void import('../../../data/firebase-membership')
        .then(({ getFirebaseServices }) => {
          const user = getFirebaseServices().auth.currentUser
          if (active && user?.uid === reader.uid && user.email)
            return window.desktop.setAssistantUser({
              uid: reader.uid,
              name: reader.staffName,
              email: user.email,
              business: reader.club,
            })
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [reader])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const operation = useRef(false)
  return (
    <Context.Provider
      value={{
        theme,
        savingTheme,
        themeError,
        async toggleTheme() {
          if (!reader || operation.current || themeOperation.current) return
          const uid = reader.uid,
            previous = theme,
            next = theme === 'dark' ? 'light' : 'dark'
          themeOperation.current = true
          setSavingTheme(true)
          setThemeError('')
          setTheme(next)
          try {
            const client = await import('../../../data/firebase-theme')
            await client.saveThemePreference(uid, next)
          } catch (error) {
            if (activeReader.current === reader) {
              setTheme(previous)
              setThemeError(
                error instanceof Error ? error.message : 'Appearance could not be saved.',
              )
            }
          } finally {
            themeOperation.current = false
            setSavingTheme(false)
          }
        },
        reader,
        switching,
        sessionError,
        async switchSystem(systemId) {
          if (
            operation.current ||
            !reader ||
            themeOperation.current ||
            !canSwitchSystems(reader.uid) ||
            systemId === reader.club
          )
            return
          operation.current = true
          setSwitching(true)
          setSessionError('')
          reader.close()
          try {
            const client = await import('../../../data/firebase-membership')
            const systems = await import('../../../data/firebase-system-access')
            let switchFailure = ''
            try {
              await systems.changeSystemAccess(systemId)
            } catch (error) {
              switchFailure = systems.systemSwitchError(error)
            }
            // Even a failed response can follow a successful commit. Re-read saved
            // access rather than guessing, retrying the write, or restoring old data.
            const next = await client.loadMembershipSession()
            setTheme(next.themePreference ?? 'light')
            setThemeError('')
            setReader(next)
            if (switchFailure)
              setSessionError(`${switchFailure} Your saved system access has been reloaded.`)
            else if (next.club !== systemId)
              setSessionError(
                'Your saved system differs from the selection. The workspace reflects your current saved access.',
              )
          } catch {
            setReader(null)
            setSessionError(
              'Your saved system access could not be reloaded. Sign in again to continue; the access change may have been saved.',
            )
            const client = await import('../../../data/firebase-membership')
            await client.disconnectMembership().catch(() => undefined)
          } finally {
            operation.current = false
            setSwitching(false)
          }
        },
        async connect(email, password) {
          setSessionError('')
          const client = await import('../../../data/firebase-membership')
          const next = await client.connectMembership(email, password)
          try {
            await window.desktop.setWindowMode('workspace')
            setTheme(next.themePreference ?? 'light')
            setThemeError('')
            setReader(next)
            // The requested installation audit is separate from profile/session writes.
            void import('../../../data/firebase-installation')
              .then((module) => module.reportInstallationAfterSignIn(next.uid))
              .catch(() => {})
          } catch (error) {
            next.close()
            await client.disconnectMembership()
            throw error
          }
        },
        async refreshProfile() {
          if (!reader || operation.current) return
          const previous = reader
          const client = await import('../../../data/firebase-membership')
          const next = await client.loadMembershipSession()
          if (activeReader.current !== previous) {
            next.close()
            return
          }
          previous.close()
          setReader(next)
        },
        async disconnect() {
          if (operation.current) return
          setSessionError('')
          reader?.close()
          setReader(null)
          setTheme('light')
          setThemeError('')
          const client = await import('../../../data/firebase-membership')
          await client.disconnectMembership()
        },
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useMembershipSession() {
  const session = useContext(Context)
  if (!session) throw new Error('Missing membership session provider')
  return session
}
