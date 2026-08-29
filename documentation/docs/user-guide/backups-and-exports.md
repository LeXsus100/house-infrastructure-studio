# Backups and exports

Exports are generated locally and stay on the computer until you choose to copy,
send, or publish them.

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

## Wall elevations

The elevation tool renders an orthographic A4 technical wall scheme to PNG. You
can preview a single wall or generate a deterministic batch and package the
results in a ZIP file.

## Current-view snapshots

The current WebGL view can be placed on a high-resolution, low-ink A4 canvas and
saved as PNG. Set the camera, service visibility, room isolation, and X-ray
state before opening the snapshot workflow.

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
