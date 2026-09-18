import { createRoot } from 'react-dom/client'
import CreateMemberForm from '../src/renderer/src/features/members/CreateMemberForm'
import { createEmulatorMemberCreator } from '../src/data/emulator-member-creator'
import '../src/renderer/src/styles.css'
import './style.css'

async function start() {
  const response = await fetch('/__member_lab_config')
  if (!response.ok) throw new Error('Start this environment with npm run dev:members.')
  const { port } = await response.json()
  const creator = createEmulatorMemberCreator(port)
  createRoot(document.getElementById('root')!).render(
    <main className="member-lab">
      <div className="lab-notice">
        Local member-creation test environment · Synthetic data only · Cleared when stopped
      </div>
      <h1>Create membership</h1>
      <p>Sign up a new guest with a membership.</p>
      <CreateMemberForm creator={creator} />
      <p className="page-note">
        Checkout and waiver handling are not implemented yet. This environment does not connect to
        the live CERMS database.
      </p>
    </main>,
  )
}
void start().catch((error: unknown) => {
  document.getElementById('root')!.textContent =
    error instanceof Error ? error.message : 'Unable to start local environment.'
})
