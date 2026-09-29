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
opacity, align its project origin, and set north before tracing geometry. Use
**2D View** for a true orthographic plan while checking the alignment.

!!! tip

    Use a dimension that is visible and reliable on the plan. A long reference
    distance generally reduces calibration error compared with a very short one.

## 3. Draw space before services

Work in **Edit** mode. Create walls and rooms, then add doors, windows, columns,
stairs, and relevant furniture. Keep the metric grid and measurement tools
visible while checking geometry. Set the structural core and left/right lining
where the wall assembly affects route concealment or mounting.

## 4. Place technical objects

Add an electrical panel and an outlet or another compatible pair of endpoints.
Set exact dimensions, mounting face, height, naming data, display color, and
ports. Furniture objects provide spatial and service references while staying
distinct from installed technical equipment.

## 5. Connect a route

Choose the correct service and route type, select free compatible ports, then
place route points in plan and elevation. Review the assigned tier, physical
width, bends, gravity grade for pipes or ducts, service colour, flow, and
installation metadata. Press `X` to inspect and select the concealed result.

## 6. Inspect the result

- Orbit, pan, zoom, and isolate the relevant room or object.
- Switch between perspective and **2D View**.
- Enter **View** mode to inspect the model without editing panels.
- Switch to the whole-house overview for inventory and room/zone reports.
- Open Light to trace documented switch-to-light cable continuity.
- Review project diagnostics for clashes, excessive cable length, incomplete
  risers or correspondences, and unconnected devices.
- Generate a wall scheme or current-view PNG/PDF to check field readability.

## 7. Save and back up

Wait for autosave or use explicit Save, then export a JSON backup from the
toolbar. Keep that backup outside the application's own data directory. The
current JSON backup includes photo metadata. The binary photo files remain in
the project workspace; read [Backups and exports](../user-guide/backups-and-exports.md)
before relying on one backup format.

The [feature guide](../features/index.md) provides a visual map of the complete
0.3.0 interface.
