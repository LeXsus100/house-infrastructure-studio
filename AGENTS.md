# Project organization

This repository contains the local-only **House Infrastructure Studio** technical infrastructure editor. Keep changes within the structure below and preserve the localhost-only, offline-capable architecture.

## Folder ownership

```text
.
├─ src/                     React client
│  ├─ components/          Toolbars, sidebars, properties, and export dialogs
│  ├─ editor/              React Three Fiber viewport and scene interaction
│  └─ lib/                 Geometry, project state, serialization, and export logic
├─ shared/                 Types shared by the browser and local server
├─ server/                 Express API and SQLite persistence
│  └─ migrations/          Ordered, append-only SQLite migrations
├─ tests/                  Critical geometry, state, validation, API, and database tests
├─ docs/                   Architecture, schema, controls, and limitations
├─ public/                 Browser-ready fonts and neutral public application icon
├─ font/                   Original supplied font files; keep unchanged
├─ config/                 TypeScript JSON configuration
├─ scripts/                Local build/version helpers; never push automatically
├─ src-tauri/              Windows desktop wrapper, neutral icons, and installer config
├─ .github/workflows/      Read-only CI and tag-triggered draft installer release
├─ .data/                  Runtime SQLite files; local and ignored by Git
├─ start-house-studio.bat  Private local launcher; ignored by Git
├─ README.md               Setup and user-facing operating instructions
└─ package.json            npm-required root manifest and supported commands
```

## Maintenance rules

- Keep all application listeners bound to `127.0.0.1`. Do not add deployment, cloud storage, authentication, telemetry, analytics, external APIs, or multi-user features.
- Store geometric dimensions as integer millimetres. Convert to Three.js metres only at the rendering boundary.
- Keep core relationships normalized in SQLite. JSON columns are for bounded value objects, extensible technical metadata, and custom key/value properties—not a replacement for relational data.
- Add schema changes as a new numbered migration. Never edit an already-released migration without an explicit migration strategy.
- Validate every API write before opening a transaction. Use prepared statements for application data.
- Keep project mutations immutable so undo/redo continues to work correctly.
- Preserve user-defined project titles and the Manrope font files. Keep `public/app-icon.svg` neutral; private branding belongs under ignored `local-assets/branding/` and must never be referenced or committed.
- The browser/server API uses `127.0.0.1:4280`; the desktop sidecar uses `127.0.0.1:4281`. Preserve Host/origin/fetch-site boundary checks on both.
- Release workflows may build draft GitHub Releases after a manually pushed version tag. Never add an automatic source push or automatically publish a release.
- Use service labels or line patterns in addition to colour so technical routes remain distinguishable accessibly.
- Update `docs/CONTROLS.md` when shortcuts or mouse behaviour change.
- Update `docs/LIMITATIONS.md` when a listed limitation is resolved or a new material limitation is introduced.
- Add or update tests for geometry, attachment, serialization, validation, database, undo/redo, or filename behaviour affected by a change.
- Before handing off a change, run `npm test` and `npm run build`.

## Generated and runtime content

Do not edit or commit `node_modules/`, `dist/`, `.data/`, coverage output, SQLite WAL/SHM files, test reports, `src-tauri/target/`, generated sidecar/runtime resources, installers, private icons, environment/package credentials, or signing material. The authoritative source is under `src/`, `shared/`, `server/`, `scripts/`, `src-tauri/`, and `docs/`.
