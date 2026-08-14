# Architecture

## Runtime shape

The browser/server edition is one local process pair in development and one local process in production-style mode:

```text
Desktop browser
  ├─ React + TypeScript editor (Vite during development)
  ├─ React Three Fiber / Three.js viewport
  └─ Canvas PNG renderer + JSZip batch packaging
             │ localhost REST/JSON
             ▼
Express server on 127.0.0.1:4280
             │ prepared statements + transactions
             ▼
SQLite file at .data/casa.sqlite
             │ validated per-project mirror
             ▼
.data/projects/<project UUID>/{project.json,assets/,exports/}
```

Vite proxies `/api` to the Express server in development. After `npm run build`, Express serves both `dist/` and `/api` from `127.0.0.1:4280`. There are no public listeners or outbound application integrations.

The Windows desktop edition wraps the same built React client with Tauri:

```text
Tauri WebView (neutral executable icon)
  ├─ bundled React/Three.js client
  └─ local-only icon override in WebView storage
             │ REST/JSON on 127.0.0.1:4281
             ▼
Bundled Node.js sidecar + bundled Express API
             │ prepared statements + transactions
             ▼
Tauri application-data directory
  ├─ house-infrastructure.sqlite
  └─ projects/<project UUID>/{project.json,assets/,exports/}
```

`scripts/prepare-desktop.mjs` bundles `server/desktop.ts`, copies the current Node.js 24 runtime as a target-triple Tauri sidecar, and obtains the matching official Node.js license for the installer resources. Tauri marks that process as the desktop entry so the bundled browser/server fallback does not open the port a second time, while the client waits for `/api/health` before loading project data. Tauri embeds the neutral Windows icons and WebView2 bootstrapper, then produces a current-user NSIS installer. Generated sidecars, licenses, Rust targets, and installers are ignored.

## Client

- `src/App.tsx` coordinates project state, selection, creation tools, autosave, in-memory undo/redo, shortcuts, backup/import, and project management.
- `src/editor/HouseViewport.tsx` renders schematic walls, rooms, devices, physically scaled route widths, measurement lines, the metric grid, and predictable orbit/pan/zoom controls. Rendering-only wall splitting assigns overlapping corner, crossing, and collinear volumes to one stable wall without merging persisted wall records.
- `src/components/LeftSidebar.tsx` contains the active-level selector, full-house scope, layered-wall defaults, creation tools, the extensible device catalogue, route setup, and accessible service visibility controls.
- `src/components/LevelManagerDialog.tsx` owns ordered floor editing and local image-blueprint upload, zoomable persisted two-point calibration, saved-status display, project-origin display, cross-floor registration anchors, transform, opacity, and visibility. Pure registration transforms live in `src/lib/blueprint.ts`.
- `src/components/FurnitureDialog.tsx` selects schematic appliance/reference presets with useful default services, mounting backs, and ports.
- `src/components/PropertiesPanel.tsx` exposes exact wall geometry, compact technical-device placement, cable, pipe, duct, route-point, installation, display-colour, and custom-property fields. Device mounting-face and connection-point authoring is centralized in Settings and the route endpoint workflow. UI coordinates use X/Y on plan and Z vertically while stored Three.js boundary data remains `{x,y,z}` with `y` vertical.
- `src/components/ElevationDialog.tsx` previews one A4 orthographic wall scheme or a deterministic batch before local PNG/ZIP generation.
- `src/components/ViewSnapshotDialog.tsx` prepares the current WebGL view on a high-resolution, low-ink A4 canvas entirely in the browser.
- `src/components/OverviewPage.tsx` computes interactive whole-house MEP reports directly from the current local project snapshot, including filtered asset inventory and room/zone organization.
- `src/lib/lightingNetwork.ts` derives switch-to-light continuity from cable endpoints plus explicit junction, panel, and riser correspondences. The dedicated Light view renders only that network on the active floor and reports incomplete continuity.
- `src/components/PhotoSidebar.tsx` and `PhotoMarkerDialog.tsx` provide the dedicated X-ray photo-documentation view. Photo mode shares the toolbar X-ray state instead of duplicating local view controls. `FloorSelector.tsx` and `src/lib/floors.ts` provide the shared elevation-relative floor numbering used by Editor and Photo. Marker metadata is part of the immutable project snapshot; JPEG/PNG/WebP bytes are uploaded only to the matching project workspace under `assets/photos/`.
- `src/components/SettingsDialog.tsx` uses expandable sections and reusable hover-help targets for route tiers, a 15 cm default cable reference below the floor, configurable pipe/cable/duct vertical order and spacing, lateral clearances, IEC-aligned project naming conventions, drafting preferences, category colours, and every device/furniture type's size, mounting back, association, and positioned default ports. Its project diagnostics aggregate 3D route clashes, cable runs beyond the 10 m target plus 1 m tolerance, incomplete riser links/flow, invalid panel/junction correspondence, and devices with no route attachment. `RackSettingsPanel.tsx`, `RackPreview3D.tsx`, the shared `RackModel3D.tsx`, and `src/lib/rack.ts` add capacity-scaled 800 × 1000 mm per-rack U layouts, open-frame 3D equipment, exact service-coloured front/back port grids, configurable numbered/brush patch panels, patch-panel front/rear pairs, reciprocal internal leads, normalized house endpoints, and live connected-route inventories.
- `src/lib/appBranding.ts` owns the neutral icon fallback and validates the optional private icon override. The override uses local WebView/browser storage only and is deliberately absent from `ProjectSnapshot`, SQLite, exports, and backups. Settings exposes it in the Administration section.
- `src/components/RoutePortDialog.tsx` makes endpoint selection explicit in a compact two-column grid. Port occupancy is derived from route endpoint relationships; an occupied physical port cannot be reused until its previous route is reassigned to another compatible free port. When no compatible endpoint exists, an embedded 3D device editor creates a precisely positioned instance port and resumes the pending route without discarding its draft. Junction boxes and electrical panels expose the same editor continuously; `src/lib/devicePorts.ts` derives their minimum enclosure dimensions from each port's required termination area.
- `src/components/CustomDeviceTypeDialog.tsx` creates extensible catalogue entries with category, schematic shape, exact centimetre dimensions, display colour, and a local preview.
- `src/i18n/en.ts` and `src/i18n/it.ts` are the two local UI dictionaries. `src/lib/i18n.tsx` stores the EN/IT choice in browser-local storage; English is the default and no translation service is contacted.
- `src/lib/italianColors.ts` contains Italy-oriented conductor, Ethernet pair, conduit, pipe-identification, container, and project display defaults. Regulatory/reserved meaning, physical product colour, and user/project display colour are deliberately separate fields.
- `src/lib/geometry.ts` is the integer-millimetre geometry boundary. Three.js receives metre values only at render time. `src/lib/routeLayout.ts` performs bounded floor-level route-cluster analysis: it detects one run imposing detours on nearby services, rebuilds eligible concealed floor/ceiling alternatives, resolves the affected set in a coordinated order, and exposes before/after conflict, bend, and length metrics for an atomic 3D preview/apply workflow.
- `src/lib/elevation.ts` renders technical wall schemes directly to a local canvas without a remote rendering service.
- `src/lib/riser.ts` validates one-to-one, same-service cross-floor route links and groups linked floor records into physical sleeve lanes. `src/lib/diagnostics.ts` derives route, riser, panel/junction correspondence, and unconnected-device health lists without duplicating persisted state.

Project edits are immutable snapshots. A bounded 50-state history provides undo/redo. Autosave sends the current validated snapshot after an 800 ms quiet period, while explicit Save uses the same transaction path.

## Server

- `server/index.ts` defines the localhost-only REST API, import validation, meaningful errors, production static serving, a strict loopback Host allowlist, explicit local/Tauri origins, and Fetch-Metadata rejection for cross-site mutations.
- `server/desktop.ts` is the sidecar entry point on `127.0.0.1:4281`; the browser/server entry points remain on `127.0.0.1:4280`.
- `server/validation.ts` validates project snapshots and backup envelopes before any write.
- `server/db.ts` owns migration application, prepared queries, normalized reconstruction, and transactional saves.
- `server/migrations/001_initial.sql` defines the initial normalized schema and query-driven indexes. Later numbered migrations are append-only; migrations 004–006 add visual metadata, level blueprints, device mounting/port placement, and explicit floor ordering. Migration 007 adds normalized lighting-control relationships and photo-marker/asset metadata. Migration 008 adds normalized wall core and left/right lining columns. Migration 009 adds per-port termination-space requirements for expandable enclosures. Migration 010 adds application-wide built-in device defaults shared across local projects; project-created custom types remain isolated. Migration 011 adds the optional route installation date used by the shared installation workflow.

Whole-project saves use `BEGIN IMMEDIATE`, replace the project's dependent rows in relationship-safe order, and either commit the complete snapshot or roll everything back. In the same transaction, edits to built-in device definitions update the global local catalogue; loading or creating any project overlays that catalogue before returning data. Installed device instances and user-created custom types remain project-owned. Imports go through the same validator and repository transaction. After each successful save, the server atomically refreshes the project's local `project.json` mirror inside a UUID-validated workspace path; it never accepts a client-supplied filesystem path.

## Performance decisions

Wall and device meshes are simple low-poly primitives, and the project model keeps integer millimetres to avoid repeated floating-point drift. Visible curved-route geometry is memoized by project/view inputs, wall associations use indexed lookup, and each visible route fragment is submitted as one polyline rather than one draw call per sampled segment. The canvas renders on demand unless animated X-ray flow markers require continuous frames, while compass updates bypass React state. The current first version is appropriate for normal residential models; instanced meshes and spatial indexing are deferred until profiling shows they are needed.
