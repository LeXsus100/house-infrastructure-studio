# Local data and publication privacy

## Data that remains local

House models can reveal room geometry, concealed routes, equipment, blueprints,
and photographs. Treat every project file and asset as private user data.

The browser/server edition stores them under `.data/`. The Windows desktop
edition stores its database and project workspaces in the Tauri application-data
directory for the `studio.house.infrastructure` identifier, normally below the
current Windows user's application-data folder. Both editions keep project data
on the local computer.

The Git ignore policy excludes database files, project workspaces, exports,
backup files, local environment/package credentials, private branding,
generated binaries, installers, and signing keys. Review staged files manually
before every push; ignore rules cover patterns while the review covers the
actual content selected for publication.

## Application icon behavior

- `public/app-icon.svg` is the neutral public source icon.
- `src-tauri/icons/` contains neutral icons generated from that source for the Windows executable and installer.
- Private branding belongs under ignored `local-assets/branding/`; Vite excludes the local `house_icon.png` from web builds and installers.
- **Settings → Administration → Choose local icon** accepts a PNG, JPEG, or WebP file up to 4 MB.
- The override is stored in local browser/WebView storage, separate from `ProjectSnapshot`, SQLite, project JSON backups, and GitHub Releases.
- Resetting local storage or choosing **Use neutral icon** restores the neutral icon.

Windows embeds an executable icon at build time. A local override changes the
branding inside the application, while the installed executable keeps its
neutral build-time icon. This separation keeps private images out of standard
releases.

## Network boundary

The web production server listens on `127.0.0.1:4280`. The Tauri sidecar listens
on `127.0.0.1:4281`. The API accepts loopback Host headers and trusted local
origins; Tauri's exact built-in origins receive the desktop exception. Runtime
traffic stays within this local boundary, with project persistence handled by
SQLite and the matching local workspace.

Package installation and release building can contact npm, Rust crates, GitHub Actions, the official Node.js license source, and the WebView2 build source. Those are development/release operations; the installed editor and its project workflows remain local-only.

## Release contents

The Windows installer contains the neutral app assets, built React client, local API bundle, SQLite migrations, Node.js runtime, Node.js license notices, and Tauri/WebView bootstrapper configuration. It must not contain `.data`, `local-assets`, a project database, project folders, local icon overrides, any private `house_icon.png`, the legacy batch launcher, environment files, `.npmrc`, or signing keys.

Use the checklist in [Publishing and updating on GitHub](../development/publishing.md) before every manual push and release.
