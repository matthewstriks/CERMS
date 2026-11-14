# Desktop installers and updates

Windows alpha updates are distributed from the isolated Cloud Storage bucket
`cerms-7af24-cerms5-releases` in the Firebase project. GitHub is not required to
publish an alpha. The client installs the Firebase-enabled Windows alpha once,
then receives newer published versions through `electron-updater`.

## Send the first installer

Download link for `5.0.0-alpha.1`:

https://storage.googleapis.com/cerms-7af24-cerms5-releases/windows/CERMS-5-5.0.0-alpha.1-win-x64.exe

The local copy is `release/CERMS-5-5.0.0-alpha.1-win-x64.exe`. This Windows build
replaces the earlier local GitHub-feed build. Use this Firebase-enabled installer
for the client. Already-installed GitHub-feed previews require this installer once;
the update host is embedded at packaging time. App ID and the separate CERMS 5
user-data directory are preserved.

## Publish another alpha

From this project folder, with the Firebase CLI logged into the publishing account:

```sh
npm run release:alpha
```

This increments `5.0.0-alpha.1` to `5.0.0-alpha.2` (and so on), synchronizes the
lockfile, runs client checks and publisher tests, builds a Windows x64 installer,
verifies the packaged feed and enabled updater, uploads immutable version files,
verifies their public download hashes, then updates `windows/alpha.yml` last.
The command prints the installer link. It does not create a Git commit/tag, push
source, or publish to GitHub. Commit source and version changes using your usual
workflow.

If the build/upload fails, the version remains incremented. Retry that same version
with `npm run release:win`; use `npm run release:upload` to retry just the upload of
an already-built version. Identical uploads can be retried; different bytes cannot
replace an existing version. After a successful publication, use `release:alpha`
for the next update. Never reuse an announced version number.

The release command works on the current Mac using electron-builder's Windows
cross-build tooling, or on Windows with Node and the Firebase CLI installed.
Publishing credentials stay in the local CLI login; they are never in the app.
If the login expires, run `firebase login --reauth` and retry.

## What the client sees

The installed alpha checks 15 seconds after launch and every five minutes while
open. **Help → Check for Updates…** and **Settings → Software updates** check
immediately. A published newer alpha downloads automatically, displays progress,
and becomes ready to install on normal quit. **Install and restart** requires an
explicit native confirmation. No restart is forced during work. An offline or
failed check/download leaves the current app usable and supports retry.

The client does not download another installer manually for subsequent versions.
The app must still quit/restart to run the new version. Firebase sign-in is
memory-only, so staff sign in again after restart.

Stable builds check every four hours and use `latest.yml`; alphas use `alpha.yml`.
Alphas never update the stable feed. A future stable publication also updates the
alpha/beta/rc feeds so testing installs can advance to stable. Beta/rc promotion
from alpha is not automatic. Downgrades are blocked. Concurrent uploads use
Storage generation preconditions, so an older publisher cannot overwrite a feed
changed after it started.

## Release storage and isolation

Only the new release bucket is publicly readable. Installer and blockmap filenames
include the full version and are immutable; a version's metadata is also archived
under `windows/releases/{version}.yml`. Channel announcements use `no-store` caching.
Bucket object versioning preserves channel history. Public read access grants no
upload/edit rights. This bucket must contain release artifacts only, never member
records, credentials, or other private data.

No legacy bucket, product-image bucket, shared Storage rules, database, Auth account,
function or project IAM changes are needed. The desktop uses HTTPS downloads and
does not gain Storage write permissions. The existing Firebase request guard stays
unchanged. `config/desktop-releases.json` contains only public release endpoints.

`node scripts/publish-firebase-release.mjs --setup` creates/configures only the
fixed isolated bucket. It is a one-time setup, not part of each publish. Read-only
before/after compatibility evidence is in `docs/DESKTOP-FIREBASE-DEPLOYMENT.json`.
No fake production release, test sale, business record, image or account is created
for updater tests.

## Mac and CI

Mac previews remain unsigned and require manual DMG installation. Mac auto-updates
are disabled until Apple signing/notarization is configured, and moving Mac to a
Firebase feed is outside this Windows alpha setup. The first signed Mac build must
be installed manually. Subsequent signed releases can then auto-update.

The existing GitHub Actions workflow still builds Windows and universal Mac
artifacts on tags/manual requests, but no longer publishes GitHub Releases.
Windows artifacts embed the Firebase feed. Local `dist`/`package` commands never
publish, and previews do not enable updates by default. `release:win` explicitly
enables the Windows updater. No GitHub credentials or public source repo are
needed for this local alpha publishing flow.

Optional Mac signing requires `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, plus
`CERMS_MAC_SIGNED_RELEASE=1` in a release build. Windows certificates can use
`WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. No signature verification bypass is
added. Never embed certificates, private keys or tokens in source or binaries.

## Validation

`npm run test:updates` covers controller behavior, release validation/publishing,
the Electron update UI and a synthetic loopback-only Windows feed. The real updater
downloads inert synthetic bytes, rejects corruption/downgrades and keeps stable
installs separate; it never runs an installer. `npm run check` runs client tests,
type checking and the production build.

A physical Windows installation and actual N-to-N+1 installer execution still
require a Windows machine. Successful synthetic downloads are not claimed as a
physical end-to-end Windows installation test.
