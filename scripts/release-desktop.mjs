import { parseChangelog, sectionNotes, validateNotes } from './changelog.cjs'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
export const macCredentialNames = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]
export function releasePlan({
  platforms = ['windows', 'macos'],
  host = process.platform,
  env = process.env,
} = {}) {
  assert.ok(
    platforms.length && platforms.every((p) => ['windows', 'macos'].includes(p)),
    'Unknown release platform',
  )
  if (platforms.includes('macos'))
    assert.equal(
      host,
      'darwin',
      'Windows + Mac releases must run on macOS. Use release:win for a Windows-only release.',
    )
  const configured = macCredentialNames.filter((name) => env[name])
  const signed =
    platforms.includes('macos') && (env.CERMS_MAC_SIGNED_RELEASE === '1' || configured.length > 0)
  if (signed)
    for (const name of macCredentialNames)
      assert.ok(
        env[name],
        `Mac signing setup is incomplete: configure ${name} before releasing. No version was changed.`,
      )
  return platforms.map((platform) => {
    const signingEnv = { ...env }
    if (platform === 'windows') {
      // electron-builder otherwise falls back to the Mac CSC_LINK for Windows signing.
      // Windows certificates belong only in WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD.
      for (const name of Object.keys(signingEnv))
        if (name.startsWith('CSC_') || name.startsWith('APPLE_')) delete signingEnv[name]
    } else {
      delete signingEnv.WIN_CSC_LINK
      delete signingEnv.WIN_CSC_KEY_PASSWORD
    }
    return {
      platform,
      args: platform === 'windows' ? ['--win', 'nsis', '--x64'] : ['--mac', '--universal'],
      env: {
        ...signingEnv,
        CERMS_RELEASE_BUILD: '1',
        CERMS_RELEASE_PLATFORM: platform,
        CERMS_MAC_SIGNED_RELEASE: platform === 'macos' && signed ? '1' : '0',
      },
    }
  })
}
export async function runRelease({ platforms = ['windows', 'macos'], nextAlpha = false } = {}) {
  // Preflight before changing versions or building anything.
  const plan = releasePlan({ platforms })
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  function run(command, args, env = process.env) {
    const result = spawnSync(command, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32' && command === npm,
    })
    if (result.error) throw result.error
    if (result.status !== 0)
      throw Error(
        `Release step failed (${result.status ?? 'no exit status'}). Retry the same version; do not increment again.`,
      )
  }
  if (plan.some((p) => p.platform === 'macos' && p.env.CERMS_MAC_SIGNED_RELEASE !== '1'))
    console.log(
      'Apple signing is not configured: this release will include a manual-install Mac download. Mac automatic updates stay disabled until signed/notarized releases are configured.',
    )
  if (nextAlpha) {
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
      'Next version already has notes; use release:desktop to resume that version.',
    )
    run(npm, ['version', 'prerelease', '--preid=alpha', '--no-git-tag-version'])
  }
  run(process.execPath, ['scripts/prepare-changelog.mjs'])
  // One necessary build for both platforms; no broad test suite during packaging.
  run(npm, ['run', 'build'])
  for (const step of plan) {
    run(process.execPath, ['scripts/release-check.mjs'], step.env)
    run(
      npm,
      [
        'exec',
        '--',
        'electron-builder',
        '--config',
        'electron-builder.config.cjs',
        ...step.args,
        '--publish',
        'never',
      ],
      step.env,
    )
  }
  run(process.execPath, [
    'scripts/publish-firebase-release.mjs',
    ...(platforms.includes('macos') ? ['--all'] : []),
  ])
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  assert.ok(
    args.every((arg) => ['--next-alpha', '--help'].includes(arg)),
    'Unknown release option',
  )
  if (args.includes('--help'))
    console.log(
      'Usage: node scripts/release-desktop.mjs [--next-alpha]\nBuilds and publishes Windows + universal Mac from macOS. Without --next-alpha, retries the current version. Apple signing is required for Mac automatic updates.',
    )
  else await runRelease({ nextAlpha: args.includes('--next-alpha') })
}
