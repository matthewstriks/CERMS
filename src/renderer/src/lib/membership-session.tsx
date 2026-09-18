import { createContext, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { canSwitchSystems } from '../../../shared/firebase-policy'
import type { MembershipReader } from '../../../data/membership-contracts'

interface MembershipSession {
  switching: boolean
  sessionError: string
  switchSystem(systemId: string): Promise<void>
  reader: MembershipReader | null
  connect(email: string, password: string): Promise<void>
  disconnect(): Promise<void>
}
const Context = createContext<MembershipSession | null>(null)
export function MembershipSessionProvider({ children }: { children: ReactNode }) {
  const [reader, setReader] = useState<MembershipReader | null>(null)
  const [switching, setSwitching] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const operation = useRef(false)
  return (
    <Context.Provider
      value={{
        reader,
        switching,
        sessionError,
        async switchSystem(systemId) {
          if (
            operation.current ||
            !reader ||
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
            setReader(next)
          } catch (error) {
            next.close()
            await client.disconnectMembership()
            throw error
          }
        },
        async disconnect() {
          if (operation.current) return
          setSessionError('')
          reader?.close()
          setReader(null)
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
