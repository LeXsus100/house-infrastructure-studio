# House Infrastructure Studio

Local-only technical infrastructure editor for documenting walls, rooms, electrical systems, data cabling, Wi-Fi, security, HVAC, heating, plumbing, automation, and other concealed house services.

The application uses React, TypeScript, React Three Fiber/Three.js, an Express API bound to `127.0.0.1`, and a normalized SQLite database. It does not use cloud services, authentication, analytics, telemetry, external APIs, or remote storage. The supplied Manrope fonts and neutral application icons are bundled locally.

This is open-source software released under the [MIT License](LICENSE).

## Showcase

Screenshots and a short walkthrough video will be added here. Public showcase files can be placed under `docs/media/` and embedded in this section without mixing them with application runtime assets.

## Development provenance

House Infrastructure Studio was created through iterative human-directed development with substantial assistance from OpenAI Codex and generative AI. Luigi Casagrande defined the product requirements, reviewed the behavior, tested the application, and directed the implementation. Codex helped generate, revise, diagnose, document, and test portions of the source code. AI assistance does not change the license or reduce the responsibility of contributors to review and validate their changes.

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

The first launch creates an `Untitled house project` with one empty ground floor. Project names are ordinary user data: the software does not reserve or impose a house name. It does not invent rooms, address data, people, coordinates, or construction metadata.

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

The installer is written under `src-tauri/target/release/bundle/nsis/`. It bundles the web client, a private API on `127.0.0.1:4281`, SQLite migrations, a Node.js 24 runtime, and an embedded WebView2 bootstrapper. The installed editor therefore does not require Node.js or an internet connection. Desktop project data is stored in the operating system application-data directory, separate from the browser/server edition's `.data/` folder.

The installer is currently unsigned and can trigger Windows SmartScreen. Checksums verify download integrity but do not replace trusted Authenticode code signing. See [Publishing and updating on GitHub](docs/PUBLISHING.md) for the release and signing procedure.

## Local database

The default database is:

```text
.data/casa.sqlite
```

Print the exact resolved path:

```powershell
npm run db:path
```

Stop the server, then reset the database and recreate an empty default project on the next launch:

```powershell
npm run db:reset
```

Each project also receives its own local workspace at `.data/projects/<project-uuid>/`, containing a validated `project.json` mirror plus dedicated `assets/` and `exports/` folders. **Projects → Create another project** asks for a separate project name and creates a new UUID workspace without changing the current project's data.

`db:reset` permanently removes the local SQLite database, its WAL files, and all `.data/projects/` workspaces. Export a JSON project backup from the toolbar first if the data matters. To use another local location, set `HOUSE_INFRASTRUCTURE_DB_PATH` before starting the server. The older `CASA_DB_PATH` variable remains accepted only for backward compatibility.

## Italy-oriented visual identification defaults

- Electrical routes document single-phase `L1` brown, `N` blue, and `PE` yellow-green conductors by default; three-phase adds black `L2` and grey `L3`. Yellow-green is reserved for PE and blue for neutral.
- Data routes default to T568B and can switch to T568A. The eight internal pair colours are stored separately from the configurable physical Ethernet jacket colour; jacket colour never implies category, speed, PoE, or shielding.
- Conduit service colours are editable project conventions with an explicit service label and line pattern. Pipe Properties offers Italy-oriented water, hot-water/steam, fuel, gas, chemical, compressed-air, fire, hazardous, and drainage presets, each marked as standard identification or project convention.
- Every technical object separates `functionalColor`, `physicalColor`, `displayColor`, and `colorSource`. Colours supplement—not replace—service labels, icons, patterns, and technical metadata.

These defaults support practical documentation but do not certify legal compliance. Verify the applicable standards and installation rules with a qualified professional.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](docs/CHANGELOG.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Database schema](docs/DATABASE.md)
- [Keyboard and mouse controls](docs/CONTROLS.md)
- [Known limitations](docs/LIMITATIONS.md)
- [Local data and publication privacy](docs/PRIVACY.md)
- [Publishing and updating on GitHub](docs/PUBLISHING.md)
- [Security policy](docs/SECURITY.md)
- [MIT License](LICENSE)
