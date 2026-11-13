# Windows and Mac installers and updates

The first local builds are version `5.0.0-alpha.1`:

- Windows 64-bit: `release/CERMS-5-5.0.0-alpha.1-win-x64.exe` — NSIS installer, GitHub updater enabled.
- Mac Intel + Apple Silicon: `release/CERMS-5-5.0.0-alpha.1-mac-universal.dmg` — universal installer preview; signing is deferred, so updates are manual.
- Mac ZIP and platform `.yml`/`.blockmap` files are update assets, not the normal installation download.

Windows auto-update has been implemented and packaged; it can receive updates after the new public `matthewstriks/CERMS-5` repository has published higher-version releases. There is no GitHub release online yet. A normal code push does not distribute an update: a new version tag does. This keeps unfinished work out of installed apps.

## Put the project in its new repository

Use a **public** `CERMS-5` repository for token-free update downloads. Never embed a GitHub token in the desktop. The source may be kept private in a more advanced split setup, but this workflow intentionally uses one public source/release repository.

The existing workspace's `origin` is the legacy `matthewstriks/CERMS` repository. Do not push this release there or change that repository's contents. The source ZIP produced by `python3 scripts/export-desktop-source.py` contains a fresh source snapshot with no `.git` history/remotes, ignored `.env.local`, build output or dependencies. Extract it to a separate folder for the new repository. Public Firebase client identifiers are deliberately included in `config/firebase-client.json` so installers can sign in without requiring a user's `.env.local`; they are not Admin credentials. Database clients remain fixed to named `cerms`.

One-time setup with GitHub Desktop:

1. Extract `release/CERMS-5-source-5.0.0-alpha.1.zip` into a separate folder.
2. In GitHub Desktop, add that folder and choose to create a repository there when prompted.
3. Commit the files, then **Publish repository**, name `CERMS-5`, under `matthewstriks`. Uncheck **Keep this code private**.
4. On GitHub, open **Actions → Desktop installers and releases → Run workflow** to get fresh unsigned preview installers. Download them from that run's `cerms-windows` / `cerms-macos` artifacts.
5. To publish the first installable prerelease, push tag `v5.0.0-alpha.1` on that source commit. GitHub Desktop's **Repository → Open in Terminal** can be used for the commands below.

If the empty repository is created in GitHub's website first, clone it into a separate folder, copy the extracted source there, and commit/push it. Never copy `.env.local`, certificates or signing credentials. The GitHub connector available in this session cannot create a repository or upload release binaries, and no GitHub CLI credential is configured on this Mac; local installers and source are provided independently of that setup.

```sh
# Run in the NEW CERMS-5 repository, after committing the initial source.
git tag v5.0.0-alpha.1
git push origin v5.0.0-alpha.1
```

The workflow runs tests, builds on Windows/macOS runners, verifies both installers and update metadata against hashes and sizes, uploads all files to a draft, then publishes only after the complete asset set is present. `v5.0.0-alpha.1` becomes a GitHub prerelease. The Windows installer automatically checks that repository; no GitHub account/token is required on users' machines.

## Publish the next version

Commit the code changes first. From a clean checkout of the new repository:

```sh
npm version prerelease --preid=alpha  # alpha.1 → alpha.2; updates lockfile and creates a version commit/tag
git push origin main --follow-tags
```

For the first stable release use `npm version 5.0.0`; later stable fixes use `npm version patch`. Tags must exactly match `package.json` and the lockfile. Do not replace assets or reuse an already-published version. The pipeline refuses to overwrite a published release. Alpha installs accept newer prereleases and stable releases; stable installs stay on stable releases. Downgrades are disabled.

Install the `.exe` on Windows or drag CERMS 5 from the `.dmg` to Applications on Mac. Current unsigned installers can produce operating-system publisher/security prompts. Signing is optional for this first testing stage; it is not silently bypassed in the app.

## Update behavior

Windows release builds check approximately 15 seconds after launch and every four hours. **Help → Check for Updates…** (Windows) / **CERMS → Check for Updates…** (Mac) and **Settings → Software updates** expose manual checks. New Windows versions download in the background, display progress and an update-ready notice, then install on normal quit. **Install and restart** requires an explicit native confirmation reminding staff to finish checkout/save forms. An update never forces an automatic restart during work. A failed check/download leaves the current app usable and offers retry. Data stays in the separate `CERMS-5` user-data directory; Firebase sessions remain memory-only and require signing in after restart.

An unsigned Mac preview explicitly disables the updater; install a new `.dmg` manually. After Apple signing is enabled, install the **first signed Mac build manually**. Subsequent signed Mac releases support the same automatic workflow. Existing unsigned Mac installations cannot be converted to working Squirrel updates merely by uploading a signed next version.

## Signing later — optional now

For Mac automatic updates, enroll in the Apple Developer Program and create a **Developer ID Application** certificate for distribution outside the App Store. Export the certificate **with its private key** to a password-protected `.p12`. In the NEW repository's **Settings → Secrets and variables → Actions**, configure:

| Secret                        | Value                                        |
| ----------------------------- | -------------------------------------------- |
| `CSC_LINK`                    | Base64-encoded signing `.p12`                |
| `CSC_KEY_PASSWORD`            | `.p12` export password                       |
| `APPLE_ID`                    | Apple Developer account email                |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific Apple password for notarization |
| `APPLE_TEAM_ID`               | Apple Developer Team ID                      |

All five must be present before the workflow enables signing/notarization and Mac updates. Until then, Mac builds continue as unsigned/manual-update previews without blocking Windows releases. Keep the same app ID and Apple signing team for later updates. Do not put any of these values in chat, code, or the source ZIP.

Optional Windows certificate-based signing uses `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. Windows updates do not require disabling signature validation in code; the library retains its normal checksum and publisher validation behavior. A cloud/HSM signing provider can be added later if preferred.

Official references: [electron-builder 26 auto-update requirements](https://www.electron.build/v26/docs/features/auto-update/), [publishing](https://www.electron.build/v26/docs/publish/), and [Electron signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Local builds and checks

```sh
npm ci
npm run check
npm run test:updates
npm run dist:win   # Native Windows runner recommended; cross-build from Mac also works in this workspace
npm run dist:mac   # Unsigned universal preview by default
```

Local `dist`/`package` commands never publish. `CERMS_RELEASE_BUILD=1 CERMS_RELEASE_PLATFORM=windows npm run dist:win` opts a local Windows installer into the configured GitHub update feed. A signed local Mac release additionally requires `CERMS_MAC_SIGNED_RELEASE=1` and the signing/notarization variables. CI sets these explicitly.

Validation in this session: 186 client checks and build; updater state/permission-flow tests; release completeness/hash checks; synthetic Electron progress/ready/retry/install-request checks; real Windows NSIS build and universal Mac DMG/ZIP build; valid DMG checksum; correct Windows/Mac updater opt-in metadata; and archive inspection excluding local secrets/backend files. Native Windows installation and a real published N→N+1 update require a Windows machine and published releases and have not been claimed as tested. No real sign-ins, account writes, checkout writes, Firebase deployments, signed builds or public releases were performed for this work.
