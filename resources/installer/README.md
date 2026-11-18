# Installer artwork

The Windows assisted NSIS setup uses the existing CERMS icon, a forest-green sidebar on the welcome/finish and uninstall pages, and a compact white header on the intermediate pages. `installer.nsh` adds short welcome/finish copy and skips the welcome page during an update using electron-builder’s existing `skipPageIfUpdated` callback. The default installation, finish launch, uninstall and updater behavior remain owned by electron-builder. User data is retained on uninstall.

The Mac DMG uses a 720 × 460 point Finder window with a Retina TIFF background. The real app and Applications shortcut sit at (205, 250) and (515, 250), with 96-point icons. The background has no duplicate app labels; Finder supplies these. ZIP downloads and automatic updates retain their current behavior.

Edit the SVG sources, then run `npm run artwork:installers`. This uses the existing `functions/node_modules/sharp` development installation to render the unchanged logo into the designs, generate uncompressed 24-bit Windows BMPs and a 144-dpi Mac TIFF. The PNGs are preview assets. Generated installer assets live alongside the sources, so normal releases do not require artwork regeneration or additional dependencies. No model-generated assets or downloads are needed.

Open `preview.html` for approximate Windows/Mac layout previews. These are presentation mockups, not screenshots of a packaged installer. Actual native controls depend on the operating system.

Validation completed without building or packaging an app: electron-builder configuration schema, BMP dimensions/24-bit format, TIFF dimensions/144-dpi metadata, visual review, and bundled NSIS Modern UI preprocessing with the welcome/finish artwork and update-skip callback. The actual packaged Windows installer and mounted Mac DMG remain to be checked during the next explicitly requested release. No version bump, signing/notarization, upload or Firebase deployment is part of this design change.
