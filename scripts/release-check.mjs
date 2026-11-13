import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
export async function validateRelease({ tag, platform, release = false, env = process.env } = {}) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.match(
    pkg.version,
    /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/,
    'Use a semantic version, for example 5.0.0 or 5.0.0-alpha.2',
  )
  assert.equal(lock.version, pkg.version, 'package-lock version must match package.json')
  assert.equal(lock.packages[''].version, pkg.version)
  if (tag) assert.equal(tag, `v${pkg.version}`, 'The release tag must match package.json version')
  const config = JSON.parse(
    await readFile(new URL('../config/firebase-client.json', import.meta.url), 'utf8'),
  )
  assert.equal(config.projectId, 'cerms-7af24')
  assert.ok(
    config.apiKey && config.appId,
    'Public Firebase client configuration is required in installers',
  )
  assert.deepEqual(
    Object.keys(config).sort(),
    ['apiKey', 'appId', 'authDomain', 'messagingSenderId', 'projectId', 'storageBucket'].sort(),
    'Client config must contain public identifiers only',
  )
  if (release && platform === 'macos' && env.CERMS_MAC_SIGNED_RELEASE === '1') {
    for (const name of [
      'CSC_LINK',
      'CSC_KEY_PASSWORD',
      'APPLE_ID',
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_TEAM_ID',
    ])
      assert.ok(
        env[name],
        `Configure the ${name} GitHub signing/notarization secret before a macOS release`,
      )
  }
  return { version: pkg.version, prerelease: pkg.version.includes('-') }
}
if (process.argv[1]?.endsWith('release-check.mjs')) {
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined
  const result = await validateRelease({
    tag,
    platform: process.env.CERMS_RELEASE_PLATFORM,
    release: process.env.CERMS_RELEASE_BUILD === '1',
  })
  console.log(`Release inputs verified for ${result.version}. No files were published.`)
}
