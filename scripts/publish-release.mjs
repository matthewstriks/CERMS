import { validateNotes } from './changelog.cjs'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { validateRelease } from './release-check.mjs'
const require = createRequire(import.meta.url)
const { load } = require('js-yaml')
export async function validateAssets(directory, version) {
  const names = await readdir(directory)
  // GitHub labels select prereleases; electron-builder 26 writes latest manifests.
  const channel = 'latest'
  const expected = [
    `CERMS-5-${version}-win-x64.exe`,
    `CERMS-5-${version}-mac-universal.dmg`,
    `CERMS-5-${version}-mac-universal.zip`,
    `${channel}.yml`,
    `${channel}-mac.yml`,
  ]
  for (const name of expected) assert.ok(names.includes(name), `Missing release asset: ${name}`)
  const permitted = new Set([
    ...expected,
    ...expected.slice(0, 3).map((name) => `${name}.blockmap`),
  ])
  const allowed = names.filter((name) => permitted.has(name))
  let releaseNotes
  for (const manifest of expected.slice(3)) {
    const data = load(await readFile(join(directory, manifest), 'utf8'))
    assert.equal(data.version, version)
    const notes = validateNotes(data.releaseNotes)
    if (releaseNotes !== undefined)
      assert.equal(notes, releaseNotes, 'Platform release notes must match')
    releaseNotes = notes
    assert.ok(Array.isArray(data.files) && data.files.length, 'Update manifest must list files')
    for (const file of data.files) {
      assert.equal(basename(file.url), file.url, 'Manifest files must be local release asset names')
      assert.ok(allowed.includes(file.url), `Manifest references missing asset ${file.url}`)
      const bytes = await readFile(join(directory, file.url))
      assert.equal(
        createHash('sha512').update(bytes).digest('base64'),
        file.sha512,
        `Hash mismatch for ${file.url}`,
      )
      assert.equal(bytes.length, file.size, `Size mismatch for ${file.url}`)
    }
  }
  return allowed.sort()
}
async function publish() {
  assert.equal(process.env.GITHUB_REF_TYPE, 'tag', 'Publish only from a version tag')
  const { version, prerelease } = await validateRelease({ tag: process.env.GITHUB_REF_NAME })
  const repository = process.env.GITHUB_REPOSITORY
  assert.match(repository ?? '', /^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/)
  assert.ok(process.env.GITHUB_TOKEN, 'GitHub Actions release token required')
  const names = await validateAssets('release-assets', version)
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  async function api(path, method = 'GET', body) {
    const r = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!r.ok)
      throw new Error(`GitHub release request failed (${r.status}); any draft remains unpublished.`)
    return r.json()
  }
  const repo = await api('')
  assert.equal(repo.private, false, 'Public releases are required for token-free desktop updates')
  const tag = `v${version}`
  const releases = await api('/releases?per_page=100')
  let release = releases.find((r) => r.tag_name === tag)
  if (release)
    assert.equal(
      release.draft,
      true,
      'Never overwrite an already-published version; increment the version instead',
    )
  else
    release = await api('/releases', 'POST', {
      tag_name: tag,
      name: `CERMS ${version}`,
      draft: true,
      prerelease,
      body: load(await readFile(join('release-assets', 'latest.yml'), 'utf8')).releaseNotes,
    })
  await api(`/releases/${release.id}`, 'PATCH', {
    body: load(await readFile(join('release-assets', 'latest.yml'), 'utf8')).releaseNotes,
  })
  for (const asset of release.assets ?? []) {
    const r = await fetch(
      `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`,
      { method: 'DELETE', headers },
    )
    assert.ok(r.ok, 'Could not replace a draft asset')
  }
  for (const name of names) {
    const url = new URL(release.upload_url.replace(/\{.*$/, ''))
    assert.equal(url.origin, 'https://uploads.github.com')
    url.searchParams.set('name', name)
    const bytes = await readFile(join('release-assets', name))
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
    assert.ok(r.ok, `Upload failed for ${name}; release stays a draft`)
  }
  const ready = await api(`/releases/${release.id}`)
  assert.deepEqual(ready.assets.map((a) => a.name).sort(), names)
  const published = await api(`/releases/${release.id}`, 'PATCH', {
    draft: false,
    prerelease,
    make_latest: prerelease ? 'false' : 'true',
  })
  console.log(`Published complete release: ${published.html_url}`)
}
if (process.argv[1]?.endsWith('publish-release.mjs')) await publish()
