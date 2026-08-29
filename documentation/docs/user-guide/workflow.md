# Recommended modelling workflow

The application is flexible, but sequence matters. Stable project coordinates,
floor elevations, wall geometry, and device ports reduce rework in every route
that depends on them.

## Project structure

```text
Project
├─ ordered floors and project origin
├─ walls, rooms, structures, and reference furniture
├─ technical devices, panels, junctions, racks, and ports
├─ cables, pipes, ducts, route points, and cross-floor risers
├─ lighting relationships and photo markers
├─ project settings, naming conventions, and diagnostics
└─ local assets and generated exports
```

## 1. Establish a coordinate system

Create and order the floors, enter their elevations, and choose a stable project
origin. When multiple floor blueprints are available, calibrate each image and
use registration anchors to align them before drawing shared risers.

Changing the spatial basis after services are routed can make technically valid
records visually wrong, so treat floor registration as an early design decision.

## 2. Model architectural context

Draw walls and rooms, then add openings, structures, or furniture references
needed to understand the installation. Use layered-wall metadata where the
assembly affects concealment or mounting.

The 3D viewport presents a technical schematic. Prioritize legible dimensions,
service relationships, and installation intent throughout the model.

## 3. Define conventions before repetition

Review Settings before creating many objects:

- route tiers and their vertical spacing;
- cable, pipe, and duct order and clearances;
- project naming conventions;
- category and service display colors;
- default device/furniture sizes and mounting backs;
- reusable device ports and rack layouts.

The color model deliberately separates functional meaning, physical product
color, user-facing display color, and the source of that color. Always keep a
text label or identifier alongside color.

## 4. Place endpoints before routes

Place panels, junction boxes, technical devices, furniture references, racks,
and equipment. Confirm mounting face, elevation, dimensions, association, and
connection-point positions. Routes connect explicit compatible ports. Reassign
an existing route before using its physical port for another connection.

## 5. Route one service at a time

Create cables, pipes, and ducts from known endpoints. Add route points only
where geometry or installation intent changes. Review service type, physical
width, route tier, line pattern, conductor or pair metadata, and installation
date as appropriate.

Use riser links for one-to-one same-service continuity between floors. Panel
and junction correspondences document logical relationships across separate
geometric routes.

## 6. Coordinate and diagnose

Use visibility filters and room isolation to simplify the current view. Then
review diagnostics for:

- three-dimensional route clashes;
- cable runs beyond the configured 10 m target plus 1 m tolerance;
- incomplete or invalid riser links and flow;
- invalid panel or junction correspondences;
- devices with no route attachment.

Route-cluster planning can preview coordinated before/after alternatives for an
affected set. Inspect its conflict, bend, and length metrics before applying the
change atomically.

## 7. Document what will be hidden

Use the Photo view and X-ray state to place local installation photographs in
context. Add installation metadata before surfaces are closed. Generate wall
elevations and current-view snapshots while the physical installation can still
be verified.

## 8. Save, back up, and review

Autosave writes after an 800 ms quiet period; explicit Save follows the same
validated transaction path. Export a JSON backup at meaningful milestones and
keep a separate copy. Before field use, review the whole-house overview,
inventory, room/zone organization, diagnostics, and elevations.
