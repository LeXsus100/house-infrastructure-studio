---
title: Release history
description: Current and previous releases, with notable changes by version.
---

# Release history

<div class="his-page-lead">
  <span class="his-section-id">RELEASE STATUS</span>
  <p>Version 0.3.0 is the current House Infrastructure Studio release, dated 29 September 2026.</p>
</div>

| Status | Version | Date | Link |
| --- | --- | --- | --- |
| Current release | **0.3.0** | 29 September 2026 | [Open v0.3.0](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.3.0) |
| Previous release | **0.2.11** | 29 August 2026 | [Open v0.2.11](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.2.11) |

## 0.3.0 · 29 September 2026

### Workspace and navigation

- Add dedicated Edit and View workspaces. View preserves camera and visibility
  state, collapses editor panels, and exposes current-view capture.
- Add independent left-sidebar and Properties controls. Properties opens with a
  selection and can remain collapsed during focused modelling.
- Add a top-toolbar 2D View control for true orthographic floor plans.
- Keep the `X` X-ray shortcut available during navigation in View mode.
- Move service visibility, room browsing, and photo documentation into compact
  popovers under the floor controls.

### Model and catalogue

- Add separate indoor and outdoor camera types, a doorbell, and a PoE doorbell
  speaker. Retire the previous video-intercom catalogue definition during
  upgrade while preserving migrated project devices as Intercom records.
- Expand spatial photo categories to Finished house, Cable systems, Structural,
  Electrical, Data, Plumbing, HVAC, Security, and Other.
- Reset photo-marker visibility when a project opens so each project begins
  with a clean model view.
- Record the local edit time for normal edits, undo, and redo, and display it in
  the status bar.
- Keep custom measurement text together with the calculated metric length.

### Routes and infrastructure

- Add configurable pipe and duct gravity grades, applied in the documented flow
  direction across concealed floor, ceiling, and shallow wall runs.
- Use direct shortest paths across open floor and ceiling planes, with curved
  detours when an equipment envelope blocks the line.
- Preserve smooth, bounded clearance hills on level and graded routes while
  keeping automatic samples outside authored turn counts.
- Improve route containment at junction boxes, device shells, wall linings,
  structural transitions, and short lane connectors.
- Terminate junction-box routes at the enclosure centre and size expandable
  boxes and panels from port space plus connected route dimensions.
- Refine shared-endpoint conflict tolerance, project-upgrade repair, and
  coordinated floor-level route layout.
- Add `npm run routes:rebuild` for a dry-run route audit, with an explicit
  `--apply --project <project-uuid>` mode that creates a SQLite backup first.

### Exports and documentation

- Add A2, A3, and A4 landscape output for wall schemes and current-view sheets.
- Add local PNG and self-contained PDF output, plus deterministic PNG/PDF ZIP
  batches for multiple walls.
- Add granular wall-sheet controls for geometry, dimensions, devices, routes,
  metadata, measurements, legend, title information, and individual objects.
- Add collision-aware annotation placement with leader lines.
- Add scalable current-view sheets with an editable caption and north
  indicator.
- Replace the previous Capabilities page with a structured Features section and
  current 0.3.0 screenshots and animation.
- Reorganize Controls into shorter task-based sections with stable visual IDs.

### Validation

- Add focused tests for gravity grades, curved crossings, direct plane routes,
  junction terminations, export layouts, PDF generation, deterministic batch
  names, label placement, measurement labels, and project upgrades.

## Previous releases

### 0.2.11 · 29 August 2026

It corrected the deployed documentation media links
so the capability images and animations load from the GitHub Pages base path.

[Open GitHub Release v0.2.11](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.2.11)

### 0.2.1 · 29 August 2026

Rebuilt and published the compiled documentation site after the initial 0.2.0
documentation release.

[Open GitHub Release v0.2.1](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.2.1)

### 0.2.0 · 29 August 2026

Introduced the dedicated Zensical documentation project, release-aligned GitHub
Pages workflow, branded homepage, user and developer guides, and public media.

[Open GitHub Release v0.2.0](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.2.0)

### 0.1.21 · 23 August 2026

- Opened the short local-project setup screen on first launch and created the
  named project with its UUID workspace and empty ground floor.
- Improved startup of the bundled desktop API and waited for its health check
  before loading project data.

[Open GitHub Release v0.1.21](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.1.21)

### 0.1.2 · 23 August 2026 · Prerelease

- Added the in-application tutorial for levels, blueprints, creation tools,
  properties, reports, lighting, photographs, views, and themes.
- Persisted route points generated for crossing clearance.
- Improved route geometry around wall crossings, openings, service clearances,
  and structural surfaces.
- Strengthened packaged Windows startup and desktop error reporting.

[Open GitHub Release v0.1.2](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.1.2)

### 0.1.0 · 14 August 2026 · Prerelease

- Added the local React and Three.js residential infrastructure editor with
  SQLite persistence.
- Added multi-level walls, rooms, structures, devices, ports, routes,
  measurements, X-ray inspection, wall schemes, reports, photographs, and
  local backups.
- Added extensible technical catalogues, English and Italian dictionaries,
  themes, undo and redo, service filters, route planning, Tauri packaging, and
  publication privacy guidance.

[Open GitHub Release v0.1.0](https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.1.0)

## Repository tag 0.1.1

The repository contains a `v0.1.1` tag dated 14 August 2026. GitHub has no
published Release record for that tag, so it is intentionally excluded from the
published-release list above.

[Browse tag v0.1.1](https://github.com/LeXsus100/house-infrastructure-studio/tree/v0.1.1)
