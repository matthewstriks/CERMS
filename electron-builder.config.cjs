const { build } = require('./package.json')
const { version } = require('./package.json')
const { loadReleaseNotes } = require('./scripts/changelog.cjs')
const releaseNotes = loadReleaseNotes(version)
const { windowsFeed } = require('./config/desktop-releases.json')
const slug = process.env.CERMS_RELEASE_REPOSITORY || 'matthewstriks/CERMS-5'
if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(slug))
  throw new Error('Set CERMS_RELEASE_REPOSITORY to owner/repository.')
const [owner, repo] = slug.split('/')
const release = process.env.CERMS_RELEASE_BUILD === '1'
const platform =
  process.env.CERMS_RELEASE_PLATFORM ||
  (process.argv.includes('--win')
    ? 'windows'
    : process.argv.includes('--mac') || process.platform === 'darwin'
      ? 'macos'
      : process.platform)
const signedMac = release && process.env.CERMS_MAC_SIGNED_RELEASE === '1'
module.exports = {
  ...build,
  artifactName: 'CERMS-5-${version}-${os}-${arch}.${ext}',
  releaseInfo: { releaseName: `CERMS ${version}`, releaseNotes },
  electronUpdaterCompatibility: '>=6.8.12',
  publish:
    platform === 'windows'
      ? [
          {
            provider: 'generic',
            url: windowsFeed,
            channel: version.split('-')[1]?.split('.')[0] || 'latest',
            useMultipleRangeRequest: false,
          },
        ]
      : [{ provider: 'github', owner, repo, private: false, releaseType: 'draft' }],
  extraMetadata: {
    cermsRelease: { updatesEnabled: release && (platform !== 'macos' || signedMac), releaseNotes },
  },
  mac: {
    ...build.mac,
    target: ['dmg', 'zip'],
    hardenedRuntime: true,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    forceCodeSigning: signedMac,
    ...(!signedMac ? { identity: null } : {}),
    notarize: signedMac,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    deleteAppDataOnUninstall: false,
  },
}
