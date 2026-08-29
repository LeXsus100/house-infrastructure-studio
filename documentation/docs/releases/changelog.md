# Changelog

All notable project changes are documented here. The format follows Keep a Changelog principles, and releases use semantic versioning.

## [Unreleased]

### Changed

- Move all public project documentation into a dedicated, branded Zensical site under `documentation/`.
- Add strict local documentation builds and release-aligned GitHub Pages deployment. Source and software-release controls remain manual.

## [0.1.21] - 2026-08-23

### Added

- Open a short local-project setup screen on first launch and create the named
  project with its own UUID workspace and empty ground floor.

### Fixed

- Start the bundled desktop API reliably from the installed application and
  wait for its health check before loading project data.

## [0.1.2] - 2026-08-23

### Added

- Add the in-application project tutorial for levels, blueprints, creation
  tools, properties, reports, lighting, photographs, views, and themes.
- Persist route points generated automatically for crossing clearance.

### Changed

- Improve route geometry around wall crossings, openings, service clearances,
  and structural surfaces.
- Strengthen packaged Windows startup and desktop error reporting.

## [0.1.1] - 2026-08-14

### Fixed

- Wait for the bundled desktop API to become ready before loading the first project, and prevent the packaged API entry point from opening the same port twice.
- Open the desktop window maximized with a smaller fallback and minimum size for lower-resolution displays.

### Changed

- Set the Windows installer publisher and package author to Luigi Casagrande.
- Simplify the public README, reserve a showcase-media location, keep local assistant instructions out of GitHub, and place public Markdown documentation under `docs/`.
- Attach a SHA-256 checksum to new installer releases and link an open-source PowerShell verification script from the release body.

## [0.1.0] - 2026-08-14

### Added

- Local React/Three.js residential infrastructure editor with SQLite persistence.
- Multi-level walls, rooms, structures, devices, ports, routes, measurements, X-ray inspection, wall schemes, reports, photo documentation, and local backups.
- Extensible electrical, data, security, HVAC, heating, plumbing, automation, container, furniture, and rack-system data.
- English and Italian interface dictionaries, light/dark/system themes, undo/redo, service filtering, and technical route planning.
- Neutral public branding with a private local icon override in Administration settings.
- Tauri Windows desktop wrapper and current-user NSIS installer workflow.
- Localhost API hardening, publication privacy guidance, tests, and GitHub Actions checks.

[0.1.1]: https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.1.1
[0.1.0]: https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.1.0
[0.1.2]: https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.1.2
[0.1.21]: https://github.com/LeXsus100/house-infrastructure-studio/releases/tag/v0.1.21
