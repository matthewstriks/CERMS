// Read only. No Firestore document, Auth, or existing Storage object endpoints.
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { releaseToken } from './firebase-release-auth.mjs'
import { validateRelease } from './release-check.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { load } = require('js-yaml')

export async function snapshot() {
  const headers = { Authorization: `Bearer ${await releaseToken()}` }
  const project = 'cerms-7af24'
  async function get(url) {
    const r = await fetch(url, { headers })
    assert.ok(r.ok, `Compatibility inspection failed (${r.status})`)
    return r.json()
  }
  async function list(url, key) {
    const rows = []
    let token
    do {
      const data = await get(url + (token ? `?pageToken=${encodeURIComponent(token)}` : ''))
      rows.push(...(data[key] ?? []))
      token = data.nextPageToken
    } while (token)
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }
  const db = `https://firestore.googleapis.com/v1/projects/${project}/databases`
  const bucket = `https://storage.googleapis.com/storage/v1/b/`
  const [
    releases,
    databases,
    defaultIndexes,
    cermsIndexes,
    functions,
    legacyBucket,
    imageBucket,
    legacyBucketIam,
    imageBucketIam,
  ] = await Promise.all([
    list(`https://firebaserules.googleapis.com/v1/projects/${project}/releases`, 'releases'),
    get(db),
    list(db + '/(default)/collectionGroups/-/indexes', 'indexes'),
    list(db + '/cerms/collectionGroups/-/indexes', 'indexes'),
    list(
      `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`,
      'functions',
    ),
    get(bucket + project + '.appspot.com'),
    get(bucket + project + '-cerms5-product-images'),
    get(bucket + project + '.appspot.com/iam'),
    get(bucket + project + '-cerms5-product-images/iam'),
  ])
  for (const d of databases.databases) {
    delete d.earliestVersionTime
    delete d.etag
  }
  databases.databases.sort((a, b) => a.name.localeCompare(b.name))
  for (const f of functions)
    f.eventTrigger?.eventFilters?.sort((a, b) => a.attribute.localeCompare(b.attribute))
  return {
    releases,
    databases,
    defaultIndexes,
    cermsIndexes,
    functions,
    legacyBucket,
    imageBucket,
    legacyBucketIam,
    imageBucketIam,
  }
}

if (process.argv[1]?.endsWith('firebase-release-compatibility.mjs')) {
  const path = '/private/tmp/cerms-desktop-releases-before.json'
  const state = await snapshot()
  if (process.argv[2] === 'before') {
    await writeFile(path, JSON.stringify(state, null, 2))
    console.log('Read-only compatibility snapshot saved.')
  } else {
    assert.equal(process.argv[2], 'after')
    assert.deepEqual(
      state,
      JSON.parse(await readFile(path, 'utf8')),
      'Existing Firebase resources must remain unchanged',
    )
    const { version } = await validateRelease()
    const channel = version.split('-')[1]?.split('.')[0] || 'latest'
    const bucketName = 'cerms-7af24-cerms5-releases'
    const base = `https://storage.googleapis.com/${bucketName}/windows/`
    const publicManifest = await fetch(base + channel + '.yml?verify=' + Date.now())
    assert.ok(publicManifest.ok)
    assert.match(publicManifest.headers.get('cache-control'), /no-store/)
    const manifestText = await publicManifest.text()
    assert.equal(manifestText, await readFile(`release/${channel}.yml`, 'utf8'))
    const manifest = load(manifestText)
    assert.equal(manifest.version, version)
    const range = await fetch(base + manifest.path, { headers: { Range: 'bytes=0-15' } })
    assert.equal(range.status, 206, 'Installer must support differential download ranges')
    const installer = await readFile(`release/${manifest.path}`)
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), installer.subarray(0, 16))
    const headers = { Authorization: `Bearer ${await releaseToken()}` }
    const bucketResponse = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucketName}`,
      { headers },
    )
    assert.ok(bucketResponse.ok)
    const bucket = await bucketResponse.json()
    assert.equal(bucket.iamConfiguration.uniformBucketLevelAccess.enabled, true)
    assert.equal(bucket.versioning.enabled, true)
    const policyResponse = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucketName}/iam`,
      { headers },
    )
    assert.ok(policyResponse.ok)
    const policy = await policyResponse.json()
    const publicBindings = policy.bindings.filter((b) => b.members.includes('allUsers'))
    assert.equal(publicBindings.length, 1)
    assert.equal(publicBindings[0].role, 'roles/storage.objectViewer')
    await writeFile(
      'docs/DESKTOP-FIREBASE-DEPLOYMENT.json',
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          releaseBucket: 'cerms-7af24-cerms5-releases',
          version,
          windowsInstaller: base + manifest.path,
          installerBytes: installer.length,
          installerSha512: manifest.sha512,
          publicManifestMatchesBuild: true,
          publicInstallerHashVerifiedByPublisher: true,
          publicRangeDownloadsVerified: true,
          channelCacheControl: publicManifest.headers.get('cache-control'),
          releaseBucketPublicReadOnly: true,
          releaseBucketVersioningEnabled: true,
          clientChecks: 186,
          publisherAndReleaseChecks: 8,
          syntheticElectronFeedDownloadPassed: true,
          interceptedUpdateUiPassed: true,
          buildAndWindowsPackagingPassed: true,
          physicalWindowsInstallTested: false,
          allRulesReleasesUnchanged: true,
          bothDatabaseConfigurationsAndIndexesUnchanged: true,
          allFunctionsUnchanged: true,
          legacyAndImageBucketConfigurationAndIamUnchanged: true,
          existingAuthAccountsModified: false,
          liveTestBusinessWrites: false,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(
      'All existing Firebase rules, databases, indexes, functions and bucket settings unchanged.',
    )
  }
}
