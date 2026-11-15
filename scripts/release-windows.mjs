import { parseChangelog, sectionNotes, validateNotes } from './changelog.cjs'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32' && command === npm,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
if (process.argv.includes('--next-alpha')) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  assert.match(pkg.version, /-alpha\.\d+$/, 'Alpha publish requires an existing alpha version')
  const parsed = parseChangelog(await readFile('CHANGELOG.md', 'utf8'))
  validateNotes(sectionNotes(parsed, 'Unreleased'))
  const next = pkg.version.replace(
    /(alpha\.)(\d+)$/,
    (_all, prefix, number) => prefix + (Number(number) + 1),
  )
  assert.ok(
    !parsed.sections.has(next),
    'Next version already has notes; use release:win to resume that version or choose a new version.',
  )
  run(npm, ['version', 'prerelease', '--preid=alpha', '--no-git-tag-version'])
}
run(process.execPath, ['scripts/prepare-changelog.mjs'])
run(npm, ['run', 'check'])
run(process.execPath, [
  '--test',
  'scripts/changelog.test.mjs',
  'scripts/release.test.mjs',
  'scripts/firebase-release.test.mjs',
])
run(
  npm,
  [
    'exec',
    '--',
    'electron-builder',
    '--config',
    'electron-builder.config.cjs',
    '--win',
    'nsis',
    '--x64',
    '--publish',
    'never',
  ],
  {
    ...process.env,
    CERMS_RELEASE_BUILD: '1',
    CERMS_RELEASE_PLATFORM: 'windows',
  },
)
run(process.execPath, ['scripts/publish-firebase-release.mjs'])
