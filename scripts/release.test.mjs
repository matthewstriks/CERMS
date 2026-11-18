import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { validateRelease } from './release-check.mjs'
import { validateAssets } from './publish-release.mjs'
import { releasePlan, macCredentialNames } from './release-desktop.mjs'
test('tag must match package version, lock stays synchronized and mac release requires signing credentials', async () => {
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )
  await validateRelease({ tag: `v${version}` })
  await assert.rejects(validateRelease({ tag: `v${version}-wrong` }), /tag must match/)
  await assert.rejects(
    validateRelease({ platform: 'macos', release: true, env: { CERMS_MAC_SIGNED_RELEASE: '1' } }),
    /CSC_LINK/,
  )
  await validateRelease({ platform: 'windows', release: true, env: {} })
})
test('release stays unpublished unless both platforms and hash-verified update manifests are complete', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cerms-release-')),
    version = '5.0.0-alpha.1'
  try {
    await assert.rejects(validateAssets(dir, version), /Missing release asset/)
    const win = `CERMS-5-${version}-win-x64.exe`,
      zip = `CERMS-5-${version}-mac-universal.zip`,
      dmg = `CERMS-5-${version}-mac-universal.dmg`
    for (const name of [win, zip, dmg]) await writeFile(join(dir, name), 'synthetic installer')
    const sha = createHash('sha512').update('synthetic installer').digest('base64')
    const manifest = (name) =>
      JSON.stringify({
        version,
        releaseNotes: 'Synthetic release notes',
        files: [{ url: name, sha512: sha, size: 19 }],
      })
    await writeFile(join(dir, 'latest.yml'), manifest(win))
    await writeFile(join(dir, 'latest-mac.yml'), manifest(zip))
    assert.equal((await validateAssets(dir, version)).length, 5)
    await writeFile(join(dir, win), 'tampered installer')
    await assert.rejects(validateAssets(dir, version), /Hash mismatch/)
    await writeFile(join(dir, win), 'synthetic installer')
    await writeFile(join(dir, 'latest.yml'), manifest('../escape.exe'))
    await assert.rejects(validateAssets(dir, version), /local release asset names/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('updater enablement follows the target platform, and unsigned Mac releases remain manual-update builds', () => {
  function config(platform, signed = '0') {
    return JSON.parse(
      execFileSync(
        process.execPath,
        ['-e', "console.log(JSON.stringify(require('./electron-builder.config.cjs')))"],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            CERMS_RELEASE_BUILD: '1',
            CERMS_RELEASE_PLATFORM: platform,
            CERMS_MAC_SIGNED_RELEASE: signed,
          },
        },
      ),
    )
  }
  assert.equal(config('windows').extraMetadata.cermsRelease.updatesEnabled, true)
  assert.equal(config('macos').extraMetadata.cermsRelease.updatesEnabled, false)
  const mac = config('macos', '1')
  assert.equal(mac.extraMetadata.cermsRelease.updatesEnabled, true)
  assert.equal(mac.mac.forceCodeSigning, true)
  assert.equal(mac.mac.notarize, true)
  const settings = JSON.parse(
    readFileSync(new URL('../config/desktop-releases.json', import.meta.url)),
  )
  assert.equal(mac.publish[0].provider, 'generic')
  assert.equal(mac.publish[0].url, settings.macosFeed)
  assert.deepEqual(mac.mac.target, ['dmg', 'zip'])
})

test('combined alpha plan targets Windows and universal Mac and fails before versioning on unsupported hosts/partial signing', () => {
  const plan = releasePlan({ host: 'darwin', env: {} })
  assert.deepEqual(
    plan.map((p) => p.platform),
    ['windows', 'macos'],
  )
  assert.deepEqual(plan[1].args, ['--mac', '--universal'])
  assert.equal(plan[1].env.CERMS_MAC_SIGNED_RELEASE, '0')
  assert.throws(() => releasePlan({ host: 'win32', env: {} }), /must run on macOS/)
  assert.throws(() => releasePlan({ host: 'darwin', env: { CSC_LINK: 'synthetic' } }), /incomplete/)
  const credentials = Object.fromEntries(macCredentialNames.map((n) => [n, 'synthetic']))
  const signedPlan = releasePlan({
    host: 'darwin',
    env: { ...credentials, WIN_CSC_LINK: 'windows-cert', WIN_CSC_KEY_PASSWORD: 'windows-password' },
  })
  assert.equal(signedPlan[0].env.CSC_LINK, undefined)
  assert.equal(signedPlan[0].env.CSC_KEY_PASSWORD, undefined)
  assert.equal(signedPlan[0].env.APPLE_APP_SPECIFIC_PASSWORD, undefined)
  assert.equal(signedPlan[0].env.WIN_CSC_LINK, 'windows-cert')
  assert.equal(signedPlan[0].env.WIN_CSC_KEY_PASSWORD, 'windows-password')
  assert.equal(signedPlan[1].env.CSC_LINK, 'synthetic')
  assert.equal(signedPlan[1].env.WIN_CSC_LINK, undefined)
  assert.equal(
    releasePlan({ host: 'darwin', env: credentials })[1].env.CERMS_MAC_SIGNED_RELEASE,
    '1',
  )
  assert.equal(
    releasePlan({ platforms: ['windows'], host: 'win32', env: {} })[0].platform,
    'windows',
  )
})

test('release notes are included in builder metadata and the updater feed from one source', () => {
  const config = JSON.parse(
    execFileSync(
      process.execPath,
      ['-e', "console.log(JSON.stringify(require('./electron-builder.config.cjs')))"],
      { encoding: 'utf8' },
    ),
  )
  assert.ok(config.releaseInfo.releaseNotes.trim().length > 0)
  assert.equal(config.extraMetadata.cermsRelease.releaseNotes, config.releaseInfo.releaseNotes)
})
