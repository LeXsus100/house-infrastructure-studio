# House Infrastructure Studio

Local-only technical infrastructure editor for documenting walls, rooms, electrical systems, data cabling, Wi-Fi, security, HVAC, heating, plumbing, automation, and other concealed house services.

The application uses React, TypeScript, React Three Fiber/Three.js, an Express API bound to `127.0.0.1`, and a normalized SQLite database. It does not use cloud services, authentication, analytics, telemetry, external APIs, or remote storage. The supplied Manrope regular/bold files and the neutral `app-icon.svg` are bundled locally; private branding is an optional local-only preference.

This is open-source software released under the [MIT License](LICENSE).

## Development provenance

House Infrastructure Studio was created through iterative human-directed development with substantial assistance from OpenAI Codex and generative AI. Luigi defined the product requirements, reviewed the behavior, tested the application, and directed the implementation. Codex helped generate, revise, diagnose, document, and test portions of the source code. AI assistance does not change the license or reduce the responsibility of contributors to review and validate their changes.

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

## Quick Windows launch

After running `npm install` once, double-click the local `start-house-studio.bat`. The launcher is intentionally ignored by Git and is not part of the public source/release package. It:

1. Checks that Node.js, npm, and the installed dependencies are available.
2. Creates the production build when `dist/` does not exist.
3. Starts the localhost server in a minimized command window.
4. Waits for the application to become available and asks Windows to open exactly one default-browser page at [http://127.0.0.1:4280](http://127.0.0.1:4280).

Close the minimized **House Infrastructure Studio Local Server** window to stop the server.

## Test

```powershell
npm test
```

The tests cover wall/route length, room boundary area, metric conversion, wall-local coordinates, device reattachment, deterministic export names, project serialization/import validation, SQLite persistence, route-to-port relationships, API validation, and undo/redo.

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

The installer is currently unsigned and can trigger Windows SmartScreen. Do not commit certificates or signing keys. See [Publishing and updating on GitHub](docs/PUBLISHING.md) for the manual source/update/release procedure.

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

## Essential workflow

1. Choose **Wall** (`W`), set the reinforced/structural core plus independent left and right drywall-lining thicknesses, then click two points on the plan. The finished total is derived from all three layers; exact wall dimensions remain editable in metres in Properties. Concealed wall routes use a lining layer rather than the structural core.
2. Create a room (`R`) by clicking its boundary and double-clicking to close it, or Ctrl-click at least three walls and choose **Room from selected walls**. Small wall gaps are connected when they do not cross another room. Room categories can be created, renamed, described, deleted, and assigned in Properties; selecting a room activates and fits its floor automatically.
3. Choose **Structure** (`T`); Door opening is selected initially. Place wall openings, a resizable Furniture reference, or choose the square/circular button beside **Column**. Openings snap to walls and cut actual empty space. Choose **Device** (`D`) for technical equipment; device placement and size fields use centimetres. Vertical service risers are placed from the Route setup because they are shared route endpoints.
4. Choose **Route** (`E`), select cable, pipe, duct, or junction and a service category, click the source device, optionally indicate the preferred path, then click the destination device once. Ports are displayed in a compact two-column chooser. If the device has no compatible port, choose the exact connection position on the embedded 3D model, name the port, and save it to resume the route immediately. The planner follows a short path, strongly reuses corridors leading to the same destination, and assigns bundled routes separate side-by-side lanes. In-wall geometry is normalized to horizontal/vertical runs. Floor and ceiling turns use an editable per-service bend radius, while structural transitions automatically reduce that radius to remain concealed in the wall lining/core. The cable reference plane defaults to 15 cm below the finished surface and uses the configurable deepest-to-shallowest stack **pipe → cable → duct**; floor-tier separation reuses each service's **Minimum side-by-side separation**, with no separate tier-spacing control. Inserting a service or changing the stack re-elevates existing floor runs while preserving local crossing clearances. It still observes the editable avoidance tiers and detours at least 10 cm around openings. New routes receive configurable floor-aware identifiers such as `S-GF-009`. Ceiling-associated endpoints stay on the ceiling plane before transitioning through a wall; a column can be clicked as an intermediate shaft. Junction mode splits an existing run and exposes branch ports. Set water, sewage, and HVAC flow direction in route Properties. Exact intermediate turning points can be inserted, edited, removed, or squared.
5. Use **X-ray** (`X`) to make every visible wall highly transparent while keeping routes and devices bright and selectable. Equipment racks and all equipment installed inside them remain opaque for legibility. Service filters consolidate lighting under **Electrical power**, Wi-Fi under **Ethernet & data**, and CCTV under **Security**. Use **All** or **None** to change every technical service filter together.
6. Opening a project starts on elevation 0 (or the nearest level). Selecting an active floor isolates its walls, structures, devices, routes, rooms, and measurements without turning off X-ray. Use the full-width **Full house** control explicitly to see all levels. **Adjacent blueprint** and its blue/amber legend live inside **Levels & blueprints** and remain off by default. The level manager provides a 50–400% zoomable blueprint preview, persisted two-point scale calibration, a project 0,0 marker, saved cross-floor registration points, and a saved two-point north arrow. Registered plans automatically share the elevation-zero plan's project coordinate, and scale/north/rotation edits preserve that anchor.
7. Every route automatically reserves 10 cm around unrelated wall-, floor-, and ceiling-mounted equipment. Floor transitions remain selectable from both adjacent levels without a visible cap, expand their schematic sleeve diameter as route lanes are added, and audit continuity from each route's selected flow direction.
8. A newly placed **Rack** is 800 mm wide, 1000 mm deep, and uses an editable prepared 22U layout. It includes exact 24/48-port switch jacks, paired 48- and 24-port patch panels, an empty cable U, and a shared 5U NAS/router/mini-PC shelf. Open **Settings → Devices & furniture → Rack systems** to inspect equipment top-to-bottom with U1 at the physical bottom, rename visible port labels, add configurable numbered or brush patch panels, add internal patch leads, and inspect the house route using each rear patch endpoint.
9. Select a wall and open **Wall scheme**. The default is a high-resolution 5× A4 landscape PNG; device heights, distances from the wall edge, and distances between adjacent devices are included when dimensions are enabled. Multi-wall routes are clipped so only the portion physically belonging to the selected wall is drawn.
10. Use **Batch wall schemes** to select rooms, walls, or the entire project and preview every deterministic filename before generating the local ZIP archive.
11. Open **Overview** beside the project title for interactive whole-house device, route-length, service, floor, installation, test, and drywall-area reports. The detail buttons sit directly below **Route length by service** and jump to the filtered asset inventory, rooms/zones, or **Lighting manager**. Each Light switch can document one or more controlled light points plus an ON/OFF reference state; this never operates live equipment.
12. Open **Photo**, immediately left of Settings, for a dedicated X-ray documentation view without moving route arrows. Filter photo categories, choose **Add photo point**, click a location, and attach one or more local JPEG/PNG/WebP images. The files stay in `.data/projects/<project-uuid>/assets/photos/` and their searchable marker metadata stays in SQLite.
13. Use the camera button at the upper-right of the 3D viewport to generate a printable low-ink, light-mode A4 image of the current view.
14. Choose **Container** (`C`) to place potable-water, rainwater, sewage, hot-water, solar-battery, or custom technical storage. Containers are resizable floor objects with connection ports and a capacity field.
15. Open **Settings** to change category colours and every device/container type's default colour and W/H/D dimensions. **Project diagnostics** also flags every cable run longer than 11 m (10 m target plus 1 m tolerance), alongside route conflicts, riser continuity, and unconnected devices. **Administration** can replace the in-app neutral icon with a private PNG/JPEG/WebP stored only in the local browser/desktop profile; it never enters a project backup or release. Settings keep explanations in compact custom hover help instead of permanent instructional paragraphs. Device, furniture, and rack previews use house-style controls: right-drag to orbit, middle-drag to pan, and the wheel to zoom; connection points use their service colours. Choose **+ Custom** in the device catalogue for a category/shape/size/colour dialog with a live schematic preview. Existing individual devices and routes can override functional, physical-product, and display colours independently in Properties.

Numeric fields accept either a decimal point or comma and allow an incomplete empty or `-` draft while editing. Leaving an invalid/empty draft restores its previous value. Device and route-point coordinates are labelled X/Y on the plan and Z vertically. The signed ceiling-route offset defaults to `-5 cm`: zero is the ceiling surface, negative is above it, and positive lowers the route into the room. The floor-route field is entered as a positive burial depth and anchors the cable tier at `15 cm` below the finished floor.

Device Properties keeps placement compact: X/Y/Z, width/height/depth, then rotation Z/distance from floor/depth in wall. Depth in wall is measured from the finished outer wall surface to the device BACK face, so drywall lining is included. Mounting-face and connection-point authoring belongs in **Settings → Devices & furniture**, not the Properties panel.

Use the **EN / IT** control at the top-right to switch the bundled local dictionaries. English is the default; the preference is stored only in the browser and no remote translation service is used.

## Italy-oriented visual identification defaults

- Electrical routes document single-phase `L1` brown, `N` blue, and `PE` yellow-green conductors by default; three-phase adds black `L2` and grey `L3`. Yellow-green is reserved for PE and blue for neutral.
- Data routes default to T568B and can switch to T568A. The eight internal pair colours are stored separately from the configurable physical Ethernet jacket colour; jacket colour never implies category, speed, PoE, or shielding.
- Conduit service colours are editable project conventions with an explicit service label and line pattern. Pipe Properties offers Italy-oriented water, hot-water/steam, fuel, gas, chemical, compressed-air, fire, hazardous, and drainage presets, each marked as standard identification or project convention.
- Every technical object separates `functionalColor`, `physicalColor`, `displayColor`, and `colorSource`. Colours supplement—not replace—service labels, icons, patterns, and technical metadata.

These defaults support practical documentation but do not certify legal compliance. Verify the applicable standards and installation rules with a qualified professional.

Right-drag is reserved for camera orbit and never opens an editor menu. Lock or unlock any selected wall, room, device, route, structure, or measurement from the top of the Properties panel. Locked selections cannot be edited, duplicated, or deleted.

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [MIT License](LICENSE)
- [Project organization and maintenance rules](AGENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/DATABASE.md)
- [Keyboard and mouse controls](docs/CONTROLS.md)
- [Known limitations](docs/LIMITATIONS.md)
- [Publishing and updating on GitHub](docs/PUBLISHING.md)
- [Local data and publication privacy](docs/PRIVACY.md)
- [Security policy](SECURITY.md)

## Local assets

The original font assets remain in `font/`. The authoritative public website icon is the neutral `public/app-icon.svg`; matching Windows icons are under `src-tauri/icons/`. Private branding such as `local-assets/branding/house_icon.png` remains ignored outside Vite's `public/` directory, so it cannot enter a web build or installer; choose it locally through **Settings → Administration**. `src/styles.css` registers:

- `font/Manrope-Regular.ttf` as weight 400
- `font/Manrope-Bold.ttf` as weight 700

No remote font or image request is required at runtime.
