# Desktop installers and updates

Windows and Mac alpha downloads are distributed from the isolated Cloud Storage bucket
`cerms-7af24-cerms5-releases` in the Firebase project. GitHub is not required to
publish an alpha. The client installs the Firebase-enabled Windows alpha once,
then receives newer published versions through `electron-updater`. Signed Mac
installations use the separate Mac feed. Apple signing is not configured yet,
so current Mac packaging produces manual-install downloads with updates disabled.

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

Run this on **macOS**. It increments the alpha version once, synchronizes the
lockfile, prepares the changelog, builds the desktop once, then packages Windows
x64 NSIS and a universal Mac DMG plus ZIP (Intel and Apple Silicon). Release-time
validation checks the actual packaged feeds, release notes and artifact hashes.
It does not run the broad client test suite. All immutable Windows and Mac files
are publicly hash-verified before either update feed is advanced. The command
prints both download links. It does not create a Git commit/tag, push source or
publish to GitHub.

When no Apple credentials are configured, Mac packaging is explicitly unsigned:
its DMG/ZIP are uploaded, but its automatic updater stays disabled and no mutable
Mac channel announcement is published. A manual build can never replace a signed
Mac update announcement. With complete signing/notarization credentials, the same
command enables Mac automatic updates, verifies the Developer ID signature and
stapled notarization ticket, then announces the Mac ZIP in `macos/alpha-mac.yml`.
Partial Apple setup stops the command before changing the version.

If a build fails after incrementing, use `npm run release:desktop` to retry the
same version for both platforms. Use `npm run release:upload` to retry only the
upload of already-built artifacts. An interrupted announcement may leave one
platform advanced; retry the exact existing artifacts to finish the other feed.
Publication across the two channel objects is not atomic. Identical uploads are
safe; changed bytes cannot replace a version. Rebuilding already-uploaded signed
artifacts may change their bytes, so prefer the upload-only retry. After success,
use `release:alpha` for the next version.

`npm run release:win` remains a Windows-only current-version release/retry,
usable on Windows or macOS. `npm run release:upload:win` retries its upload only.
The combined command rejects non-macOS hosts before any version change because
Mac signing/packaging requires macOS. Publishing uses the existing local Firebase
CLI login, never a credential embedded in an installer. If that login expires,
run `firebase login --reauth` and retry.

The printed Mac link has this form (substitute the newly published version):

```text
https://storage.googleapis.com/cerms-7af24-cerms5-releases/macos/CERMS-5-VERSION-mac-universal.dmg
```

This change has not published a Mac download or incremented the version. Only run
the release command when the user explicitly requests a release.

## Edit the changelog and publish

Edit [CHANGELOG.md](../CHANGELOG.md) under **Unreleased**, then run:

```sh
npm run release:alpha
```

The command validates the draft before incrementing the alpha version, records
its notes under that version in the changelog, leaves a new empty Unreleased
section, runs checks, builds the installer and publishes through the existing
isolated Firebase release bucket. Use `### Added`, `### Changed` or `### Fixed`
for groups; `##` headings are reserved for Unreleased and version numbers.
Headings, paragraphs, bullets, numbered lists and fenced code blocks display in
the app. Notes are public release information and are rendered as inert text;
HTML and external links are not executed or loaded.

`release:desktop` resumes both platforms for the current version (`release:win`
resumes Windows only) using recorded notes; it preserves
any new Unreleased draft. `release:upload` retries an already-built upload and
uses the notes captured in those built artifacts. To publish changed notes,
create a new version. Published installers and version manifests remain
immutable, including their embedded notes. Empty or oversized notes and a
mismatch between the installer snapshot and feed notes stop publication.

`npm run changelog:prepare` records notes for the current package version without
building or publishing. The release workflow and CI call this automatically;
use it manually only after selecting a new package version yourself. Regular
`npm run build`, `npm run check` and `npm run release:check` do not consume or
change the Unreleased draft.

When a newer update is offered, **What's new** is available in the update notice
while downloading and once ready, and in **Settings → Software updates** even
if the notice was dismissed. Opening or closing the notes does not install an
update or change the current form. Missing notes have an explicit fallback;
notes for a different version are never reused. Older installed builds need to
install a build containing this UI once before they can show notes for later
updates. This source change does not itself publish or install a version.

Verification: `npm run check` and `npm run test:updates`. Release tests use
in-memory storage and temporary inert packages; updater tests use synthetic IPC
and a loopback-only Windows feed. No real installer is executed, fake version
published, release bucket modified or Firebase business data written as a test.

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

## Mac signing and CI

The initial signed `5.0.0-alpha.10` attempt failed before publication because
electron-builder 26.15.3 used the certificate import password to unlock its
temporary keychain. The build dependency is now pinned to 26.16.1, which passes
the correct keychain password. The release runner also removes Mac `CSC_*` and
`APPLE_*` credentials from the Windows child process, preserving only explicit
`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` Windows signing inputs. Resume the current
version with `npm run release:desktop` from the terminal containing the credentials;
do not use `release:alpha` to retry a failed build. No retry/build/publication was
performed as part of this fix. Actual signing/notarization still needs the retry.

Mac downloads now embed the fixed generic Firebase feed from
`config/desktop-releases.json`, separate from the Windows feed. Signed alpha
installations read `macos/alpha-mac.yml`; stable installations read
`macos/latest-mac.yml`. The ZIP is required by the Mac updater; the DMG is the
human download. Preserve both artifacts and their blockmaps. Unsigned builds do
not announce updates. The first signed Mac build must be installed manually into
Applications and launched there; subsequent signed releases can auto-update.
Older GitHub-feed previews also need that first Firebase-feed installation.

**Apple setup is currently missing.** Before automatic Mac updates can activate:

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create a [Developer ID Application certificate](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
   and export it with its private key as a password-protected `.p12`. Keep it
   outside the repository.
3. Configure the release terminal through a private environment/secret manager:
   `CSC_LINK` (certificate path), `CSC_KEY_PASSWORD` (export password), `APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD` (not your normal Apple password), and
   `APPLE_TEAM_ID`. Never paste passwords into chat or commit them. Complete
   credentials automatically select signed mode for `release:alpha` and
   `release:desktop`; a partial configuration fails instead of silently producing
   an unsigned release.
4. Install Apple's command-line tools for signing/notarization (`xcode-select --install`
   if needed). The first signed release must be validated on a real Mac before
   claiming end-to-end update installation works.

Direct electron-builder/CI builds still require `CERMS_MAC_SIGNED_RELEASE=1` and
`CERMS_RELEASE_BUILD=1` to enable the signed updater. Windows certificates can
use `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. Keep the same application identity
and signing team across updates. Never add a signature-verification bypass.

The GitHub Actions workflow remains build-only on tags/manual requests. It builds
Windows and universal Mac artifacts with Firebase feeds; it does not publish them.
Local `dist`/`package` commands also never publish, and preview builds do not
enable automatic updates by default.

Focused validation for this change:
`node --test scripts/release.test.mjs scripts/firebase-release.test.mjs`.
The tests use synthetic ASAR packages and in-memory Storage, with mocked signing
verification. No real installer was built, Apple submission made, release uploaded,
version changed or Firebase configuration modified. Actual signed N-to-N+1 Mac
installation remains unverified until Apple credentials and signed builds exist.

## Validation

`npm run test:updates` covers controller behavior, release validation/publishing,
the Electron update UI and a synthetic loopback-only Windows feed. The real updater
downloads inert synthetic bytes, rejects corruption/downgrades and keeps stable
installs separate; it never runs an installer. `npm run check` runs client tests,
type checking and the production build.

A physical Windows installation and actual N-to-N+1 installer execution still
require a Windows machine. Successful synthetic downloads are not claimed as a
physical end-to-end Windows installation test.

The editable changelog integration was verified November 15, 2026 with 210 client
checks, 13 synthetic changelog/release/publisher checks, build, release-input
validation, the Electron notes dialog and the loopback Windows updater. Tests
covered versioned note snapshots, changed-note publication refusal, packaged/feed
mismatches, safe rendering, missing notes and preserved explicit installation.
This implementation leaves the version at `5.0.0-alpha.3` and the new notes in
Unreleased, ready for developer review before the next release command.

## Installation confirmations — November 17, 2026

Installed builds notify `matthew@rocmtssolutions.com` on the first successful CERMS sign-in for each installation/version. A downloaded update does not qualify: the main process reports `app.getVersion()` from the running installed app. The first user to sign in supplies the verified actor identity; later logins, including different users on that same installation/version, do not resend. Each computer/user installation has its own random ID, persisted in `installation-tracking.json` under the CERMS 5 app-data directory. The file survives ordinary upgrades and retained-data reinstalls; clearing the app data creates a new installation identity. No hardware serial, MAC, password or authentication token is stored in that file. Computer name, platform, process architecture and OS release come from the main process. Development runs are disabled.

The first tracked version generates an installation confirmation with no invented previous version. Later changes include the previous tracked version. The client saves the identity before reporting, uses exclusive initial file creation and atomic updates, and deduplicates concurrent requests. Short transient retries reuse the same identity/version; unresolved delivery retries on a later sign-in. A corrupt identity is not silently reset.

The authenticated `reportInstallation` callable derives the user from Auth and the existing named-cerms profile/business. It sends only to the fixed owner address and writes only `installationUpdates/{sha256(installationId:version)}` in named `cerms`. This audit is server-only under the existing default-deny rules. A transaction claims each event once, retains its first actor/device, and suppresses duplicate email across callers and lost responses. Uncertain SMTP acceptance is retained for review rather than automatically resent. These messages confirm a reported installed running version; they are not hardware attestation.

Notification failure never fails sign-in. There are no user/profile version writes, Auth changes, business-record writes, Storage uploads, legacy mail-extension actions or project-wide Auth triggers. The callable uses the existing isolated support mail identity/secret. Deploy only `functions:cerms-staff:reportInstallation` with `firebase.installation.json`; its predeploy command builds the small shared payload validator. Rules, indexes, other functions, schedules, buckets and IAM/secret settings stay unchanged. Evidence: `INSTALLATION-DEPLOYMENT.json`.

Focused checks: `npx vitest run tests/installation-reporting.test.ts`, `node --test functions/installation.test.mjs`, and `node scripts/pos-smoke.mjs --installation-report`. They use memory/synthetic profiles and intercepted mail/network only; no real test notification is sent. Desktop compilation is performed once and reused for packaging.
