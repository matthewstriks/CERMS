# CERMS 5

An Electron + React + TypeScript **application skeleton** for Club Entertainment Record Management System. This is a starting point for the rewrite, not an operational replacement for CERMS 4.

## Run

Use Node 22.12 or newer (`.nvmrc` selects Node 22).

```sh
npm ci
npm run dev
```

The app opens in a compact login window with the application version, Firebase email/password sign-in, forgot password, and a support placeholder. Successful sign-in opens the maximized workspace (not fullscreen); sign-out returns to the login window. Sessions end on reload or close.

Members and Admissions & rentals offer **read-only access to the `cerms` Firestore database in project `cerms-7af24`** using your current CERMS staff account. The public client configuration has been copied locally to ignored `.env.local`; no Admin credentials are used. See [read-only membership setup](docs/MEMBERSHIP-READONLY.md). Admissions & rentals uses live Firestore listeners for active visits and member details. See [admissions connection](docs/ADMISSIONS-READONLY.md). Unimplemented modules display a simple unavailable state. No sample records are displayed in the application.

To launch the production bundle locally, run `npm run build` then `npm start`.

## Local member creation

Run `npm run dev:members`, then open **http://127.0.0.1:5174/lab/index.html** to try the new member form against a disposable local Firestore emulator. Use synthetic data only. All original options are included except waiver handling; checkout is not implemented. Ctrl+C stops the environment and discards its records. Java 21 and a cached Firestore emulator are required.

This separate test environment does not connect to the live database or enable member creation in the desktop app. See the [member creation audit, compatibility contract, and migration plan](docs/MEMBER-CREATION.md).

## Included

- Electron 44.4.1, React 19.3, strict TypeScript, electron-vite, and one npm lockfile.
- Sidebar navigation, shared components and theme, lazy-loaded feature views, loading/error states, and a separate desktop profile.
- A shared live admissions view on Overview and Admissions & rentals, read-only member search and details, account information, and application version.
- Clear “Not implemented yet” states for products, sales, registers, history, reporting, messaging, and events.
- Firebase sign-in and a read-only membership reader, matching the existing member fields and search modes. A desktop request guard blocks membership/Storage writes and account changes. Narrow exceptions allow user-requested password-reset emails and the designated owner’s access-only system switch.
- Sandboxed renderer, context isolation, narrow typed preload API, IPC sender checks, bundled assets, restrictive CSP, and an application protocol.

## About CERMS

Open **CERMS → About CERMS** on macOS or **Help → About CERMS** on Windows/Linux. Settings also includes an About button. The custom window displays the installed version, developer and platform, with a Copy app details button. Run `npm run test:about` for the desktop check.

## System switching

Only UID `c7D7AH07kgXmjn8tSiOgzHscLZ12` sees **Change system** below the current system in the sidebar. Choose a system and click **Switch system** to save its document ID to that user's `access` field and reload the workspace without signing in again. Other users have no switcher. See [system switching](docs/SYSTEM-SWITCHING.md).

## Project layout

```text
src/main/               Electron lifecycle, protocol, desktop security
src/preload/            Explicit desktop bridge
src/shared/             Types crossing the desktop boundary
src/domain/legacy.ts    Legacy record → view-model adapters (never write these back)
src/data/               Repository contract and synthetic fixtures
src/renderer/src/       React shell, components, feature views, theme
tests/                  Compatibility and desktop-boundary tests
scripts/smoke.mjs       Desktop launch/navigation smoke test
docs/                   Existing system map and rewrite decisions
```

## Checks and packaging

```sh
npm run check           # Unit tests, type check, production build
npm run test:smoke      # Launches Electron and exercises the skeleton; needs a desktop session
npm run test:membership # Desktop checks using synthetic Firebase responses and admissions UI fixtures
npm run test:admissions # Real listener test in an isolated local emulator (Java 21 + cached Firestore emulator required)
npm run package         # Build an unpacked application for the host OS; never publishes
npm run dist            # Produce the host platform's installer; never publishes
```

Installer configuration is a starting point. Signing, notarization, production icons, automated releases, and update delivery are not configured. Windows printing, signature devices, QuickBooks, and installers need their own validation later.

## Documentation

- [Existing CERMS system map](docs/LEGACY-SYSTEM-MAP.md)
- [Architecture and database compatibility plan](docs/ARCHITECTURE.md)
- [Phased implementation roadmap](docs/ROADMAP.md)
- [Verification results](docs/VERIFICATION.md)

The existing CERMS directory and backend have not been changed. After CLI reauthentication, metadata confirmed `cerms-7af24/(default)` is Standard edition and the existing indexes were inspected read-only. Deployed authorization rules and live staff sign-in still require validation; automated membership tests use synthetic responses and make no live database requests.
