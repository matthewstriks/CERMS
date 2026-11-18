import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import asar from '@electron/asar'
import {
  publishWindows,
  publishDesktop,
  macosAssets,
  announcementChannels,
  windowsAssets,
  storageClient,
} from './publish-firebase-release.mjs'
const digest = (bytes) => createHash('sha512').update(bytes).digest('base64')
function fixture(version = '5.0.0-alpha.2') {
  const bytes = Buffer.from('synthetic installer'),
    name = `CERMS-5-${version}-win-x64.exe`
  return {
    version,
    manifest: Buffer.from(
      JSON.stringify({
        version,
        releaseNotes: '### Added\n- Synthetic release notes',
        path: name,
        sha512: digest(bytes),
        files: [{ url: name, size: bytes.length, sha512: digest(bytes) }],
      }),
    ),
    files: [
      { name, bytes },
      { name: name + '.blockmap', bytes: Buffer.from('synthetic blockmap') },
    ],
  }
}
function memoryStore() {
  const data = new Map(),
    calls = []
  return {
    data,
    calls,
    async read(name) {
      return data.get(name) ?? null
    },
    async put(name, bytes, generation = '0', mutable = false) {
      assert.equal(data.get(name)?.generation ?? '0', generation, 'generation conflict')
      calls.push(['put', name, mutable])
      data.set(name, { bytes, generation: String(+(data.get(name)?.generation ?? 0) + 1) })
    },
    async verify(name) {
      calls.push(['verify', name])
    },
  }
}
test('announces alpha only after all immutable assets are publicly verified; identical retry works', async () => {
  const store = memoryStore(),
    release = fixture()
  const link = await publishWindows(release, store)
  assert.match(link, /cerms5-releases\/windows\/CERMS-5-5.0.0-alpha.2-win-x64.exe$/)
  const announcement = store.calls.findIndex((c) => c[0] === 'put' && c[1] === 'windows/alpha.yml')
  assert.equal(store.calls.slice(0, announcement).filter((c) => c[0] === 'verify').length, 3)
  assert.equal(store.data.has('windows/latest.yml'), false)
  await publishWindows(release, store)
  assert.deepEqual(announcementChannels('5.0.0'), ['latest', 'alpha', 'beta', 'rc'])
})
test('incomplete downloads, replacements and downgrades never announce a release', async () => {
  const store = memoryStore()
  store.verify = async () => {
    throw new Error('public hash mismatch')
  }
  await assert.rejects(publishWindows(fixture(), store), /hash mismatch/)
  assert.equal(store.data.has('windows/alpha.yml'), false)
  const complete = memoryStore()
  await publishWindows(fixture(), complete)
  await assert.rejects(publishWindows(fixture('5.0.0-alpha.1'), complete), /older version/)
  const changed = fixture()
  changed.files[0].bytes = Buffer.from('replacement')
  await assert.rejects(publishWindows(changed, complete), /Never overwrite/)
})
test('concurrent publisher cannot replace an announcement made since its initial read', async () => {
  const store = memoryStore(),
    original = store.verify
  store.verify = async (name) => {
    await original(name)
    store.data.set('windows/alpha.yml', {
      bytes: fixture('5.0.0-alpha.3').manifest,
      generation: '9',
    })
  }
  await assert.rejects(publishWindows(fixture(), store), /generation conflict/)
  assert.equal(JSON.parse(store.data.get('windows/alpha.yml').bytes).version, '5.0.0-alpha.3')
})
test('cloud adapter uses only isolated bucket, conditional uploads and uncached announcements', async () => {
  const calls = []
  const store = storageClient('synthetic-secret', async (url, opts = {}) => {
    calls.push({ url, opts })
    return new Response('{}', { status: opts.method === 'POST' ? 200 : 404 })
  })
  assert.equal(await store.read('windows/alpha.yml'), null)
  await store.put('windows/alpha.yml', Buffer.from('version: synthetic'), '123', true)
  const upload = calls[1]
  assert.match(
    upload.url,
    /cerms-7af24-cerms5-releases\/o\?uploadType=multipart&ifGenerationMatch=123$/,
  )
  assert.match(upload.opts.body.toString(), /no-store, max-age=0/)
  assert.match(upload.opts.body.toString(), /Content-Type: text\/yaml\r\n\r\nversion: synthetic/)
  await assert.rejects(store.put('legacy/file', Buffer.from('x')))
})
test('validates actual packaged feed, enabled updater and every installer byte before publishing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cerms-firebase-release-'))
  try {
    const f = fixture(),
      resources = join(dir, 'win-unpacked/resources'),
      source = join(dir, 'source')
    await mkdir(resources, { recursive: true })
    await mkdir(source)
    for (const file of f.files) await writeFile(join(dir, file.name), file.bytes)
    await writeFile(join(dir, 'alpha.yml'), f.manifest)
    const config = JSON.parse(
      await readFile(new URL('../config/desktop-releases.json', import.meta.url)),
    )
    await writeFile(
      join(resources, 'app-update.yml'),
      JSON.stringify({ provider: 'generic', url: config.windowsFeed, channel: 'alpha' }),
    )
    await writeFile(
      join(source, 'package.json'),
      JSON.stringify({
        version: f.version,
        cermsRelease: { updatesEnabled: true, releaseNotes: JSON.parse(f.manifest).releaseNotes },
      }),
    )
    await asar.createPackage(source, join(resources, 'app.asar'))
    assert.equal((await windowsAssets(dir, f.version)).files.length, 2)
    await writeFile(join(dir, f.files[0].name), 'tampered')
    await assert.rejects(windowsAssets(dir, f.version), /hash mismatch/)
    await writeFile(join(dir, f.files[0].name), f.files[0].bytes)
    await writeFile(join(resources, 'app-update.yml'), 'provider: github')
    await assert.rejects(windowsAssets(dir, f.version), /generic/)
    await writeFile(
      join(resources, 'app-update.yml'),
      JSON.stringify({ provider: 'generic', url: config.windowsFeed, channel: 'alpha' }),
    )
    await writeFile(
      join(source, 'package.json'),
      JSON.stringify({
        version: f.version,
        cermsRelease: { updatesEnabled: true, releaseNotes: 'Different packaged notes' },
      }),
    )
    await asar.createPackage(source, join(resources, 'app.asar'))
    await assert.rejects(windowsAssets(dir, f.version), /changelog must match/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('changelog content is immutable for an announced version and archived when a newer version publishes', async () => {
  const store = memoryStore(),
    first = fixture()
  await publishWindows(first, store)
  const archive = store.data.get('windows/releases/5.0.0-alpha.2.yml').bytes
  const changed = {
    ...first,
    manifest: Buffer.from(
      JSON.stringify({ ...JSON.parse(first.manifest), releaseNotes: 'Different notes' }),
    ),
  }
  await assert.rejects(publishWindows(changed, store), /cannot be replaced/)
  await publishWindows(fixture('5.0.0-alpha.3'), store)
  assert.deepEqual(store.data.get('windows/releases/5.0.0-alpha.2.yml').bytes, archive)
  const missing = {
    ...fixture('5.0.0-alpha.4'),
    manifest: Buffer.from(JSON.stringify({ ...JSON.parse(fixture().manifest), releaseNotes: '' })),
  }
  await assert.rejects(publishWindows(missing, store), /Add release notes/)
  assert.equal(store.data.has('windows/releases/5.0.0-alpha.4.yml'), false)
})

function macFixture(version = '5.0.0-alpha.2', updatesEnabled = true) {
  const zip = `CERMS-5-${version}-mac-universal.zip`,
    dmg = `CERMS-5-${version}-mac-universal.dmg`
  const files = [dmg, zip].flatMap((name) => [
    { name, bytes: Buffer.from('synthetic ' + name) },
    { name: name + '.blockmap', bytes: Buffer.from('synthetic blockmap') },
  ])
  const zipBytes = files.find((f) => f.name === zip).bytes
  return {
    version,
    updatesEnabled,
    files,
    manifest: Buffer.from(
      JSON.stringify({
        version,
        releaseNotes: '### Added\n- Synthetic release notes',
        path: zip,
        sha512: digest(zipBytes),
        files: [zip, dmg].map((name) => {
          const bytes = files.find((f) => f.name === name).bytes
          return { url: name, size: bytes.length, sha512: digest(bytes) }
        }),
      }),
    ),
  }
}
test('both platforms stage and verify before feeds advance; unsigned Mac downloads never replace a signed update feed', async () => {
  const store = memoryStore(),
    mac = macFixture()
  const links = await publishDesktop(
    [
      { platform: 'windows', assets: fixture() },
      { platform: 'macos', assets: mac },
    ],
    store,
  )
  assert.match(links.macos, /macos\/CERMS-5-5.0.0-alpha.2-mac-universal.dmg$/)
  const announce = store.calls.findIndex((c) => c[0] === 'put' && c[2])
  assert.equal(store.calls.slice(0, announce).filter((c) => c[0] === 'verify').length, 8)
  assert.ok(store.data.has('macos/alpha-mac.yml'))
  assert.ok(!store.data.has('macos/latest-mac.yml'))
  const original = store.data.get('macos/alpha-mac.yml').bytes
  await publishDesktop([{ platform: 'macos', assets: macFixture('5.0.0-alpha.3', false) }], store)
  assert.deepEqual(store.data.get('macos/alpha-mac.yml').bytes, original)
  assert.ok(store.data.has('macos/CERMS-5-5.0.0-alpha.3-mac-universal.dmg'))
  const broken = memoryStore()
  broken.verify = async (name) => {
    if (name.startsWith('macos/')) throw Error('Mac upload verification failed')
  }
  await assert.rejects(
    publishDesktop(
      [
        { platform: 'windows', assets: fixture() },
        { platform: 'macos', assets: mac },
      ],
      broken,
    ),
    /Mac upload/,
  )
  assert.ok(!broken.data.has('windows/alpha.yml'))
  assert.ok(!broken.data.has('macos/alpha-mac.yml'))
})
test('Mac publisher validates ZIP/DMG hashes, packaged Firebase feed and signing before enabling updates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cerms-mac-release-'))
  try {
    const f = macFixture(),
      source = join(dir, 'source'),
      resources = join(dir, 'mac-universal/CERMS 5.app/Contents/Resources')
    await mkdir(resources, { recursive: true })
    await mkdir(source)
    for (const file of f.files) await writeFile(join(dir, file.name), file.bytes)
    await writeFile(join(dir, 'alpha-mac.yml'), f.manifest)
    const settings = JSON.parse(
      await readFile(new URL('../config/desktop-releases.json', import.meta.url)),
    )
    await writeFile(
      join(resources, 'app-update.yml'),
      JSON.stringify({ provider: 'generic', url: settings.macosFeed, channel: 'alpha' }),
    )
    const savePackage = async (enabled) => {
      await writeFile(
        join(source, 'package.json'),
        JSON.stringify({
          version: f.version,
          cermsRelease: {
            updatesEnabled: enabled,
            releaseNotes: JSON.parse(f.manifest).releaseNotes,
          },
        }),
      )
      await asar.createPackage(source, join(resources, 'app.asar'))
    }
    await savePackage(true)
    let verified = 0
    const verifySigning = async () => {
      verified++
    }
    assert.equal((await macosAssets(dir, f.version, { verifySigning })).updatesEnabled, true)
    assert.equal(verified, 1)
    await assert.rejects(
      macosAssets(dir, f.version, {
        verifySigning: async () => {
          throw Error('not signed')
        },
      }),
      /not signed/,
    )
    await savePackage(false)
    assert.equal((await macosAssets(dir, f.version, { verifySigning })).updatesEnabled, false)
    assert.equal(verified, 1)
    await writeFile(join(dir, f.files[0].name), 'corrupt')
    await assert.rejects(macosAssets(dir, f.version, { verifySigning }), /hash mismatch/)
    await writeFile(join(dir, f.files[0].name), f.files[0].bytes)
    await writeFile(
      join(resources, 'app-update.yml'),
      JSON.stringify({ provider: 'generic', url: settings.windowsFeed, channel: 'alpha' }),
    )
    await assert.rejects(macosAssets(dir, f.version, { verifySigning }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
