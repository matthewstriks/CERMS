import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import asar from '@electron/asar'
import {
  publishWindows,
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
      JSON.stringify({ version: f.version, cermsRelease: { updatesEnabled: true } }),
    )
    await asar.createPackage(source, join(resources, 'app.asar'))
    assert.equal((await windowsAssets(dir, f.version)).files.length, 2)
    await writeFile(join(dir, f.files[0].name), 'tampered')
    await assert.rejects(windowsAssets(dir, f.version), /hash mismatch/)
    await writeFile(join(dir, f.files[0].name), f.files[0].bytes)
    await writeFile(join(resources, 'app-update.yml'), 'provider: github')
    await assert.rejects(windowsAssets(dir, f.version), /generic/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
