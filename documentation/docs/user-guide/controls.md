---
title: Controls
description: Mouse, camera, workspace modes, drawing behavior, selection, and keyboard shortcuts.
---

# Controls

<div class="his-page-lead">
  <span class="his-section-id">CONTROL MAP</span>
  <p>Use the mouse for camera movement and direct model interaction. Use the top toolbar for workspace and view state, and the left sidebar for creation tools.</p>
</div>

## At a glance

| Area | Main action |
| --- | --- |
| Camera | Right-drag to orbit, middle-drag to pan, wheel to zoom. |
| Edit or View | Choose whether the viewport accepts model edits or navigation only. |
| Normal or X-ray | Press `X` to reveal concealed routes and enable route selection. |
| 3D or 2D | Use **2D View** for a true orthographic floor plan. |
| Active floor or Full house | Select one level for editing, or display every floor at its true elevation. |
| Properties | Select an object in Edit mode; the right panel opens automatically. |

## NAV 01 · Camera and viewport

| Input | Action |
| --- | --- |
| Right mouse drag | Orbit the camera. Releasing the right button completes the gesture. |
| Middle mouse drag | Pan. |
| Mouse wheel | Zoom. Hold `Shift` for faster zoom. |
| **2D View** | Enter or leave the orthographic top view. |
| Reset camera | Return to the default project view. |
| North arrow | Align the camera to project north. |

Right-click is reserved for camera orbit throughout the viewport. Device,
furniture, and rack previews use the same right-drag, middle-drag, and wheel
controls.

## MODE 01 · Edit and View

=== "Edit"

    Creation, selection, Properties, undo, redo, clipboard actions, and deletion
    are available. The left and right sidebars have independent collapse
    controls.

=== "View"

    An unfinished drawing is cancelled and editor sidebars are hidden. The
    camera, floors, Full house, X-ray, 2D View, service filters, theme, and
    language remain available. **Capture current view** appears in the viewport.

Pressing `X` works in both workspaces. Returning to Edit restores the previous
sidebar state.

## DRAW 01 · Common drawing input

| Input | Action |
| --- | --- |
| Left click | Select, place, or add the next point for the active tool. |
| `Ctrl` + left click | Add another object of the same type to the current selection. During staircase drawing, add an intermediate corner. |
| Double-click | Close a room boundary. |
| `Shift` while placing | Temporarily bypass grid and wall snapping. |
| `Escape` | Cancel the current drawing and clear selection. |
| `Delete` or `Backspace` | Cancel an unfinished drawing; in Select mode, delete the selection. |

### Exact wall length

1. Choose **Wall** or press `W`.
2. Click the first point.
3. Point the cursor in the intended direction.
4. Type the length in metres.
5. Press `Enter`.

Both `.` and `,` are accepted as decimal separators. `Backspace` edits the
pending value. A green target shows the snapped location. Wall snapping can
project to any point along an existing wall, including endpoints and the
midpoint.

### Staircase path

Choose **Structure → Staircase**, click the start, use `Ctrl` + left click for
each intermediate corner, then use a regular left click for the final point.

## SELECT 01 · Selection and Properties

Normal view selects walls, structures, and technical devices. X-ray also
selects routes. Through a transparent wall, a visible route or device receives
selection priority; clicking a clear part of the wall selects the wall.

Use `Ctrl` + left click for a multi-selection of the same object type. Locking
the selection in Properties protects it from edits and deletion. Selecting a
room activates its floor, isolates the space, and fits the camera. Click empty
space to leave room isolation.

Wall-mounted objects use the clicked wall face as their exact mounting
location. The configured BACK face remains in contact with that surface.

## ROUTE 01 · Route creation

1. Choose **Route** or press `E`.
2. Select Cable, Pipe, Duct, Junction, or Floor transition.
3. For a cable, pipe, or duct, choose its service.
4. Click the source device and select a compatible port.
5. Add guidance points where the intended path changes.
6. Click the destination device and select its port.

The port chooser keeps incompatible directions visible and disabled. Occupied
ports show their current relationship and can be reassigned deliberately. When
a compatible port is missing, use the embedded 3D editor to place one on the
device and resume the route.

Select a saved route in X-ray to change its A/B flow, installation data,
technical specification, or authored turning points. The full planning and
clearance behavior is described in [X-ray and routes](../features/xray-and-routes.md).

## MEASURE 01 · Measurements

Choose **Measure** or press `M`. Click the first location, then choose the exact
target from the picker. Repeat for the second point. This resolves overlapping
geometry explicitly and stores both object references with the annotation.

Click the measurement line or value label to select it. Properties can add
custom text; the calculated metric length remains part of the displayed label.

## FLOOR 01 · Levels, rooms, and visibility

- Select a numbered level to work on that floor.
- Use **Full house** to display all floors together.
- Open **Services** for All/None actions, category visibility, photo filters,
  and photo-point placement.
- Open **Rooms** for the active floor's room list and room-category management.
- Use the level manager to add, reorder, edit, or delete floors and to calibrate
  blueprint underlays.

## Keyboard reference

### Creation and view

| Shortcut | Action |
| --- | --- |
| `W` | Wall tool. |
| `R` | Room tool. |
| `T` | Structure tool, initially using Door opening. |
| `D` | Device tool. |
| `E` | Route tool. |
| `C` | Technical container tool. |
| `M` | Measurement tool. |
| `S` | Select tool. |
| `X` | Toggle X-ray. |

### Project editing

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` | Save immediately. |
| `Ctrl+Z` | Undo. |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo. |
| `Ctrl+C` / `Ctrl+V` | Copy and paste the selected wall, device, or route. |
| `Ctrl+D` | Duplicate the selection. |
| `Delete` or `Backspace` | Cancel drawing or delete the current selection. |
| `Escape` | Cancel drawing and clear selection. |

Typing in a field suspends editor shortcuts. View mode pauses creation,
clipboard, deletion, undo, and redo commands while retaining the `X` shortcut.

Continue with [Editor and view modes](../features/editor-and-views.md) for the
workspace structure, or [Settings](../features/settings.md) for grid, snapping,
route rules, and motion preferences.
