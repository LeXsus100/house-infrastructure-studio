# Build a first project

Use a small, disposable model to learn the editor before recording a real
building. A single room, one panel, one outlet, and one route are enough.

## 1. Create the local project

On first launch, enter a project name. The app creates a UUID-backed workspace
and one empty ground floor. Add address, ownership, coordinates, and
construction details later when they belong in the record.

## 2. Establish the level

Open the level manager and set the floor name, elevation, and order. If you have
a plan image, add it as a blueprint, calibrate it with two known points, set its
opacity, and align its project origin before tracing geometry.

!!! tip

    Use a dimension that is visible and reliable on the plan. A long reference
    distance generally reduces calibration error compared with a very short one.

## 3. Draw space before services

Create wall centerlines and rooms. Keep the metric grid and measurement tools
visible while checking geometry. Set layered-wall details where assembly
information matters.

## 4. Place technical objects

Add an electrical panel and an outlet or another compatible pair of endpoints.
Set exact dimensions, mounting face, height, naming data, display color, and
ports. Furniture objects provide spatial and service references while staying
distinct from installed technical equipment.

## 5. Connect a route

Choose the correct service and route type, select free compatible ports, then
place route points in plan and elevation. Review the assigned tier, physical
width, bends, service color, and installation metadata.

## 6. Inspect the result

- Orbit, pan, zoom, and isolate the relevant room or object.
- Switch to the whole-house overview for inventory and room/zone reports.
- Review project diagnostics for clashes, excessive cable length, incomplete
  risers or correspondences, and unconnected devices.
- Generate a wall elevation or current-view PNG to check field readability.

## 7. Save and back up

Wait for autosave or use explicit Save, then export a JSON backup from the
toolbar. Keep that backup outside the application's own data directory. The
current JSON backup includes photo metadata. The binary photo files remain in
the project workspace; read [Backups and exports](../user-guide/backups-and-exports.md)
before relying on one backup format.
