# House Infrastructure Studio

Local-only technical infrastructure editor for documenting walls, rooms, electrical systems, data cabling, Wi-Fi, security, HVAC, heating, plumbing, automation, and other concealed house services.

The application uses React, TypeScript, React Three Fiber/Three.js, an Express API bound to `127.0.0.1`, and a normalized SQLite database. Project data and runtime activity stay on the local computer. The supplied Manrope fonts and neutral application icons are bundled locally.

This is open-source software released under the [MIT License](LICENSE).

Read the [documentation](https://github.com/LeXsus100/house-infrastructure-studio/tree/main/documentation/docs) for the getting-started guide, user guide, reference, development notes, and release history.

## Development provenance

House Infrastructure Studio was created through iterative human-directed development with substantial assistance from OpenAI Codex and generative AI. Luigi Casagrande defined the product requirements, reviewed the behavior, tested the application, and directed the implementation. Codex helped generate, revise, diagnose, document, and test portions of the source code. The MIT License applies to the resulting work, and every contributor remains responsible for reviewing and validating each change.

## Requirements

- Node.js 24 or later (the server uses Node's built-in SQLite module)
- npm 11 or later
- A current desktop browser with WebGL enabled

Building the optional Windows desktop installer also requires the stable MSVC Rust toolchain, Visual Studio C++ Build Tools, and WebView2 as described in the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

## Install and run in development

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The local data API runs at `http://127.0.0.1:4280` and is proxied by Vite. Both listeners bind to localhost only.

The first launch opens a short local-project setup screen. Enter any project name to create its SQLite record and dedicated workspace folder with one empty ground floor. Rooms, address details, coordinates, and construction metadata are added later as the project requires them.

## Test

```powershell
npm test
```

The tests cover critical geometry, attachment, export filenames, project serialization and validation, SQLite persistence, route-to-port relationships, API boundaries, desktop API startup readiness, and undo/redo.

## Build and run the production-style local server

```powershell
npm run build
npm start
```

Open [http://127.0.0.1:4280](http://127.0.0.1:4280). The same localhost Express server serves the built client and API.

## Windows desktop application and installer

Prepare and open the Tauri desktop application in development:

```powershell
npm run desktop:dev
```

Build the current-user NSIS installer:

```powershell
npm run desktop:build
```

The installer is written under `src-tauri/target/release/bundle/nsis/`. It bundles the web client, a private API on `127.0.0.1:4281`, SQLite migrations, a Node.js 24 runtime, and an embedded WebView2 bootstrapper. This package supports offline use on a Windows computer with WebView2. Desktop project data is stored in the operating system application-data directory, separate from the browser/server edition's `.data/` folder.

The installer is currently unsigned and can trigger Windows SmartScreen. Checksums verify download integrity; trusted Authenticode code signing would establish publisher identity. See [Publishing releases](https://github.com/LeXsus100/house-infrastructure-studio/blob/main/documentation/docs/development/publishing.md) for the release and signing procedure.

## Local database

The default database is:

```text
.data/casa.sqlite
```

Print the exact resolved path:

```powershell
npm run db:path
```

Stop the server, then reset the database; the next launch will show the local-project setup screen:

```powershell
npm run db:reset
```

Each project also receives its own local workspace at `.data/projects/<project-uuid>/`, containing a validated `project.json` mirror plus dedicated `assets/` and `exports/` folders. **Projects → Create another project** asks for a separate project name, preserves the current project, and creates a new UUID workspace.

`db:reset` permanently removes the local SQLite database, its WAL files, and all `.data/projects/` workspaces. Export a JSON project backup from the toolbar first if the data matters. To use another local location, set `HOUSE_INFRASTRUCTURE_DB_PATH` before starting the server. The older `CASA_DB_PATH` variable remains accepted only for backward compatibility.
