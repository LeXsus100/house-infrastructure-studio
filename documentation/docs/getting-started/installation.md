# Install and run

## Windows desktop edition

The project release workflow produces a current-user NSIS installer. The
installer bundles the web client, a private loopback API, SQLite migrations, a
Node.js 24 runtime, and the WebView2 bootstrapper.

1. Download the `*-setup.exe` file and its matching `.sha256` file from the
   intended [GitHub Release](https://github.com/LeXsus100/house-infrastructure-studio/releases).
2. Download `scripts/verify-release.ps1` from the same release tag.
3. Verify the installer before running it:

```powershell
powershell -File .\verify-release.ps1 -InstallerPath '.\downloaded-installer.exe'
```

4. Confirm that verification succeeds, then run the installer.
5. Launch **House Infrastructure Studio** and create a local project.

!!! note "Unsigned installer"

    The current installer is unsigned and can trigger Windows SmartScreen. A
    SHA-256 checksum detects a changed download. Trusted Authenticode signing
    would establish the publisher identity.

## Browser/server edition from source

### Requirements

- Node.js 24 or later
- npm 11 or later
- A current desktop browser with WebGL enabled

From the repository root:

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite serves the React
client and proxies `/api` to the Express API on `127.0.0.1:4280`.

For a production-style local run:

```powershell
npm run build
npm start
```

Open [http://127.0.0.1:4280](http://127.0.0.1:4280). Express now serves both
the built client and the API.

## Confirm the source checkout

```powershell
npm test
npm run build
```

The tests cover the critical geometry, persistence, validation, project
serialization, API boundary, route/port relationships, filenames, and
undo/redo behavior.

## Where data is stored

| Edition | Database and workspaces |
| --- | --- |
| Browser/server | `.data/casa.sqlite` and `.data/projects/<project-uuid>/` |
| Windows desktop | The Windows application-data folder for `studio.house.infrastructure` |

The desktop data location is deliberately outside the installation directory.
Uninstalling or upgrading the executable and deciding what to do with project
data are separate operations.
