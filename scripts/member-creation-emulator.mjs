import { spawn } from 'node:child_process'
import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const cache = join(homedir(), '.cache/firebase/emulators')
const jars = (await readdir(cache).catch(() => []))
  .filter((name) => /^cloud-firestore-emulator-.*\.jar$/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
const jar = process.env.FIRESTORE_EMULATOR_JAR ?? (jars.length ? join(cache, jars.at(-1)) : null)
if (!jar) throw new Error('Install the Firebase Firestore emulator or set FIRESTORE_EMULATOR_JAR.')
const port = await new Promise((resolve, reject) => {
  const socket = createServer()
  socket.on('error', reject)
  socket.listen(0, '127.0.0.1', () => {
    const value = socket.address().port
    socket.close(() => resolve(value))
  })
})
const directory = await mkdtemp(join(tmpdir(), 'cerms-members-emulator-'))
await writeFile(
  join(directory, 'firestore.rules'),
  "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if true; } } }",
)
// Permissive rules and writes exist ONLY inside this isolated local test process.
const emulator = spawn(
  'java',
  [
    '-jar',
    jar,
    '--host=127.0.0.1',
    `--port=${port}`,
    '--project_id=demo-cerms-members',
    '--single_project_mode',
    '--single_project_mode_error',
    `--rules=${join(directory, 'firestore.rules')}`,
  ],
  { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] },
)
let logs = ''
emulator.stdout.on('data', (chunk) => {
  logs = (logs + chunk).slice(-8000)
})
emulator.stderr.on('data', (chunk) => {
  logs = (logs + chunk).slice(-8000)
})
const exited = new Promise((resolve) => emulator.once('exit', resolve))
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (emulator.exitCode !== null) throw new Error(logs)
    try {
      await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) })
      ready = true
      break
    } catch {
      await delay(250)
    }
  }
  if (!ready) throw new Error('Emulator did not start: ' + logs)
  const field = (value) =>
    typeof value === 'boolean'
      ? { booleanValue: value }
      : typeof value === 'number'
        ? { integerValue: String(value) }
        : { stringValue: value }
  for (const [id, name, duration] of [
    ['annual', 'Annual membership', 31540000],
    ['monthly', 'Monthly membership', 2628000],
    ['day', 'Day membership', 86400],
  ]) {
    const fields = Object.fromEntries(
      Object.entries({
        access: 'fixture-club',
        name,
        membership: true,
        active: true,
        membershipLength: duration,
      }).map(([key, value]) => [key, field(value)]),
    )
    const result = await fetch(
      `http://127.0.0.1:${port}/v1/projects/demo-cerms-members/databases/(default)/documents/products/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      },
    )
    if (!result.ok) throw new Error('Unable to seed local membership products.')
  }
  const env = { ...process.env, CERMS_MEMBER_EMULATOR_PORT: String(port) }
  const testing = process.argv.includes('--test')
  const child = spawn(
    process.execPath,
    testing
      ? ['node_modules/vitest/vitest.mjs', 'run', 'tests/member-creation-emulator.test.ts']
      : ['node_modules/vite/bin/vite.js', '--config', 'lab/vite.config.ts'],
    { stdio: 'inherit', env },
  )
  let stopping = false
  const stop = () => {
    stopping = true
    child.kill('SIGTERM')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  if (!testing)
    console.log(
      '\nLocal member form: http://127.0.0.1:5174/lab/index.html\nSynthetic data only. Ctrl+C stops and discards this environment.\n',
    )
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve)
    child.once('error', reject)
  })
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  if (!stopping && code !== 0 && code !== null)
    throw new Error('Local member environment exited unsuccessfully.')
} finally {
  emulator.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (emulator.exitCode === null) {
    emulator.kill('SIGKILL')
    await exited
  }
  await rm(directory, { recursive: true, force: true })
}
