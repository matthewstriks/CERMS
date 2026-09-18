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
const directory = await mkdtemp(join(tmpdir(), 'cerms-admissions-emulator-'))
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
    '--project_id=demo-cerms-admissions',
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
  const test = spawn(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', 'tests/admissions-emulator.test.ts'],
    { stdio: 'inherit', env: { ...process.env, CERMS_ADMISSIONS_EMULATOR_PORT: String(port) } },
  )
  const code = await new Promise((resolve) => test.once('exit', resolve))
  if (code !== 0) throw new Error('Local admissions listener test failed.')
} finally {
  emulator.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (emulator.exitCode === null) {
    emulator.kill('SIGKILL')
    await exited
  }
  await rm(directory, { recursive: true, force: true })
}
