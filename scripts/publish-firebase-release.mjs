import { validateNotes } from './changelog.cjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
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
      assert.ok(name.startsWith('windows/'))
      const url = `${base}/o/${encodeURIComponent(name)}`
      const r = await api(url, {}, true)
      if (!r) return null
      const metadata = await r.json()
      const content = await api(`${url}?alt=media&generation=${metadata.generation}`)
      return { generation: metadata.generation, bytes: Buffer.from(await content.arrayBuffer()) }
    },
    async put(name, bytes, generation = '0', mutable = false) {
      assert.ok(name.startsWith('windows/'))
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

export async function publishWindows(assets, store) {
  const { version, manifest, files } = assets
  validateNotes(load(manifest.toString()).releaseNotes)
  const channels = announcementChannels(version)
  // Capture generations before uploading: concurrent publishes cannot replace a newer feed.
  const previous = new Map()
  for (const channel of channels) {
    const state = await store.read(`windows/${channel}.yml`)
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
  const immutable = [...files, { name: `releases/${version}.yml`, bytes: manifest }]
  for (const file of immutable) {
    const name = `windows/${file.name}`
    const existing = await store.read(name)
    if (existing)
      assert.equal(
        hash(existing.bytes),
        hash(file.bytes),
        'Never overwrite a version asset; increment the version',
      )
    else {
      console.log(`Uploading ${file.name} (${file.bytes.length} bytes)…`)
      await store.put(name, file.bytes)
    }
    await store.verify(name, file.bytes)
  }
  // All immutable files are public and hash-verified before any client learns of the version.
  for (const channel of channels) {
    const name = `windows/${channel}.yml`
    await store.put(name, manifest, previous.get(channel)?.generation ?? '0', true)
    await store.verify(name, manifest)
  }
  return new URL(files[0].name, settings.windowsFeed).href
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
    const assets = await windowsAssets('release', version)
    const link = await publishWindows(assets, storageClient(await releaseToken()))
    console.log(`Published CERMS ${version}. Send this installer to the client:\n${link}`)
  }
}
