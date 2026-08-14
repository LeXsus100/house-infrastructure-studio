# Local data and publication privacy

## Data that remains local

House models can reveal room geometry, concealed routes, equipment, blueprints, and photographs. These are user data, not source code.

The browser/server edition stores them under `.data/`. The Windows desktop edition stores its database and project workspaces in the Tauri application-data directory for the `studio.house.infrastructure` identifier (normally below the current Windows user's application-data folder). Neither edition uploads project data.

The Git ignore policy excludes database files, project workspaces, exports, backup files, local environment/package credentials, private branding, generated binaries, installers, and signing keys. A manual staged-file review is still required before every push because ignore rules cannot recognize every possible private filename.

## Application icon behavior

- `public/app-icon.svg` is the neutral public source icon.
- `src-tauri/icons/` contains neutral icons generated from that source for the Windows executable and installer.
- Private branding belongs under ignored `local-assets/branding/`; `house_icon.png` was moved there so Vite cannot copy it into a web build or installer.
- **Settings → Administration → Choose local icon** accepts a PNG, JPEG, or WebP file up to 4 MB.
- The override is stored in local browser/WebView storage. It is not part of `ProjectSnapshot`, SQLite, a project JSON backup, or a GitHub Release.
- Resetting local storage or choosing **Use neutral icon** restores the neutral icon.

Windows embeds an executable icon at build time, so a local override changes the branding shown inside the application, not the signed/installed executable icon. This prevents a private image from entering a standard release accidentally.

## Network boundary

The web production server listens only on `127.0.0.1:4280`. The Tauri sidecar listens only on `127.0.0.1:4281`. The API rejects non-loopback Host headers, untrusted browser origins, and untrusted cross-site state-changing requests; only Tauri's exact built-in origins receive the desktop exception. The application contains no telemetry, analytics, authentication service, cloud sync, or remote project store.

Package installation and release building can contact npm, Rust crates, GitHub Actions, the official Node.js license source, and the WebView2 build source. Those are development/release operations; the installed editor and its project workflows remain local-only.

## Release contents

The Windows installer contains the neutral app assets, built React client, local API bundle, SQLite migrations, Node.js runtime, Node.js license notices, and Tauri/WebView bootstrapper configuration. It must not contain `.data`, `local-assets`, a project database, project folders, local icon overrides, any private `house_icon.png`, the legacy batch launcher, environment files, `.npmrc`, or signing keys.

Use the checklist in [PUBLISHING.md](PUBLISHING.md) before every manual push and release.
