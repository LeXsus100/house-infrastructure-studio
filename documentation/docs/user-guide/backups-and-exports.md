# Backups and exports

Exports are generated locally and stay on the computer until you choose to copy,
send, or publish them.

For the visual workflow and current export dialog, see
[Exports and field output](../features/exports.md).

## JSON project backup

Use the toolbar backup command to export the current validated project snapshot.
The JSON contains the structured model needed for project import, including
photo-marker metadata.

!!! warning "Photograph files require a workspace copy"

    Photo files live in the project workspace under `assets/photos/`. The JSON
    backup records their metadata; the binary files remain in that folder. Copy
    the project workspace as part of any full disaster-recovery backup.

Blueprint image data is stored in the validated project snapshot. Even so,
retain the original plan outside the app because it is the authoritative source
document.

## Wall schemes

The wall-scheme exporter uses the same printable workflow as the current-view
exporter: choose an A2, A3, or A4 landscape sheet, edit the caption, inspect the
complete paper preview, and save a fixed 5× PNG or PDF. Single-wall exports are
downloaded directly. Batch PNG and PDF exports create a local ZIP with one file
per wall; repeated wall names receive deterministic numeric suffixes so entries
cannot overwrite one another.

The Content sidebar independently controls wall geometry and dimensions,
devices and their names/height/offset dimensions, routes and their metadata,
measurements, legend, and title-block fields. Individual devices, routes, and
measurements on the previewed wall can also be hidden. Printed labels are placed
into the nearest free area and connected back to their anchor with a leader line,
which prevents ordinary device, route, and measurement text from stacking on
top of other labels.

## Current-view snapshots

The current WebGL view can be placed on a high-resolution, low-ink A2, A3, or A4
landscape sheet and saved as PNG or a self-contained PDF. Enter View mode to
reveal the capture button. Every preset uses a fixed 5× print raster (about
360 DPI). The scalable SVG paper master keeps the border, title information,
and north indicator sharp while embedding a high-resolution Three.js scene
capture. The capture omits the XYZ gizmo and softens the drafting grid. Set the
camera, floor/full-house scope, service visibility, room isolation, and X-ray
state before capture; 2D and perspective projections are both supported, and
the caption remains editable in the preview.

## Reports

The whole-house overview derives its inventory and room/zone organization from
the active local project snapshot. Treat generated reports as a review aid and
rebuild them after model changes.

## Safe backup practice

1. Save and wait for the save status to settle.
2. Export a JSON project backup.
3. If photographs matter, separately copy the matching project workspace.
4. Store at least one copy outside the application's data directory.
5. Test importing a disposable copy after significant releases.
6. Inspect content before sharing; a backup can reveal the physical layout and
   concealed services of a home.

## Reset is destructive

For the browser/server edition, `npm run db:reset` permanently removes the local
SQLite database, its WAL files, and all `.data/projects/` workspaces. Stop the
server and export any project that matters before running it.

Print the resolved browser/server database path with:

```powershell
npm run db:path
```
