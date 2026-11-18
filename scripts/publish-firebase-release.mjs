import { validateNotes } from './changelog.cjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { validateRelease } from './release-check.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const require = createRequire(import.meta.url)
const { load } = require('js-yaml')
const settings = JSON.parse(
  await readFile(new URL('../config/desktop-releases.json', import.meta.url), 'utf8'),
)
assert.equal(settings.project, 'cerms-7af24')
assert.equal(
  settings.bucket,
  'cerms-7af24-cerms5-releases',
  'Only the isolated release bucket is permitted',
)
assert.equal(settings.windowsFeed, `https://storage.googleapis.com/${settings.bucket}/windows/`)
assert.equal(settings.macosFeed, `https://storage.googleapis.com/${settings.bucket}/macos/`)
const hash = (bytes) => createHash('sha512').update(bytes).digest('base64')

export function versionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(version)
  assert.ok(match, 'Unsupported release version')
  return [
    +match[1],
    +match[2],
    +match[3],
    { alpha: 0, beta: 1, rc: 2 }[match[4]] ?? 3,
    +(match[5] ?? 0),
  ]
}
export function compareVersions(a, b) {
  const aa = versionParts(a),
    bb = versionParts(b)
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return Math.sign(aa[i] - bb[i])
  return 0
}
export function releaseChannel(version) {
  versionParts(version)
  return version.split('-')[1]?.split('.')[0] || 'latest'
}
export function announcementChannels(version) {
  // Promote stable releases to existing alpha installs as well, without sending alphas to stable.
  return releaseChannel(version) === 'latest'
    ? ['latest', 'alpha', 'beta', 'rc']
    : [releaseChannel(version)]
}

export async function windowsAssets(directory, version) {
  const channel = releaseChannel(version)
  const installer = `CERMS-5-${version}-win-x64.exe`
  const manifest = await readFile(join(directory, `${channel}.yml`))
  const data = load(manifest.toString())
  assert.equal(data.version, version, 'Manifest version must match package version')
  const releaseNotes = validateNotes(data.releaseNotes)
  assert.equal(data.path, installer, 'Manifest path must name the Windows installer')
  assert.equal(data.files?.length, 1, 'Windows manifest must contain exactly one installer')
  assert.equal(data.files[0].url, installer, 'Manifest URL must be a local installer name')
  const bytes = await readFile(join(directory, installer))
  assert.equal(data.sha512, hash(bytes), 'Installer legacy hash mismatch')
  assert.equal(data.files[0].sha512, hash(bytes), 'Installer hash mismatch')
  assert.equal(data.files[0].size, bytes.length, 'Installer size mismatch')
  // Differential metadata is required as part of a complete release.
  const blockmap = await readFile(join(directory, `${installer}.blockmap`))
  assert.ok(blockmap.length, 'Missing blockmap')
  // Inspect the exact unpacked build, so an old GitHub/local preview cannot be published by accident.
  const feed = load(
    await readFile(join(directory, 'win-unpacked/resources/app-update.yml'), 'utf8'),
  )
  assert.equal(feed.provider, 'generic')
  assert.equal(feed.url, settings.windowsFeed)
  assert.equal(feed.channel, channel)
  const { default: asar } = await import('@electron/asar')
  asar.uncache(join(directory, 'win-unpacked/resources/app.asar'))
  const pkg = JSON.parse(
    asar.extractFile(join(directory, 'win-unpacked/resources/app.asar'), 'package.json').toString(),
  )
  assert.equal(pkg.version, version)
  assert.equal(pkg.cermsRelease?.updatesEnabled, true, 'Installer must enable the release updater')
  assert.equal(
    pkg.cermsRelease?.releaseNotes,
    releaseNotes,
    'Packaged changelog must match the update manifest',
  )
  return {
    version,
    manifest,
    files: [
      { name: installer, bytes },
      { name: `${installer}.blockmap`, bytes: blockmap },
    ],
  }
}

export function storageClient(token, request = fetch) {
  const headers = { Authorization: `Bearer ${token}` }
  const base = `https://storage.googleapis.com/storage/v1/b/${settings.bucket}`
  async function api(url, options = {}, allowed404 = false) {
    const r = await request(url, { ...options, headers: { ...headers, ...options.headers } })
    if (allowed404 && r.status === 404) return null
    if (!r.ok) {
      const detail = await r.json().catch(() => ({}))
      throw new Error(
        `Release storage request failed (${r.status}): ${detail.error?.message ?? 'unknown error'}`,
      )
    }
    return r
  }
  return {
    async read(name) {
      assert.ok(/^(windows|macos)\//.test(name))
      const url = `${base}/o/${encodeURIComponent(name)}`
      const r = await api(url, {}, true)
      if (!r) return null
      const metadata = await r.json()
      const content = await api(`${url}?alt=media&generation=${metadata.generation}`)
      return { generation: metadata.generation, bytes: Buffer.from(await content.arrayBuffer()) }
    },
    async put(name, bytes, generation = '0', mutable = false) {
      assert.ok(/^(windows|macos)\//.test(name))
      const metadata = {
        name,
        contentType: name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
        cacheControl: mutable ? 'no-store, max-age=0' : 'public, max-age=31536000, immutable',
      }
      const boundary = 'cerms5releaseboundary'
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.contentType}\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ])
      await api(
        `https://storage.googleapis.com/upload/storage/v1/b/${settings.bucket}/o?uploadType=multipart&ifGenerationMatch=${generation}`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      )
    },
    async verify(name, bytes) {
      const r = await request(
        `https://storage.googleapis.com/${settings.bucket}/${name}?verify=${Date.now()}`,
      )
      assert.ok(r.ok, `Public release file unavailable (${r.status})`)
      assert.equal(
        hash(Buffer.from(await r.arrayBuffer())),
        hash(bytes),
        `Public hash mismatch: ${name}`,
      )
    },
  }
}

// All immutable downloads for both platforms must verify before either feed advances.
async function preparePublication(assets, store, platform) {
  const { version, manifest } = assets
  validateNotes(load(manifest.toString()).releaseNotes)
  const suffix = platform === 'macos' ? '-mac' : ''
  const channels = assets.updatesEnabled === false ? [] : announcementChannels(version)
  const previous = new Map()
  for (const channel of channels) {
    const name = `${platform}/${channel}${suffix}.yml`
    const state = await store.read(name)
    if (state) {
      const current = load(state.bytes.toString())
      assert.ok(
        compareVersions(version, current.version) >= 0,
        'Refusing to announce an older version',
      )
      if (version === current.version)
        assert.equal(
          hash(manifest),
          hash(state.bytes),
          'Published version cannot be replaced; increment the alpha version',
        )
    }
    previous.set(channel, state)
  }
  return { assets, platform, suffix, channels, previous }
}
async function stagePublication({ assets, platform }, store) {
  const { version, manifest, files } = assets
  const immutable = [...files, { name: `releases/${version}.yml`, bytes: manifest }]
  for (const file of immutable) {
    const name = `${platform}/${file.name}`
    const existing = await store.read(name)
    if (existing)
      assert.equal(
        hash(existing.bytes),
        hash(file.bytes),
        'Never overwrite a version asset; increment the version',
      )
    else {
      console.log(`Uploading ${platform}/${file.name} (${file.bytes.length} bytes)…`)
      await store.put(name, file.bytes)
    }
    await store.verify(name, file.bytes)
  }
}
async function announcePublication({ assets, platform, suffix, channels, previous }, store) {
  for (const channel of channels) {
    const name = `${platform}/${channel}${suffix}.yml`
    await store.put(name, assets.manifest, previous.get(channel)?.generation ?? '0', true)
    await store.verify(name, assets.manifest)
  }
}
export async function publishDesktop(releases, store) {
  assert.ok(releases.length && releases.every((r) => ['windows', 'macos'].includes(r.platform)))
  assert.equal(new Set(releases.map((r) => r.platform)).size, releases.length)
  for (const { assets } of releases) {
    assert.equal(assets.version, releases[0].assets.version, 'Platform versions must match')
    assert.equal(
      load(assets.manifest.toString()).releaseNotes,
      load(releases[0].assets.manifest.toString()).releaseNotes,
      'Platform release notes must match',
    )
  }
  const prepared = []
  for (const { assets, platform } of releases)
    prepared.push(await preparePublication(assets, store, platform))
  for (const publication of prepared) await stagePublication(publication, store)
  for (const publication of prepared) await announcePublication(publication, store)
  return Object.fromEntries(
    releases.map(({ platform, assets }) => [
      platform,
      new URL(
        assets.files[0].name,
        platform === 'macos' ? settings.macosFeed : settings.windowsFeed,
      ).href,
    ]),
  )
}
export async function publishWindows(assets, store) {
  return (await publishDesktop([{ platform: 'windows', assets }], store)).windows
}
export function verifyMacSigning(appPath) {
  assert.equal(process.platform, 'darwin', 'Signed Mac publication must be verified on macOS')
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' })
  const signature = spawnSync('codesign', ['--display', '--verbose=4', appPath], {
    encoding: 'utf8',
  })
  assert.equal(signature.status, 0, 'Mac signing identity cannot be verified')
  assert.match(
    signature.stderr,
    /Authority=Developer ID Application:/,
    'Mac updater requires a Developer ID Application signature',
  )
  execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'pipe' })
}
export async function macosAssets(directory, version, { verifySigning = verifyMacSigning } = {}) {
  const channel = releaseChannel(version)
  const dmg = `CERMS-5-${version}-mac-universal.dmg`
  const zip = `CERMS-5-${version}-mac-universal.zip`
  const manifest = await readFile(join(directory, `${channel}-mac.yml`))
  const data = load(manifest.toString())
  assert.equal(data.version, version, 'Mac manifest version must match package version')
  const notes = validateNotes(data.releaseNotes)
  assert.equal(data.path, zip, 'Mac updater must use the universal ZIP')
  assert.deepEqual(
    data.files?.map((f) => f.url).sort(),
    [dmg, zip].sort(),
    'Mac manifest must list exactly the universal DMG and ZIP',
  )
  const files = []
  for (const name of [dmg, zip]) {
    const bytes = await readFile(join(directory, name))
    const listed = data.files.find((f) => f.url === name)
    assert.equal(listed.sha512, hash(bytes), 'Mac artifact hash mismatch')
    assert.equal(listed.size, bytes.length, 'Mac artifact size mismatch')
    if (name === zip) assert.equal(data.sha512, hash(bytes), 'Mac ZIP legacy hash mismatch')
    files.push({ name, bytes })
    const blockmap = await readFile(join(directory, name + '.blockmap'))
    assert.ok(blockmap.length, 'Missing Mac blockmap')
    files.push({ name: name + '.blockmap', bytes: blockmap })
  }
  const appPath = join(directory, 'mac-universal', 'CERMS 5.app')
  const resources = join(appPath, 'Contents/Resources')
  const feed = load(await readFile(join(resources, 'app-update.yml'), 'utf8'))
  assert.equal(feed.provider, 'generic')
  assert.equal(feed.url, settings.macosFeed)
  assert.equal(feed.channel, channel)
  const { default: asar } = await import('@electron/asar')
  asar.uncache(join(resources, 'app.asar'))
  const pkg = JSON.parse(asar.extractFile(join(resources, 'app.asar'), 'package.json').toString())
  assert.equal(pkg.version, version)
  assert.equal(
    pkg.cermsRelease?.releaseNotes,
    notes,
    'Packaged Mac changelog must match the manifest',
  )
  assert.equal(typeof pkg.cermsRelease?.updatesEnabled, 'boolean')
  if (pkg.cermsRelease.updatesEnabled) await verifySigning(appPath)
  return { version, manifest, files, updatesEnabled: pkg.cermsRelease.updatesEnabled }
}

export async function setupBucket() {
  const token = await releaseToken()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const url = `https://storage.googleapis.com/storage/v1/b/${settings.bucket}`
  let response = await fetch(url, { headers })
  if (response.status === 404) {
    response = await fetch(
      `https://storage.googleapis.com/storage/v1/b?project=${settings.project}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: settings.bucket,
          location: 'US-CENTRAL1',
          storageClass: 'STANDARD',
          iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
          versioning: { enabled: true },
          labels: { application: 'cerms5', purpose: 'desktop-releases' },
        }),
      },
    )
  }
  assert.ok(response.ok, `Release bucket setup failed (${response.status})`)
  const bucket = await response.json()
  assert.equal(bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled, true)
  assert.equal(
    bucket.labels?.purpose,
    'desktop-releases',
    'Refusing to configure an unrelated bucket',
  )
  const policyResponse = await fetch(url + '/iam', { headers })
  assert.ok(policyResponse.ok)
  const policy = await policyResponse.json()
  policy.bindings ??= []
  if (
    !policy.bindings.some(
      (b) => b.role === 'roles/storage.objectViewer' && b.members?.includes('allUsers'),
    )
  ) {
    policy.bindings.push({ role: 'roles/storage.objectViewer', members: ['allUsers'] })
    const result = await fetch(url + '/iam', {
      method: 'PUT',
      headers,
      body: JSON.stringify(policy),
    })
    assert.ok(
      result.ok,
      `Public release downloads could not be enabled (${result.status}); no project policies changed`,
    )
  }
  console.log(
    `Release bucket ready: ${settings.bucket}. Public downloads only; publishing uses local credentials.`,
  )
}

if (process.argv[1]?.endsWith('publish-firebase-release.mjs')) {
  if (process.argv.includes('--setup')) await setupBucket()
  else {
    const { version } = await validateRelease()
    const releases = [{ platform: 'windows', assets: await windowsAssets('release', version) }]
    if (process.argv.includes('--all'))
      releases.push({ platform: 'macos', assets: await macosAssets('release', version) })
    const links = await publishDesktop(releases, storageClient(await releaseToken()))
    console.log(`Published CERMS ${version}. Download links:`)
    for (const [platform, link] of Object.entries(links)) console.log(`${platform}: ${link}`)
    if (releases.some((r) => r.platform === 'macos' && !r.assets.updatesEnabled))
      console.log(
        'This Mac download requires manual installation. Mac automatic updates need Apple signing/notarization setup and a first signed installation.',
      )
  }
}
